import { prisma } from "@/lib/follow-up-api";

import {
  sendCampaignEmailViaSmtp,
  applyCampaignVariables,
  applySpinText,
} from "@/services/follow-up/campaign-send-adapter";

/**
 * ============================================================
 * ACTIVE CAMPAIGNS
 * ============================================================
 */

const activeCampaigns = new Set<string>();

/**
 * ============================================================
 * HELPERS
 * ============================================================
 */

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function intervalToMs(
  value: number | null | undefined,
  unit: string | null | undefined
): number {
  const safeValue = Number(value);

  if (!Number.isFinite(safeValue) || safeValue <= 0) {
    return 60_000;
  }

  switch ((unit || "minutes").toLowerCase()) {
    case "second":
    case "seconds":
      return safeValue * 1_000;

    case "minute":
    case "minutes":
      return safeValue * 60_000;

    case "hour":
    case "hours":
      return safeValue * 60 * 60_000;

    case "day":
    case "days":
      return safeValue * 24 * 60 * 60_000;

    default:
      return 60_000;
  }
}

function getCampaignType(
  campaignType: string | null | undefined
): "EMAIL" | "FOLLOW_UP" {
  return campaignType === "EMAIL"
    ? "EMAIL"
    : "FOLLOW_UP";
}

/**
 * ============================================================
 * RANDOM SMTP
 * ============================================================
 *
 * Campaign ke andar jitne bhi SMTP selected hain:
 *
 * 2
 * 5
 * 50
 * 100
 * 1000
 *
 * koi hardcoded limit nahi.
 *
 * Har email send par fresh random SMTP select hota hai.
 */

function getRandomSmtp<T>(smtpConfigs: T[]): T | null {
  if (!smtpConfigs.length) {
    return null;
  }

  const randomIndex = Math.floor(
    Math.random() * smtpConfigs.length
  );

  return smtpConfigs[randomIndex] ?? null;
}

/**
 * ============================================================
 * SENDING WINDOW
 * ============================================================
 */

function isWithinSendingWindow(
  now: Date,
  timezone: string | null | undefined,
  sendingStart: string | null | undefined,
  sendingEnd: string | null | undefined
): boolean {
  try {
    const formatter = new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone:
          timezone || "Asia/Karachi",

        hour: "2-digit",
        minute: "2-digit",

        hour12: false,
      }
    );

    const parts = formatter.formatToParts(now);

    const hour = Number(
      parts.find(
        (part) => part.type === "hour"
      )?.value || 0
    );

    const minute = Number(
      parts.find(
        (part) => part.type === "minute"
      )?.value || 0
    );

    const [startHour, startMinute] =
      (sendingStart || "09:00")
        .split(":")
        .map(Number);

    const [endHour, endMinute] =
      (sendingEnd || "18:00")
        .split(":")
        .map(Number);

    const current =
      hour * 60 + minute;

    const start =
      startHour * 60 +
      startMinute;

    const end =
      endHour * 60 +
      endMinute;

    /**
     * Normal:
     * 09:00 -> 18:00
     */
    if (start <= end) {
      return (
        current >= start &&
        current < end
      );
    }

    /**
     * Overnight:
     * 22:00 -> 06:00
     */
    return (
      current >= start ||
      current < end
    );
  } catch {
    return true;
  }
}

/**
 * ============================================================
 * DAILY SENT COUNT
 * ============================================================
 */

async function getDailySentCount(
  campaignId: string
): Promise<number> {
  const now = new Date();

  const startOfDay = new Date(now);

  startOfDay.setHours(
    0,
    0,
    0,
    0
  );

  return prisma.followUpRecipientStep.count({
    where: {
      status: "SENT",

      sentAt: {
        gte: startOfDay,
        lte: now,
      },

      recipient: {
        campaignId,
      },
    },
  });
}

/**
 * ============================================================
 * INITIALIZE STEP SCHEDULES
 * ============================================================
 *
 * Agar initial step ka scheduledAt NULL hai:
 *
 * immediately executable.
 *
 * Step 1:
 * scheduledAt = now
 *
 * Is se null ka matlab immediate start hoga.
 */

async function initializePendingSteps(
  campaignId: string
): Promise<void> {
  const now = new Date();

  const result =
    await prisma.followUpRecipientStep.updateMany({
      where: {
        status: "PENDING",

        scheduledAt: null,

        recipient: {
          campaignId,

          status: {
            in: [
              "PENDING",
              "COMPLETED",
            ],
          },
        },

        step: {
          enabled: true,
        },
      },

      data: {
        scheduledAt: now,
      },
    });

  if (result.count > 0) {
    console.log(
      `[FOLLOW-UP][${campaignId}] ⚡ Initialized ${result.count} pending step(s) immediately`
    );
  }
}

/**
 * ============================================================
 * GET DUE STEP
 * ============================================================
 */

async function getNextDueStep(
  campaignId: string
) {
  return prisma.followUpRecipientStep.findFirst({
    where: {
      status: "PENDING",

      scheduledAt: {
        not: null,
        lte: new Date(),
      },

      recipient: {
        campaignId,

        status: {
          in: [
            "PENDING",
            "RUNNING",
          ],
        },
      },

      step: {
        enabled: true,
      },
    },

    include: {
      step: true,

      recipient: {
        include: {
          email: true,
        },
      },
    },

    orderBy: {
      scheduledAt: "asc",
    },
  });
}

/**
 * ============================================================
 * NEXT SCHEDULED STEP
 * ============================================================
 */

async function getNextScheduledFollowUp(
  campaignId: string
) {
  return prisma.followUpRecipientStep.findFirst({
    where: {
      status: "PENDING",

      scheduledAt: {
        not: null,
      },

      recipient: {
        campaignId,

        status: {
          in: [
            "PENDING",
            "RUNNING",
          ],
        },
      },

      step: {
        enabled: true,
      },
    },

    include: {
      step: true,

      recipient: {
        include: {
          email: true,
        },
      },
    },

    orderBy: {
      scheduledAt: "asc",
    },
  });
}

/**
 * ============================================================
 * LOG NEXT STEP
 * ============================================================
 */

async function logNextFollowUp(
  campaignId: string,
  timezone = "Asia/Karachi"
): Promise<void> {
  const next =
    await getNextScheduledFollowUp(
      campaignId
    );

  if (!next?.scheduledAt) {
    console.log(
      `[FOLLOW-UP][${campaignId}] ✅ No pending scheduled steps`
    );

    return;
  }

  const scheduledAt =
    next.scheduledAt;

  const now =
    new Date();

  const remainingMs =
    scheduledAt.getTime() -
    now.getTime();

  const remainingMinutes =
    Math.max(
      0,
      Math.ceil(
        remainingMs / 60_000
      )
    );

  const localTime =
    scheduledAt.toLocaleString(
      "en-PK",
      {
        timeZone:
          timezone ||
          "Asia/Karachi",

        dateStyle:
          "medium",

        timeStyle:
          "medium",
      }
    );

  console.log(
    `[FOLLOW-UP][${campaignId}] ⏳ Next Step: ${next.step.stepNumber}`
  );

  console.log(
    `[FOLLOW-UP][${campaignId}] 👤 Recipient: ${
      next.recipient.email?.email ||
      "UNKNOWN"
    }`
  );

  console.log(
    `[FOLLOW-UP][${campaignId}] 🕐 UTC: ${scheduledAt.toISOString()}`
  );

  console.log(
    `[FOLLOW-UP][${campaignId}] 🌍 Local: ${localTime}`
  );

  console.log(
    `[FOLLOW-UP][${campaignId}] ⏱️ Remaining: ${remainingMinutes} minute(s)`
  );
}

/**
 * ============================================================
 * PROCESS ONE RECIPIENT STEP
 * ============================================================
 */

async function processOneRecipientStep(
  campaign: Awaited<
    ReturnType<
      typeof getCampaignById
    >
  >
): Promise<boolean> {
  const recipientStep =
    await getNextDueStep(
      campaign.id
    );

  if (!recipientStep) {
    return false;
  }

  console.log("");

  console.log(
    "--------------------------------------------------"
  );

  console.log(
    `[FOLLOW-UP][${campaign.id}] Processing step: ${recipientStep.id}`
  );

  console.log(
    `[FOLLOW-UP][${campaign.id}] Type: ${getCampaignType(
      campaign.campaignType
    )}`
  );

  console.log(
    `[FOLLOW-UP][${campaign.id}] Recipient: ${
      recipientStep.recipient.email?.email ||
      "UNKNOWN"
    }`
  );

  console.log(
    `[FOLLOW-UP][${campaign.id}] Step: ${
      recipientStep.step.stepNumber
    }`
  );

  console.log(
    `[FOLLOW-UP][${campaign.id}] Scheduled: ${
      recipientStep.scheduledAt?.toISOString() ||
      "IMMEDIATE"
    }`
  );

  /**
   * ========================================================
   * CLAIM STEP
   * ========================================================
   *
   * Multiple workers/processes hon tab bhi
   * same step double-send nahi hoga.
   */

  const claimed =
    await prisma.followUpRecipientStep.updateMany({
      where: {
        id: recipientStep.id,

        status: "PENDING",
      },

      data: {
        status: "SENDING",
      },
    });

  if (claimed.count !== 1) {
    console.log(
      `[FOLLOW-UP][${campaign.id}] ⚠️ Step already claimed`
    );

    return false;
  }

  console.log(
    `[FOLLOW-UP][${campaign.id}] ✅ Step claimed`
  );

  const recipient =
    recipientStep.recipient;

  const email =
    recipient.email;

  /**
   * ========================================================
   * VALIDATE EMAIL
   * ========================================================
   */

  if (!email?.email) {
    const error =
      "Recipient email is missing";

    await prisma.followUpRecipientStep.update({
      where: {
        id: recipientStep.id,
      },

      data: {
        status: "FAILED",

        failedAt:
          new Date(),

        error,
      },
    });

    await prisma.followUpRecipient.update({
      where: {
        id: recipient.id,
      },

      data: {
        status: "FAILED",

        nextStepAt: null,
      },
    });

    console.log(
      `[FOLLOW-UP][${campaign.id}] ❌ ${error}`
    );

    return false;
  }

  /**
   * ========================================================
   * RANDOM SMTP
   * ========================================================
   *
   * IMPORTANT:
   *
   * campaign.smtpConfigs array se random SMTP.
   *
   * isActive check intentionally nahi.
   *
   * Campaign mein jo SMTP selected hain
   * woh pool hain.
   */

  const smtp =
    getRandomSmtp(
      campaign.smtpConfigs
    );

  if (!smtp) {
    const error =
      "No SMTP configuration selected for this campaign";

    console.error(
      `[FOLLOW-UP][${campaign.id}] ❌ ${error}`
    );

    await prisma.followUpRecipientStep.update({
      where: {
        id: recipientStep.id,
      },

      data: {
        status: "FAILED",

        failedAt:
          new Date(),

        error,
      },
    });

    await prisma.followUpRecipient.update({
      where: {
        id: recipient.id,
      },

      data: {
        status: "FAILED",

        nextStepAt: null,
      },
    });

    return false;
  }

  console.log(
    `[FOLLOW-UP][${campaign.id}] 🎲 Random SMTP selected`
  );

  console.log(
    `[FOLLOW-UP][${campaign.id}] 🔌 SMTP ID: ${smtp.id}`
  );

  console.log(
    `[FOLLOW-UP][${campaign.id}] 📤 SMTP Sender: ${smtp.senderEmail}`
  );

  /**
   * ========================================================
   * VARIABLES
   * ========================================================
   */

  const variables = {
    name:
      email.name,

    email:
      email.email,

    company:
      email.company,

    website:
      email.website,
  };

  const subject =
    applySpinText(
      applyCampaignVariables(
        recipientStep.step.subject,
        variables
      )
    );

  const body =
    applySpinText(
      applyCampaignVariables(
        recipientStep.step.body,
        variables
      )
    );

  console.log(
    `[FOLLOW-UP][${campaign.id}] 📧 Sending to: ${email.email}`
  );

  /**
   * ========================================================
   * SEND
   * ========================================================
   */

  try {
    const sendResult =
      await sendCampaignEmailViaSmtp({
        smtpConfig: {
          id:
            smtp.id,

          host:
            smtp.host || "",

          port:
            Number(
              smtp.port
            ) || 587,

          username:
            smtp.username || "",

          password:
            smtp.password || "",

          email:
            smtp.senderEmail ||
            smtp.username,

          fromName:
            smtp.senderName,

          userId:
            campaign.userId,
        },

        to:
          email.email,

        subject,

        text:
          body,

        html:
          body.replace(
            /\n/g,
            "<br />"
          ),
      });

    console.log(
      `[FOLLOW-UP][${campaign.id}] SMTP RESULT:`,
      sendResult
    );

    if (!sendResult.success) {
      throw new Error(
        sendResult.error ||
          "SMTP send failed"
      );
    }

    const sentAt =
      new Date();

    /**
     * ========================================================
     * SAVE SUCCESS
     * ========================================================
     */

    await prisma.$transaction(
      async (tx) => {
        /**
         * Current step SENT
         */
        await tx.followUpRecipientStep.update({
          where: {
            id:
              recipientStep.id,
          },

          data: {
            status:
              "SENT",

            sentAt,

            failedAt:
              null,

            error:
              null,
          },
        });

        /**
         * ====================================================
         * FIND NEXT STEP
         * ====================================================
         */

        const nextStep =
          campaign.steps.find(
            (step) =>
              step.stepNumber >
              recipientStep.step.stepNumber
          );

        if (nextStep) {
          /**
           * Next step delay is relative
           * to current send time.
           */

          const nextScheduledAt =
            new Date(
              sentAt
            );

          nextScheduledAt.setUTCDate(
            nextScheduledAt.getUTCDate() +
              Math.max(
                0,
                nextStep.delayDays
              )
          );

          /**
           * Schedule only the next step.
           */

          await tx.followUpRecipientStep.updateMany({
            where: {
              recipientId:
                recipient.id,

              stepId:
                nextStep.id,

              status:
                "PENDING",
            },

            data: {
              scheduledAt:
                nextScheduledAt,
            },
          });

          await tx.followUpRecipient.update({
            where: {
              id:
                recipient.id,
            },

            data: {
              status:
                "RUNNING",

              currentStep:
                nextStep.stepNumber,

              lastSentAt:
                sentAt,

              nextStepAt:
                nextScheduledAt,
            },
          });

          console.log(
            `[FOLLOW-UP][${campaign.id}] 📅 Next step ${nextStep.stepNumber} scheduled`
          );

          console.log(
            `[FOLLOW-UP][${campaign.id}] 🕐 UTC: ${nextScheduledAt.toISOString()}`
          );

          console.log(
            `[FOLLOW-UP][${campaign.id}] 🇵🇰 Pakistan: ${nextScheduledAt.toLocaleString(
              "en-PK",
              {
                timeZone:
                  campaign.timezone ||
                  "Asia/Karachi",

                dateStyle:
                  "medium",

                timeStyle:
                  "medium",
              }
            )}`
          );
        } else {
          /**
           * ==================================================
           * RECIPIENT COMPLETED
           * ==================================================
           */

          await tx.followUpRecipient.update({
            where: {
              id:
                recipient.id,
            },

            data: {
              status:
                "COMPLETED",

              currentStep:
                recipientStep
                  .step
                  .stepNumber,

              lastSentAt:
                sentAt,

              nextStepAt:
                null,

              completedAt:
                sentAt,
            },
          });

          const remaining =
            await tx.followUpRecipient.count({
              where: {
                campaignId:
                  campaign.id,

                status: {
                  in: [
                    "PENDING",
                    "RUNNING",
                  ],
                },
              },
            });

          if (remaining === 0) {
            await tx.followUpCampaign.update({
              where: {
                id:
                  campaign.id,
              },

              data: {
                status:
                  "COMPLETED",
              },
            });

            console.log(
              `[FOLLOW-UP][${campaign.id}] 🏁 Campaign completed`
            );
          }
        }
      }
    );

    console.log(
      `[FOLLOW-UP][${campaign.id}] 🎉 SENT -> ${email.email}`
    );

    console.log(
      `[FOLLOW-UP][${campaign.id}] 📤 Sent using SMTP -> ${smtp.senderEmail}`
    );

    return true;
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : String(error);

    console.error(
      `[FOLLOW-UP][${campaign.id}] ❌ FAILED -> ${email.email}`,
      message
    );

    await prisma.followUpRecipientStep.update({
      where: {
        id:
          recipientStep.id,
      },

      data: {
        status:
          "FAILED",

        failedAt:
          new Date(),

        error:
          message.slice(
            0,
            2000
          ),
      },
    });

    await prisma.followUpRecipient.update({
      where: {
        id:
          recipient.id,
      },

      data: {
        status:
          "FAILED",

        nextStepAt:
          null,
      },
    });

    return false;
  }
}

/**
 * ============================================================
 * GET CAMPAIGN
 * ============================================================
 */

async function getCampaignById(
  campaignId: string
) {
  return prisma.followUpCampaign.findUnique({
    where: {
      id:
        campaignId,
    },

    include: {
      /**
       * IMPORTANT:
       *
       * This is now ARRAY.
       */

      smtpConfigs: true,

      steps: {
        where: {
          enabled:
            true,
        },

        orderBy: {
          stepNumber:
            "asc",
        },
      },
    },
  });
}

/**
 * ============================================================
 * ACTIVATE SCHEDULED CAMPAIGNS
 * ============================================================
 *
 * Rules:
 *
 * SCHEDULED + scheduledAt NULL
 *     -> RUNNING immediately
 *
 * SCHEDULED + scheduledAt <= now
 *     -> RUNNING
 *
 * SCHEDULED + future date
 *     -> stay SCHEDULED
 *
 * RUNNING
 *     -> stay RUNNING
 */

async function activateScheduledCampaigns() {
  const now =
    new Date();

  /**
   * NULL scheduledAt:
   * immediate start.
   */

  const immediate =
    await prisma.followUpCampaign.updateMany({
      where: {
        status:
          "SCHEDULED",

        scheduledAt:
          null,
      },

      data: {
        status:
          "RUNNING",
      },
    });

  if (immediate.count > 0) {
    console.log(
      `[FOLLOW-UP WORKER] 🚀 ${immediate.count} campaign(s) started immediately`
    );
  }

  /**
   * Scheduled time reached.
   */

  const scheduled =
    await prisma.followUpCampaign.updateMany({
      where: {
        status:
          "SCHEDULED",

        scheduledAt: {
          not: null,

          lte:
            now,
        },
      },

      data: {
        status:
          "RUNNING",
      },
    });

  if (scheduled.count > 0) {
    console.log(
      `[FOLLOW-UP WORKER] ⏰ ${scheduled.count} scheduled campaign(s) moved to RUNNING`
    );
  }
}

/**
 * ============================================================
 * GET RUNNING CAMPAIGNS
 * ============================================================
 */

async function getRunningCampaigns() {
  const campaigns =
    await prisma.followUpCampaign.findMany({
      where: {
        status:
          "RUNNING",
      },

      include: {
        /**
         * IMPORTANT:
         *
         * Multiple SMTPs.
         */

        smtpConfigs: true,

        steps: {
          where: {
            enabled:
              true,
          },

          orderBy: {
            stepNumber:
              "asc",
          },
        },
      },

      orderBy: {
        createdAt:
          "asc",
      },
    });

  console.log(
    `[FOLLOW-UP] Running campaigns: ${campaigns.length}`
  );

  return campaigns;
}

/**
 * ============================================================
 * PROCESS CAMPAIGN
 * ============================================================
 */

async function processCampaign(
  initialCampaign: Awaited<
    ReturnType<
      typeof getRunningCampaigns
    >
  >[number]
) {
  const campaignId =
    initialCampaign.id;

  if (
    activeCampaigns.has(
      campaignId
    )
  ) {
    return;
  }

  activeCampaigns.add(
    campaignId
  );

  try {
    console.log("");

    console.log(
      "=================================================="
    );

    console.log(
      `[FOLLOW-UP][${campaignId}] 🚀 CAMPAIGN WORKER STARTED`
    );

    console.log(
      `[FOLLOW-UP][${campaignId}] Name: ${initialCampaign.name}`
    );

    console.log(
      `[FOLLOW-UP][${campaignId}] Type: ${getCampaignType(
        initialCampaign.campaignType
      )}`
    );

    console.log(
      `[FOLLOW-UP][${campaignId}] SMTP Pool: ${initialCampaign.smtpConfigs.length}`
    );

    console.log(
      `[FOLLOW-UP][${campaignId}] Daily Limit: ${initialCampaign.dailyLimit}`
    );

    console.log(
      `[FOLLOW-UP][${campaignId}] Window: ${initialCampaign.sendingStart} - ${initialCampaign.sendingEnd}`
    );

    console.log(
      `[FOLLOW-UP][${campaignId}] Timezone: ${initialCampaign.timezone}`
    );

    console.log(
      "=================================================="
    );

    /**
     * Initialize null scheduledAt steps.
     */

    await initializePendingSteps(
      campaignId
    );

    while (true) {
      try {
        /**
         * Reload campaign every loop.
         */

        const campaign =
          await getCampaignById(
            campaignId
          );

        /**
         * Deleted.
         */

        if (!campaign) {
          console.log(
            `[FOLLOW-UP][${campaignId}] ❌ Campaign not found`
          );

          break;
        }

        /**
         * Status changed.
         */

        if (
          campaign.status !==
          "RUNNING"
        ) {
          console.log(
            `[FOLLOW-UP][${campaignId}] ⏹ Campaign status: ${campaign.status}`
          );

          break;
        }

        /**
         * SMTP pool validation.
         */

        if (
          campaign.smtpConfigs.length ===
          0
        ) {
          console.log(
            `[FOLLOW-UP][${campaignId}] ❌ No SMTP selected in campaign`
          );

          await sleep(
            30_000
          );

          continue;
        }

        /**
         * Steps validation.
         */

        if (
          campaign.steps.length ===
          0
        ) {
          console.log(
            `[FOLLOW-UP][${campaignId}] ❌ No enabled steps`
          );

          break;
        }

        /**
         * Ensure null initial schedules become immediate.
         */

        await initializePendingSteps(
          campaignId
        );

        /**
         * ====================================================
         * SENDING WINDOW
         * ====================================================
         */

        const now =
          new Date();

        const insideWindow =
          isWithinSendingWindow(
            now,

            campaign.timezone,

            campaign.sendingStart,

            campaign.sendingEnd
          );

        if (
          !insideWindow
        ) {
          console.log(
            `[FOLLOW-UP][${campaignId}] ⏰ Outside sending window`
          );

          await sleep(
            30_000
          );

          continue;
        }

        /**
         * ====================================================
         * DAILY LIMIT
         * ====================================================
         */

        const dailyLimit =
          Math.max(
            0,
            campaign.dailyLimit ??
              50
          );

        const sentToday =
          await getDailySentCount(
            campaignId
          );

        if (
          sentToday >=
          dailyLimit
        ) {
          console.log(
            `[FOLLOW-UP][${campaignId}] 🛑 Daily limit reached ${sentToday}/${dailyLimit}`
          );

          await sleep(
            60_000
          );

          continue;
        }

        /**
         * ====================================================
         * GET DUE STEP
         * ====================================================
         */

        const dueStep =
          await getNextDueStep(
            campaignId
          );

        /**
         * ====================================================
         * NO DUE STEP
         * ====================================================
         */

        if (!dueStep) {
          const next =
            await getNextScheduledFollowUp(
              campaignId
            );

          if (next?.scheduledAt) {
            const remaining =
              Math.max(
                0,
                Math.ceil(
                  (
                    next.scheduledAt.getTime() -
                    Date.now()
                  ) /
                    60_000
                )
              );

            console.log(
              `[FOLLOW-UP][${campaignId}] ⏳ Next step ${next.step.stepNumber} in ${remaining} minute(s)`
            );
          } else {
            console.log(
              `[FOLLOW-UP][${campaignId}] ⏳ No pending due step`
            );
          }

          await sleep(
            30_000
          );

          continue;
        }

        /**
         * ====================================================
         * SEND ONE
         * ====================================================
         */

        const sent =
          await processOneRecipientStep(
            campaign
          );

        /**
         * ====================================================
         * EMAIL INTERVAL
         * ====================================================
         */

        if (
          sent &&
          getCampaignType(
            campaign.campaignType
          ) === "EMAIL"
        ) {
          const interval =
            intervalToMs(
              campaign.intervalValue,
              campaign.intervalUnit
            );

          console.log(
            `[FOLLOW-UP][${campaignId}] ⏳ EMAIL interval: ${Math.round(
              interval / 1000
            )} seconds`
          );

          await sleep(
            interval
          );

          console.log(
            `[FOLLOW-UP][${campaignId}] ▶️ EMAIL interval finished`
          );
        }

        /**
         * FOLLOW UP
         *
         * Do not wait delayDays here.
         *
         * scheduledAt handles it.
         */

        else if (
          sent
        ) {
          await logNextFollowUp(
            campaignId,
            campaign.timezone
          );

          await sleep(
            1_000
          );
        }

        /**
         * Failed.
         */

        else {
          await sleep(
            5_000
          );
        }
      } catch (error) {
        console.error(
          `[FOLLOW-UP][${campaignId}] ❌ Campaign loop error:`,
          error instanceof Error
            ? error.message
            : error
        );

        await sleep(
          5_000
        );
      }
    }
  } finally {
    activeCampaigns.delete(
      campaignId
    );

    console.log(
      `[FOLLOW-UP][${campaignId}] 🏁 CAMPAIGN LOOP ENDED`
    );
  }
}

/**
 * ============================================================
 * GLOBAL WORKER
 * ============================================================
 */

async function startFollowUpWorker() {
  console.log("");

  console.log(
    "=================================================="
  );

  console.log(
    "[FOLLOW-UP WORKER] 🚀 Started"
  );

  console.log(
    "=================================================="
  );

  while (true) {
    try {
      /**
       * First activate scheduled campaigns.
       */

      await activateScheduledCampaigns();

      /**
       * Then discover RUNNING campaigns.
       */

      const campaigns =
        await getRunningCampaigns();

      for (
        const campaign of campaigns
      ) {
        if (
          !activeCampaigns.has(
            campaign.id
          )
        ) {
          /**
           * Independent worker.
           */

          void processCampaign(
            campaign
          );
        }
      }
    } catch (error) {
      console.error(
        "[FOLLOW-UP WORKER] ❌ Error:",
        error instanceof Error
          ? error.message
          : error
      );
    }

    /**
     * Discovery interval.
     */

    await sleep(
      30_000
    );
  }
}

/**
 * ============================================================
 * START
 * ============================================================
 */

startFollowUpWorker().catch(
  (error) => {
    console.error(
      "[FOLLOW-UP WORKER] ❌ Failed to start:",
      error
    );

    process.exit(1);
  }
);