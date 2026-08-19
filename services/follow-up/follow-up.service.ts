import { Prisma, PrismaClient } from "@prisma/client";
import type {
  FollowUpCampaignStatus,
  FollowUpRecipientStatus,
  FollowUpStepStatus,
} from "@prisma/client";
import type {
  CreateCampaignInput,
  UpdateCampaignInput,
  AddRecipientsInput,
  CampaignStats,
  CampaignListItem,
  CampaignDetail,
  VariableContext,
} from "./follow-up.types";

type PrismaTx = Prisma.TransactionClient | PrismaClient;

/**
 * Batch size for large recipient operations.
 *
 * This prevents thousands of individual Prisma queries from
 * running inside a single interactive transaction.
 */
const RECIPIENT_BATCH_SIZE = 500;

/**
 * Replace template variables in subject/body.
 */
export function replaceVariables(
  text: string,
  ctx: VariableContext
): string {
  const firstName = ctx.name?.split(" ")[0] || ctx.name || "";

  return text
    .replace(/\{\{name\}\}/gi, firstName)
    .replace(/\{\{full_name\}\}/gi, ctx.name || "")
    .replace(/\{\{email\}\}/gi, ctx.email || "")
    .replace(/\{\{company\}\}/gi, ctx.company || "")
    .replace(/\{\{website\}\}/gi, ctx.website || "");
}

/**
 * Parse "HH:mm" into hours and minutes.
 */
function parseTime(time: string): { hours: number; minutes: number } {
  const [h, m] = time.split(":").map((v) => parseInt(v, 10));

  return {
    hours: Number.isFinite(h) ? h : 9,
    minutes: Number.isFinite(m) ? m : 0,
  };
}

/**
 * Get current date/time parts in a given IANA timezone.
 */
export function getZonedParts(
  date: Date,
  timezone: string
): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number;
} {
  try {
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      weekday: "short",
    });

    const parts = dtf.formatToParts(date);

    const get = (type: string) =>
      parts.find((p) => p.type === type)?.value ?? "0";

    const weekdayMap: Record<string, number> = {
      Sun: 0,
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
    };

    return {
      year: parseInt(get("year"), 10),
      month: parseInt(get("month"), 10),
      day: parseInt(get("day"), 10),
      hour: parseInt(get("hour"), 10) % 24,
      minute: parseInt(get("minute"), 10),
      weekday: weekdayMap[get("weekday")] ?? 0,
    };
  } catch {
    return {
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate(),
      hour: date.getUTCHours(),
      minute: date.getUTCMinutes(),
      weekday: date.getUTCDay(),
    };
  }
}

/**
 * Check whether `now` falls inside the campaign sending window
 * in the campaign timezone.
 */
export function isWithinSendingWindow(
  now: Date,
  timezone: string,
  sendingStart: string,
  sendingEnd: string
): boolean {
  const parts = getZonedParts(now, timezone);

  const start = parseTime(sendingStart);
  const end = parseTime(sendingEnd);

  const currentMinutes = parts.hour * 60 + parts.minute;
  const startMinutes = start.hours * 60 + start.minutes;
  const endMinutes = end.hours * 60 + end.minutes;

  if (startMinutes <= endMinutes) {
    return (
      currentMinutes >= startMinutes &&
      currentMinutes < endMinutes
    );
  }

  return (
    currentMinutes >= startMinutes ||
    currentMinutes < endMinutes
  );
}

/**
 * Add `days` calendar days to a date.
 */
export function addDays(date: Date, days: number): Date {
  const d = new Date(date.getTime());

  d.setUTCDate(d.getUTCDate() + days);

  return d;
}

/**
 * Compute the first scheduledAt for a recipient's first enabled step.
 */
export function computeFirstScheduledAt(
  base: Date,
  delayDays: number
): Date {
  return addDays(base, Math.max(1, delayDays));
}

/**
 * Aggregate recipient-level stats for a campaign.
 */
export function computeCampaignStats(
  recipients: Array<{ status: FollowUpRecipientStatus }>
): CampaignStats {
  const total = recipients.length;

  let pending = 0;
  let running = 0;
  let replied = 0;
  let completed = 0;
  let failed = 0;
  let stopped = 0;

  for (const r of recipients) {
    switch (r.status) {
      case "PENDING":
        pending++;
        break;

      case "RUNNING":
        running++;
        break;

      case "REPLIED":
        replied++;
        break;

      case "COMPLETED":
        completed++;
        break;

      case "FAILED":
        failed++;
        break;

      case "STOPPED":
        stopped++;
        break;
    }
  }

  const sent =
    running +
    replied +
    completed +
    failed;

  const remaining = pending + running;

  const done =
    replied +
    completed +
    failed +
    stopped;

  const progress =
    total === 0
      ? 0
      : Math.min(
          100,
          Math.round((done / total) * 100)
        );

  return {
    total,
    pending,
    running,
    sent,
    replied,
    completed,
    failed,
    stopped,
    remaining,
    progress,
  };
}

/**
 * Verify campaign ownership.
 */
export async function getOwnedCampaign(
  prisma: PrismaTx,
  campaignId: string,
  userId: string
) {
  return prisma.followUpCampaign.findFirst({
    where: {
      id: campaignId,
      userId,
    },
  });
}

/**
 * Create a full campaign with steps, recipients,
 * and recipient-steps.
 *
 * IMPORTANT:
 * Large recipient operations are processed in batches
 * instead of one giant interactive transaction.
 */
export async function createCampaign(
  prisma: PrismaClient,
  userId: string,
  input: CreateCampaignInput
) {
  const {
    name,
    smtpConfigIds,
    selectedTemplateIds,
    campaignType,
    stopOnReply = true,
    intervalValue = 1,
    intervalUnit = "minutes",
    dailyLimit = 50,
    greetingEnabled = true,
    spinTextEnabled = true,
    timezone = "Asia/Karachi",
    sendingStart = "09:00",
    sendingEnd = "18:00",
    scheduledAt,
    recipientEmailIds,
    steps,
  } = input;

  if (!name?.trim()) {
    throw new Error("Campaign name is required");
  }

  if (!Array.isArray(steps) || steps.length === 0) {
    throw new Error(
      "At least one follow-up step is required"
    );
  }

  if (
    !Array.isArray(recipientEmailIds) ||
    recipientEmailIds.length === 0
  ) {
    throw new Error(
      "At least one recipient is required"
    );
  }

  if (
    !Array.isArray(smtpConfigIds) ||
    smtpConfigIds.length === 0
  ) {
    throw new Error(
      "At least one SMTP configuration is required"
    );
  }

  const uniqueSmtpIds = Array.from(
    new Set(smtpConfigIds)
  );

  const smtpAccounts =
    await prisma.sMTPConfig.findMany({
      where: {
        id: {
          in: uniqueSmtpIds,
        },
        userId,
      },
    });

  if (
    smtpAccounts.length !== uniqueSmtpIds.length
  ) {
    throw new Error(
      "One or more SMTP configurations were not found or do not belong to you"
    );
  }

  /**
   * Validate emails belong to user and are unique.
   */
  const uniqueEmailIds = Array.from(
    new Set(recipientEmailIds)
  );

  const emails = await prisma.email.findMany({
    where: {
      id: {
        in: uniqueEmailIds,
      },
      userId,
    },
  });

  if (
    emails.length !== uniqueEmailIds.length
  ) {
    throw new Error(
      "One or more emails were not found or do not belong to you"
    );
  }

  /**
   * Normalize steps.
   */
  const normalizedSteps = steps
    .map((s, idx) => ({
      stepNumber:
        s.stepNumber ?? idx + 1,

      delayDays: Math.max(
        1,
        s.delayDays ?? 1
      ),

      subject:
        (s.subject || "").trim(),

      body:
        s.body || "",

      enabled:
        s.enabled !== false,

      selectedTemplateIds:
        Array.from(
          new Set(
            idx === 0
              ? [
                  ...(selectedTemplateIds || []),
                  ...(s.selectedTemplateIds || []),
                ]
              : [
                  ...(s.selectedTemplateIds || []),
                ]
          )
        ),
    }))
    .filter(
      (s) => s.subject.length > 0
    );

  if (
    normalizedSteps.length === 0
  ) {
    throw new Error(
      "At least one valid follow-up step with a subject is required"
    );
  }

  const scheduleBase =
    scheduledAt != null
      ? new Date(scheduledAt)
      : new Date();

  const campaignStatus: FollowUpCampaignStatus =
    scheduledAt &&
    new Date(scheduledAt) > new Date()
      ? "SCHEDULED"
      : "DRAFT";

  /**
   * ============================================================
   * CREATE CAMPAIGN + STEPS
   * ============================================================
   *
   * This transaction only contains campaign-level data.
   * It does NOT contain 4000 recipient inserts.
   */
  const campaign =
    await prisma.$transaction(
      async (tx) => {
        return tx.followUpCampaign.create({
          data: {
            userId,

            smtpConfigs: {
              connect:
                uniqueSmtpIds.map(
                  (id) => ({
                    id,
                  })
                ),
            },

            name: name.trim(),

            campaignType,

            status:
              campaignStatus,

            stopOnReply,

            intervalValue,

            intervalUnit,

            dailyLimit,

            greetingEnabled,

            spinTextEnabled,

            timezone,

            sendingStart,

            sendingEnd,

            scheduledAt:
              scheduledAt
                ? new Date(
                    scheduledAt
                  )
                : null,

            steps: {
              create:
                normalizedSteps.map(
                  (s) => ({
                    stepNumber:
                      s.stepNumber,

                    delayDays:
                      s.delayDays,

                    subject:
                      s.subject,

                    body:
                      s.body,

                    enabled:
                      s.enabled,

                    templates:
                      s.selectedTemplateIds
                        .length > 0
                        ? {
                            connect:
                              s.selectedTemplateIds.map(
                                (
                                  id
                                ) => ({
                                  id,
                                })
                              ),
                          }
                        : undefined,
                  })
                ),
            },
          },

          include: {
            steps: {
              orderBy: {
                stepNumber:
                  "asc",
              },

              include: {
                templates: true,
              },
            },
          },
        });
      },
      {
        maxWait: 10000,
        timeout: 30000,
      }
    );

  /**
   * ============================================================
   * ENABLED STEPS
   * ============================================================
   */
  const enabledSteps =
    campaign.steps.filter(
      (s) => s.enabled
    );

  const firstStep =
    enabledSteps[0];

  if (!firstStep) {
    throw new Error(
      "Campaign has no enabled steps"
    );
  }

  /**
   * Calculate first schedule once.
   */
  const firstScheduledAt =
    campaignType === "EMAIL"
      ? scheduleBase
      : computeFirstScheduledAt(
          scheduleBase,
          firstStep.delayDays
        );

  /**
   * ============================================================
   * CREATE RECIPIENTS IN BATCHES
   * ============================================================
   */
  for (
    let i = 0;
    i < emails.length;
    i += RECIPIENT_BATCH_SIZE
  ) {
    const emailBatch =
      emails.slice(
        i,
        i + RECIPIENT_BATCH_SIZE
      );

    /**
     * Insert recipients in bulk.
     */
    await prisma.followUpRecipient.createMany(
      {
        data: emailBatch.map(
          (email) => ({
            campaignId:
              campaign.id,

            emailId:
              email.id,

            status:
              "PENDING",

            currentStep:
              0,

            nextStepAt:
              firstScheduledAt,
          })
        ),
      }
    );

    /**
     * Fetch only the recipients from this batch.
     */
    const createdRecipients =
      await prisma.followUpRecipient.findMany(
        {
          where: {
            campaignId:
              campaign.id,

            emailId: {
              in: emailBatch.map(
                (email) =>
                  email.id
              ),
            },
          },

          select: {
            id: true,
            emailId: true,
          },
        }
      );

    /**
     * Create all recipient-step rows
     * in one bulk query.
     */
    const recipientStepData =
      createdRecipients.flatMap(
        (recipient) =>
          campaign.steps.map(
            (step) => ({
              recipientId:
                recipient.id,

              stepId:
                step.id,

              status:
                "PENDING" as FollowUpStepStatus,

              scheduledAt:
                firstStep &&
                step.id ===
                  firstStep.id
                  ? firstScheduledAt
                  : null,
            })
          )
      );

    if (
      recipientStepData.length >
      0
    ) {
      await prisma.followUpRecipientStep.createMany(
        {
          data:
            recipientStepData,
        }
      );
    }
  }

  /**
   * ============================================================
   * RETURN FULL CAMPAIGN
   * ============================================================
   *
   * This is intentionally outside the transaction.
   * This prevents a huge 4000-recipient nested query from
   * extending the transaction lifetime.
   */
  return prisma.followUpCampaign.findUniqueOrThrow(
    {
      where: {
        id: campaign.id,
      },

      include: {
        steps: {
          orderBy: {
            stepNumber: "asc",
          },

          include: {
            templates: true,
          },
        },

        recipients: {
          include: {
            email: true,

            steps: {
              include: {
                step: {
                  include: {
                    templates: true,
                  },
                },
              },

              orderBy: {
                step: {
                  stepNumber:
                    "asc",
                },
              },
            },
          },

          orderBy: {
            createdAt: "asc",
          },
        },

        smtpConfigs: true,
      },
    }
  );
}

/**
 * List campaigns for a user with aggregated stats.
 */
export async function listCampaigns(
  prisma: PrismaClient,
  userId: string
): Promise<CampaignListItem[]> {
  const campaigns =
    await prisma.followUpCampaign.findMany({
      where: {
        userId,
      },

      include: {
        smtpConfigs: true,

        steps: {
          orderBy: {
            stepNumber:
              "asc",
          },

          include: {
            templates: true,
          },
        },

        recipients: {
          select: {
            status: true,
          },
        },

        _count: {
          select: {
            recipients: true,
          },
        },
      },

      orderBy: {
        createdAt:
          "desc",
      },
    });

  return campaigns.map(
    (c) => {
      const {
        recipients,
        ...rest
      } = c;

      return {
        ...rest,

        stats:
          computeCampaignStats(
            recipients
          ),
      };
    }
  );
}

/**
 * Get full campaign detail with ownership check.
 */
export async function getCampaignDetail(
  prisma: PrismaClient,
  campaignId: string,
  userId: string
): Promise<CampaignDetail | null> {
  const campaign =
    await prisma.followUpCampaign.findFirst(
      {
        where: {
          id: campaignId,
          userId,
        },

        include: {
          steps: {
            orderBy: {
              stepNumber:
                "asc",
            },
          },

          recipients: {
            include: {
              email: true,

              steps: {
                include: {
                  step: true,
                },

                orderBy: {
                  step: {
                    stepNumber:
                      "asc",
                  },
                },
              },
            },

            orderBy: {
              createdAt:
                "asc",
            },
          },

          smtpConfigs: true,
        },
      }
    );

  if (!campaign) {
    return null;
  }

  const stats =
    computeCampaignStats(
      campaign.recipients
    );

  return {
    ...campaign,
    stats,
  };
}

/**
 * Update campaign fields (owner only).
 */
export async function updateCampaign(
  prisma: PrismaClient,
  campaignId: string,
  userId: string,
  input: UpdateCampaignInput
) {
  const existing =
    await getOwnedCampaign(
      prisma,
      campaignId,
      userId
    );

  if (!existing) {
    throw new Error(
      "Campaign not found"
    );
  }

  if (
    existing.status ===
      "COMPLETED" ||
    existing.status ===
      "STOPPED"
  ) {
    if (
      input.status !==
        undefined ||
      input.smtpConfigIds !==
        undefined ||
      input.scheduledAt !==
        undefined
    ) {
      throw new Error(
        "Cannot modify a completed or stopped campaign"
      );
    }
  }

  let uniqueSmtpIds:
    | string[]
    | undefined;

  if (
    input.smtpConfigIds !==
    undefined
  ) {
    uniqueSmtpIds =
      Array.from(
        new Set(
          input.smtpConfigIds
        )
      );

    if (
      uniqueSmtpIds.length ===
      0
    ) {
      throw new Error(
        "At least one SMTP configuration is required"
      );
    }

    const smtpAccounts =
      await prisma.sMTPConfig.findMany(
        {
          where: {
            id: {
              in: uniqueSmtpIds,
            },

            userId,
          },
        }
      );

    if (
      smtpAccounts.length !==
      uniqueSmtpIds.length
    ) {
      throw new Error(
        "One or more SMTP configurations were not found or do not belong to you"
      );
    }
  }

  const data: Prisma.FollowUpCampaignUpdateInput =
    {};

  if (
    input.name !==
    undefined
  ) {
    data.name =
      input.name.trim();
  }

  if (
    uniqueSmtpIds !==
    undefined
  ) {
    data.smtpConfigs = {
      set:
        uniqueSmtpIds.map(
          (id) => ({
            id,
          })
        ),
    };
  }

  if (
    input.stopOnReply !==
    undefined
  ) {
    data.stopOnReply =
      input.stopOnReply;
  }

  if (
    input.timezone !==
    undefined
  ) {
    data.timezone =
      input.timezone;
  }

  if (
    input.sendingStart !==
    undefined
  ) {
    data.sendingStart =
      input.sendingStart;
  }

  if (
    input.sendingEnd !==
    undefined
  ) {
    data.sendingEnd =
      input.sendingEnd;
  }

  if (
    input.scheduledAt !==
    undefined
  ) {
    data.scheduledAt =
      input.scheduledAt
        ? new Date(
            input.scheduledAt
          )
        : null;
  }

  if (
    input.status !==
    undefined
  ) {
    data.status =
      input.status;
  }

  return prisma.followUpCampaign.update(
    {
      where: {
        id: campaignId,
      },

      data,

      include: {
        steps: {
          orderBy: {
            stepNumber:
              "asc",
          },
        },

        recipients: {
          include: {
            email: true,
          },
        },

        smtpConfigs: true,
      },
    }
  );
}

/**
 * Soft-safe delete.
 */
export async function deleteCampaign(
  prisma: PrismaClient,
  campaignId: string,
  userId: string
) {
  const existing =
    await getOwnedCampaign(
      prisma,
      campaignId,
      userId
    );

  if (!existing) {
    throw new Error(
      "Campaign not found"
    );
  }

  await prisma.followUpCampaign.delete(
    {
      where: {
        id: campaignId,
      },
    }
  );

  return {
    id: campaignId,
  };
}

/**
 * Start a campaign.
 */
export async function startCampaign(
  prisma: PrismaClient,
  campaignId: string,
  userId: string
) {
  const campaign =
    await prisma.followUpCampaign.findFirst(
      {
        where: {
          id: campaignId,
          userId,
        },

        include: {
          steps: {
            orderBy: {
              stepNumber:
                "asc",
            },
          },

          recipients: {
            include: {
              steps: {
                include: {
                  step: true,
                },

                orderBy: {
                  step: {
                    stepNumber:
                      "asc",
                  },
                },
              },
            },
          },
        },
      }
    );

  if (!campaign) {
    throw new Error(
      "Campaign not found"
    );
  }

  if (
    campaign.status ===
    "RUNNING"
  ) {
    return campaign;
  }

  if (
    campaign.status ===
      "COMPLETED" ||
    campaign.status ===
      "STOPPED"
  ) {
    throw new Error(
      "Cannot start a completed or stopped campaign"
    );
  }

  if (
    campaign.recipients
      .length === 0
  ) {
    throw new Error(
      "Campaign has no recipients"
    );
  }

  const enabledSteps =
    campaign.steps.filter(
      (s) => s.enabled
    );

  if (
    enabledSteps.length ===
    0
  ) {
    throw new Error(
      "Campaign has no enabled steps"
    );
  }

  const now =
    new Date();

  const firstStep =
    enabledSteps[0];

  /**
   * Keep transaction timeout higher for this operation,
   * while preserving the original logic.
   */
  return prisma.$transaction(
    async (tx) => {
      for (
        const recipient of
        campaign.recipients
      ) {
        if (
          recipient.status ===
            "REPLIED" ||
          recipient.status ===
            "COMPLETED" ||
          recipient.status ===
            "STOPPED" ||
          recipient.status ===
            "FAILED"
        ) {
          continue;
        }

        let nextStepAt =
          recipient.nextStepAt;

        if (!nextStepAt) {
          nextStepAt =
            computeFirstScheduledAt(
              now,
              firstStep.delayDays
            );

          await tx.followUpRecipient.update(
            {
              where: {
                id: recipient.id,
              },

              data: {
                nextStepAt,
                status:
                  "PENDING",
              },
            }
          );
        }

        const firstRecipientStep =
          recipient.steps.find(
            (rs) =>
              rs.stepId ===
                firstStep.id &&
              rs.status ===
                "PENDING"
          );

        if (
          firstRecipientStep &&
          !firstRecipientStep.scheduledAt
        ) {
          await tx.followUpRecipientStep.update(
            {
              where: {
                id: firstRecipientStep.id,
              },

              data: {
                scheduledAt:
                  nextStepAt,
              },
            }
          );
        }
      }

      return tx.followUpCampaign.update(
        {
          where: {
            id: campaignId,
          },

          data: {
            status:
              "RUNNING",
          },

          include: {
            steps: {
              orderBy: {
                stepNumber:
                  "asc",
              },
            },

            recipients: {
              include: {
                email: true,
              },
            },
          },
        }
      );
    },
    {
      maxWait: 10000,
      timeout: 60000,
    }
  );
}

/**
 * Pause: RUNNING -> PAUSED
 */
export async function pauseCampaign(
  prisma: PrismaClient,
  campaignId: string,
  userId: string
) {
  const campaign =
    await getOwnedCampaign(
      prisma,
      campaignId,
      userId
    );

  if (!campaign) {
    throw new Error(
      "Campaign not found"
    );
  }

  if (
    campaign.status !==
    "RUNNING"
  ) {
    throw new Error(
      "Only running campaigns can be paused"
    );
  }

  return prisma.followUpCampaign.update(
    {
      where: {
        id: campaignId,
      },

      data: {
        status: "PAUSED",
      },
    }
  );
}

/**
 * Resume: PAUSED -> RUNNING.
 */
export async function resumeCampaign(
  prisma: PrismaClient,
  campaignId: string,
  userId: string
) {
  const campaign =
    await prisma.followUpCampaign.findFirst(
      {
        where: {
          id: campaignId,
          userId,
        },

        include: {
          steps: {
            orderBy: {
              stepNumber:
                "asc",
            },
          },

          recipients: {
            where: {
              status: {
                in: [
                  "PENDING",
                  "RUNNING",
                ],
              },
            },

            include: {
              steps: {
                where: {
                  status:
                    "PENDING",
                },

                include: {
                  step: true,
                },

                orderBy: {
                  step: {
                    stepNumber:
                      "asc",
                  },
                },
              },
            },
          },
        },
      }
    );

  if (!campaign) {
    throw new Error(
      "Campaign not found"
    );
  }

  if (
    campaign.status !==
    "PAUSED"
  ) {
    throw new Error(
      "Only paused campaigns can be resumed"
    );
  }

  const now =
    new Date();

  return prisma.$transaction(
    async (tx) => {
      for (
        const recipient of
        campaign.recipients
      ) {
        if (
          recipient.nextStepAt &&
          recipient.nextStepAt <
            now
        ) {
          await tx.followUpRecipient.update(
            {
              where: {
                id: recipient.id,
              },

              data: {
                nextStepAt:
                  now,
              },
            }
          );
        }

        const nextPending =
          recipient.steps[0];

        if (
          nextPending &&
          nextPending.scheduledAt &&
          nextPending.scheduledAt <
            now
        ) {
          await tx.followUpRecipientStep.update(
            {
              where: {
                id: nextPending.id,
              },

              data: {
                scheduledAt:
                  now,
              },
            }
          );
        }
      }

      return tx.followUpCampaign.update(
        {
          where: {
            id: campaignId,
          },

          data: {
            status:
              "RUNNING",
          },
        }
      );
    },
    {
      maxWait: 10000,
      timeout: 60000,
    }
  );
}

/**
 * Stop campaign and cancel all pending recipient steps.
 */
export async function stopCampaign(
  prisma: PrismaClient,
  campaignId: string,
  userId: string
) {
  const campaign =
    await getOwnedCampaign(
      prisma,
      campaignId,
      userId
    );

  if (!campaign) {
    throw new Error(
      "Campaign not found"
    );
  }

  if (
    campaign.status ===
      "STOPPED" ||
    campaign.status ===
      "COMPLETED"
  ) {
    return campaign;
  }

  return prisma.$transaction(
    async (tx) => {
      const recipients =
        await tx.followUpRecipient.findMany(
          {
            where: {
              campaignId,

              status: {
                in: [
                  "PENDING",
                  "RUNNING",
                ],
              },
            },

            select: {
              id: true,
            },
          }
        );

      const recipientIds =
        recipients.map(
          (r) => r.id
        );

      if (
        recipientIds.length >
        0
      ) {
        await tx.followUpRecipientStep.updateMany(
          {
            where: {
              recipientId: {
                in: recipientIds,
              },

              status: {
                in: [
                  "PENDING",
                  "SENDING",
                ],
              },
            },

            data: {
              status:
                "CANCELLED",
            },
          }
        );

        await tx.followUpRecipient.updateMany(
          {
            where: {
              id: {
                in: recipientIds,
              },
            },

            data: {
              status:
                "STOPPED",

              nextStepAt:
                null,
            },
          }
        );
      }

      return tx.followUpCampaign.update(
        {
          where: {
            id: campaignId,
          },

          data: {
            status:
              "STOPPED",
          },
        }
      );
    },
    {
      maxWait: 10000,
      timeout: 30000,
    }
  );
}

/**
 * Campaign stats endpoint helper.
 */
export async function getCampaignStats(
  prisma: PrismaClient,
  campaignId: string,
  userId: string
): Promise<CampaignStats> {
  const campaign =
    await prisma.followUpCampaign.findFirst(
      {
        where: {
          id: campaignId,
          userId,
        },

        include: {
          recipients: {
            select: {
              status: true,
            },
          },
        },
      }
    );

  if (!campaign) {
    throw new Error(
      "Campaign not found"
    );
  }

  return computeCampaignStats(
    campaign.recipients
  );
}

/**
 * Add recipients to an existing campaign.
 *
 * Uses createMany + batches instead of one transaction
 * containing thousands of individual creates.
 */
export async function addRecipients(
  prisma: PrismaClient,
  userId: string,
  input: AddRecipientsInput
) {
  const {
    campaignId,
    emailIds,
  } = input;

  if (
    !Array.isArray(emailIds) ||
    emailIds.length === 0
  ) {
    throw new Error(
      "emailIds is required"
    );
  }

  const campaign =
    await prisma.followUpCampaign.findFirst(
      {
        where: {
          id: campaignId,
          userId,
        },

        include: {
          steps: {
            orderBy: {
              stepNumber:
                "asc",
            },
          },
        },
      }
    );

  if (!campaign) {
    throw new Error(
      "Campaign not found"
    );
  }

  if (
    campaign.status ===
      "STOPPED" ||
    campaign.status ===
      "COMPLETED"
  ) {
    throw new Error(
      "Cannot add recipients to a stopped or completed campaign"
    );
  }

  const uniqueEmailIds =
    Array.from(
      new Set(emailIds)
    );

  const emails =
    await prisma.email.findMany(
      {
        where: {
          id: {
            in: uniqueEmailIds,
          },

          userId,
        },
      }
    );

  if (
    emails.length !==
    uniqueEmailIds.length
  ) {
    throw new Error(
      "One or more emails were not found or do not belong to you"
    );
  }

  /**
   * Existing recipients.
   */
  const existing =
    await prisma.followUpRecipient.findMany(
      {
        where: {
          campaignId,

          emailId: {
            in: uniqueEmailIds,
          },
        },

        select: {
          emailId: true,
        },
      }
    );

  const existingSet =
    new Set(
      existing.map(
        (e) => e.emailId
      )
    );

  const toAdd =
    emails.filter(
      (e) =>
        !existingSet.has(
          e.id
        )
    );

  if (
    toAdd.length === 0
  ) {
    return {
      added: 0,
      recipients: [],
    };
  }

  const enabledSteps =
    campaign.steps.filter(
      (s) => s.enabled
    );

  const firstStep =
    enabledSteps[0];

  const now =
    new Date();

  const base =
    campaign.scheduledAt &&
    campaign.scheduledAt >
      now
      ? campaign.scheduledAt
      : now;

  /**
   * We keep track of created recipient IDs
   * so we can return the same data structure.
   */
  const createdRecipientIds:
    string[] = [];

  /**
   * ============================================================
   * BATCH INSERT
   * ============================================================
   */
  for (
    let i = 0;
    i < toAdd.length;
    i += RECIPIENT_BATCH_SIZE
  ) {
    const emailBatch =
      toAdd.slice(
        i,
        i + RECIPIENT_BATCH_SIZE
      );

    const firstScheduledAt =
      campaign.campaignType ===
      "EMAIL"
        ? base
        : firstStep
          ? computeFirstScheduledAt(
              base,
              firstStep.delayDays
            )
          : null;

    /**
     * Insert recipients.
     */
    await prisma.followUpRecipient.createMany(
      {
        data: emailBatch.map(
          (email) => ({
            campaignId,

            emailId:
              email.id,

            status:
              "PENDING",

            currentStep:
              0,

            nextStepAt:
              firstScheduledAt,
          })
        ),
      }
    );

    /**
     * Get newly inserted recipients.
     */
    const createdRecipients =
      await prisma.followUpRecipient.findMany(
        {
          where: {
            campaignId,

            emailId: {
              in: emailBatch.map(
                (email) =>
                  email.id
              ),
            },
          },

          select: {
            id: true,
            emailId: true,
          },
        }
      );

    /**
     * Keep IDs for final result.
     */
    createdRecipientIds.push(
      ...createdRecipients.map(
        (r) => r.id
      )
    );

    /**
     * Build recipient-step rows.
     */
    const recipientStepData =
      createdRecipients.flatMap(
        (recipient) =>
          campaign.steps.map(
            (step) => ({
              recipientId:
                recipient.id,

              stepId:
                step.id,

              status:
                "PENDING" as FollowUpStepStatus,

              scheduledAt:
                firstStep &&
                step.id ===
                  firstStep.id
                  ? firstScheduledAt
                  : null,
            })
          )
      );

    if (
      recipientStepData.length >
      0
    ) {
      await prisma.followUpRecipientStep.createMany(
        {
          data:
            recipientStepData,
        }
      );
    }
  }

  /**
   * Return created recipients in the
   * same general structure as before.
   */
  const created =
    await prisma.followUpRecipient.findMany(
      {
        where: {
          id: {
            in:
              createdRecipientIds,
          },
        },

        include: {
          email: true,

          steps: {
            include: {
              step: true,
            },
          },
        },

        orderBy: {
          createdAt:
            "asc",
        },
      }
    );

  return {
    added:
      created.length,

    recipients:
      created,
  };
}

/**
 * Remove a recipient.
 */
export async function removeRecipient(
  prisma: PrismaClient,
  recipientId: string,
  userId: string
) {
  const recipient =
    await prisma.followUpRecipient.findFirst(
      {
        where: {
          id: recipientId,
        },

        include: {
          campaign: {
            select: {
              userId: true,
              status: true,
            },
          },
        },
      }
    );

  if (
    !recipient ||
    recipient.campaign.userId !==
      userId
  ) {
    throw new Error(
      "Recipient not found"
    );
  }

  await prisma.followUpRecipient.delete(
    {
      where: {
        id: recipientId,
      },
    }
  );

  return {
    id: recipientId,
  };
}

/**
 * Mark a recipient as REPLIED and cancel future steps.
 */
export async function handleRecipientReply(
  prisma: PrismaClient,
  params: {
    campaignId: string;
    emailAddress: string;
    repliedAt?: Date;
  }
) {
  const {
    campaignId,
    emailAddress,
    repliedAt =
      new Date(),
  } = params;

  const campaign =
    await prisma.followUpCampaign.findUnique(
      {
        where: {
          id: campaignId,
        },

        select: {
          id: true,
          stopOnReply: true,
          status: true,
        },
      }
    );

  if (
    !campaign ||
    !campaign.stopOnReply
  ) {
    return null;
  }

  if (
    campaign.status ===
      "STOPPED" ||
    campaign.status ===
      "COMPLETED"
  ) {
    return null;
  }

  const recipient =
    await prisma.followUpRecipient.findFirst(
      {
        where: {
          campaignId,

          email: {
            email:
              emailAddress,
          },

          status: {
            in: [
              "PENDING",
              "RUNNING",
            ],
          },
        },
      }
    );

  if (!recipient) {
    return null;
  }

  return prisma.$transaction(
    async (tx) => {
      await tx.followUpRecipientStep.updateMany(
        {
          where: {
            recipientId:
              recipient.id,

            status: {
              in: [
                "PENDING",
                "SENDING",
              ],
            },
          },

          data: {
            status:
              "CANCELLED",
          },
        }
      );

      const updated =
        await tx.followUpRecipient.update(
          {
            where: {
              id: recipient.id,
            },

            data: {
              status:
                "REPLIED",

              repliedAt,

              nextStepAt:
                null,
            },
          }
        );

      await maybeCompleteCampaign(
        tx,
        campaignId
      );

      return updated;
    },
    {
      maxWait: 10000,
      timeout: 30000,
    }
  );
}

/**
 * If every recipient is in a terminal state,
 * mark campaign COMPLETED.
 */
export async function maybeCompleteCampaign(
  prisma: PrismaTx,
  campaignId: string
) {
  const remaining =
    await prisma.followUpRecipient.count(
      {
        where: {
          campaignId,

          status: {
            in: [
              "PENDING",
              "RUNNING",
            ],
          },
        },
      }
    );

  if (
    remaining === 0
  ) {
    await prisma.followUpCampaign.update(
      {
        where: {
          id: campaignId,
        },

        data: {
          status:
            "COMPLETED",
        },
      }
    );
  }
}