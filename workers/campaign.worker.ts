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
 * SMTP ROTATION STATE
 * ============================================================
 *
 * Har campaign ka apna random SMTP queue hoga.
 *
 * Example:
 *
 * SMTP A
 * SMTP B
 * SMTP C
 *
 * Random queue:
 *
 * C -> A -> B
 *
 * Next cycle:
 *
 * B -> C -> A
 *
 * Is tarah same SMTP consecutive send nahi karega.
 */

const smtpQueues = new Map<string, string[]>();

/**
 * Last SMTP used by campaign.
 *
 * Extra safety:
 * refill ke waqt previous SMTP ko immediately
 * dobara select nahi hone denge.
 */

const lastUsedSmtp = new Map<string, string>();

/**
 * ============================================================
 * TEMPLATE ROTATION STATE
 * ============================================================
 */

const templateQueues = new Map<string, string[]>();

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

/**
 * Fisher-Yates shuffle
 */

function shuffle<T>(items: T[]): T[] {
  const array = [...items];

  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));

    [array[i], array[j]] = [array[j], array[i]];
  }

  return array;
}

/**
 * ============================================================
 * RANDOM SMTP
 * ============================================================
 *
 * IMPORTANT:
 *
 * Simple Math.random() use nahi kar rahe.
 *
 * Pool ko shuffle karke one-by-one use karenge.
 *
 * Agar campaign mein:
 *
 * A
 * B
 * C
 *
 * hain to:
 *
 * C
 * A
 * B
 *
 * phir next cycle:
 *
 * B
 * C
 * A
 *
 * Same SMTP consecutive nahi aayega.
 */

function getRandomSmtp<
  T extends {
    id: string;
  }
>(
  campaignId: string,
  smtpConfigs: T[]
): T | null {
  if (!smtpConfigs.length) {
    return null;
  }

  const smtpById = new Map(
    smtpConfigs.map((smtp) => [
      smtp.id,
      smtp,
    ])
  );

  let queue =
    smtpQueues.get(campaignId) || [];

  /**
   * Remove SMTPs jo ab campaign mein nahi hain.
   */
  queue = queue.filter((id) =>
    smtpById.has(id)
  );

  /**
   * Agar queue empty hai to new random cycle.
   */
  if (queue.length === 0) {
    queue = shuffle(
      smtpConfigs.map(
        (smtp) => smtp.id
      )
    );

    /**
     * Previous SMTP ko next cycle ke first position
     * par aane se prevent karo.
     */
    const previous =
      lastUsedSmtp.get(campaignId);

    if (
      previous &&
      queue.length > 1 &&
      queue[0] === previous
    ) {
      const swapIndex = 1;

      [
        queue[0],
        queue[swapIndex],
      ] = [
        queue[swapIndex],
        queue[0],
      ];
    }
  }

  const selectedId =
    queue.shift();

  if (!selectedId) {
    return null;
  }

  smtpQueues.set(
    campaignId,
    queue
  );

  lastUsedSmtp.set(
    campaignId,
    selectedId
  );

  return (
    smtpById.get(
      selectedId
    ) || null
  );
}

/**
 * ============================================================
 * RANDOM TEMPLATE
 * ============================================================
 *
 * Templates ko bhi random cycle mein use karo.
 *
 * Example:
 *
 * T1
 * T2
 * T3
 *
 * random:
 *
 * T2 -> T1 -> T3
 *
 * next:
 *
 * T3 -> T2 -> T1
 */

function getRandomTemplate<
  T extends {
    id: string;
  }
>(
  stepKey: string,
  templates: T[]
): T | null {
  if (!templates.length) {
    return null;
  }

  const templateById =
    new Map(
      templates.map(
        (template) => [
          template.id,
          template,
        ]
      )
    );

  let queue =
    templateQueues.get(
      stepKey
    ) || [];

  queue = queue.filter(
    (id) =>
      templateById.has(id)
  );

  if (queue.length === 0) {
    queue = shuffle(
      templates.map(
        (template) =>
          template.id
      )
    );
  }

  const selectedId =
    queue.shift();

  templateQueues.set(
    stepKey,
    queue
  );

  if (!selectedId) {
    return null;
  }

  return (
    templateById.get(
      selectedId
    ) || null
  );
}

/**
 * ============================================================
 * CLEAN EMAIL
 * ============================================================
 */

function cleanEmail(
  value: string | null | undefined
): string {
  return String(value || "")
    .trim();
}

/**
 * ============================================================
 * HTML -> TEXT
 * ============================================================
 */

function htmlToText(
  html: string
): string {
  return String(html || "")
    .replace(
      /<br\s*\/?>/gi,
      "\n"
    )
    .replace(
      /<\/p>/gi,
      "\n\n"
    )
    .replace(
      /<[^>]*>/g,
      ""
    )
    .replace(
      /&nbsp;/gi,
      " "
    )
    .replace(
      /&amp;/gi,
      "&"
    )
    .replace(
      /&lt;/gi,
      "<"
    )
    .replace(
      /&gt;/gi,
      ">"
    )
    .trim();
}

/**
 * ============================================================
 * INTERVAL
 * ============================================================
 */

function intervalToMs(
  value: number | null | undefined,
  unit: string | null | undefined
): number {
  const safeValue =
    Number(value);

  if (
    !Number.isFinite(
      safeValue
    ) ||
    safeValue <= 0
  ) {
    return 60_000;
  }

  switch (
    (
      unit ||
      "minutes"
    ).toLowerCase()
  ) {
    case "second":
    case "seconds":
      return (
        safeValue *
        1_000
      );

    case "minute":
    case "minutes":
      return (
        safeValue *
        60_000
      );

    case "hour":
    case "hours":
      return (
        safeValue *
        60 *
        60_000
      );

    case "day":
    case "days":
      return (
        safeValue *
        24 *
        60 *
        60_000
      );

    default:
      return 60_000;
  }
}

/**
 * ============================================================
 * CAMPAIGN TYPE
 * ============================================================
 */

function getCampaignType(
  campaignType:
    | string
    | null
    | undefined
): "EMAIL" | "FOLLOW_UP" {
  return campaignType ===
    "EMAIL"
    ? "EMAIL"
    : "FOLLOW_UP";
}

/**
 * ============================================================
 * SENDING WINDOW
 * ============================================================
 */

function isWithinSendingWindow(
  now: Date,
  timezone:
    | string
    | null
    | undefined,
  sendingStart:
    | string
    | null
    | undefined,
  sendingEnd:
    | string
    | null
    | undefined
): boolean {
  try {
    const formatter =
      new Intl.DateTimeFormat(
        "en-US",
        {
          timeZone:
            timezone ||
            "Asia/Karachi",

          hour: "2-digit",
          minute: "2-digit",

          hour12: false,
        }
      );

    const parts =
      formatter.formatToParts(
        now
      );

    const hour =
      Number(
        parts.find(
          (part) =>
            part.type ===
            "hour"
        )?.value || 0
      );

    const minute =
      Number(
        parts.find(
          (part) =>
            part.type ===
            "minute"
        )?.value || 0
      );

    const [
      startHour,
      startMinute,
    ] = (
      sendingStart ||
      "09:00"
    )
      .split(":")
      .map(Number);

    const [
      endHour,
      endMinute,
    ] = (
      sendingEnd ||
      "18:00"
    )
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

    if (start <= end) {
      return (
        current >= start &&
        current < end
      );
    }

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
  const now =
    new Date();

  const startOfDay =
    new Date(now);

  startOfDay.setHours(
    0,
    0,
    0,
    0
  );

  return prisma
    .followUpRecipientStep
    .count({
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
 * INITIALIZE PENDING STEPS
 * ============================================================
 */

async function initializePendingSteps(
  campaignId: string
): Promise<void> {
  const now =
    new Date();

  const result =
    await prisma
      .followUpRecipientStep
      .updateMany({
        where: {
          status:
            "PENDING",

          scheduledAt:
            null,

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
          scheduledAt:
            now,
        },
      });

  if (result.count > 0) {
    console.log(
      `[FOLLOW-UP][${campaignId}] ⚡ Initialized ${result.count} pending step(s)`
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
  return prisma
    .followUpRecipientStep
    .findFirst({
      where: {
        status:
          "PENDING",

        scheduledAt: {
          not: null,
          lte:
            new Date(),
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
        step: {
          include: {
            templates: true,
          },
        },

        recipient: {
          include: {
            email: true,
          },
        },
      },

      orderBy: {
        scheduledAt:
          "asc",
      },
    });
}

/**
 * ============================================================
 * GET NEXT SCHEDULED STEP
 * ============================================================
 */

async function getNextScheduledFollowUp(
  campaignId: string
) {
  return prisma
    .followUpRecipientStep
    .findFirst({
      where: {
        status:
          "PENDING",

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
        scheduledAt:
          "asc",
      },
    });
}

/**
 * ============================================================
 * LOG NEXT FOLLOW UP
 * ============================================================
 */

async function logNextFollowUp(
  campaignId: string,
  timezone =
    "Asia/Karachi"
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

  const remainingMs =
    scheduledAt.getTime() -
    Date.now();

  const remainingMinutes =
    Math.max(
      0,
      Math.ceil(
        remainingMs /
          60_000
      )
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
    `[FOLLOW-UP][${campaignId}] 🌍 Local: ${scheduledAt.toLocaleString(
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
    )}`
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
    `[FOLLOW-UP][${campaign.id}] Step: ${recipientStep.step.stepNumber}`
  );

  /**
   * ========================================================
   * CLAIM
   * ========================================================
   */

  const claimed =
    await prisma
      .followUpRecipientStep
      .updateMany({
        where: {
          id:
            recipientStep.id,

          status:
            "PENDING",
        },

        data: {
          status:
            "SENDING",
        },
      });

  if (
    claimed.count !== 1
  ) {
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

  const recipientEmail =
    cleanEmail(
      email?.email
    );

  if (!recipientEmail) {
    const error =
      "Recipient email is missing";

    await prisma
      .followUpRecipientStep
      .update({
        where: {
          id:
            recipientStep.id,
        },

        data: {
          status:
            "FAILED",

          failedAt:
            new Date(),

          error,
        },
      });

    await prisma
      .followUpRecipient
      .update({
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

    console.log(
      `[FOLLOW-UP][${campaign.id}] ❌ ${error}`
    );

    return false;
  }

  /**
   * ========================================================
   * RANDOM SMTP FROM CAMPAIGN
   * ========================================================
   */

  const smtp =
    getRandomSmtp(
      campaign.id,
      campaign.smtpConfigs
    );

  if (!smtp) {
    const error =
      "No SMTP configuration selected for this campaign";

    console.error(
      `[FOLLOW-UP][${campaign.id}] ❌ ${error}`
    );

    await prisma
      .followUpRecipientStep
      .update({
        where: {
          id:
            recipientStep.id,
        },

        data: {
          status:
            "FAILED",

          failedAt:
            new Date(),

          error,
        },
      });

    await prisma
      .followUpRecipient
      .update({
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

  const senderEmail =
    cleanEmail(
      smtp.senderEmail ||
        smtp.username
    );

  console.log(
    `[FOLLOW-UP][${campaign.id}] 🎲 Random SMTP selected`
  );

  console.log(
    `[FOLLOW-UP][${campaign.id}] 🔌 SMTP ID: ${smtp.id}`
  );

  console.log(
    `[FOLLOW-UP][${campaign.id}] 📤 SMTP Sender: ${senderEmail}`
  );

  /**
   * ========================================================
   * VARIABLES
   * ========================================================
   *
   * Multiple aliases support.
   *
   * {{name}}
   * {{firstName}}
   * {{email}}
   * {{company}}
   * {{companyName}}
   * {{website}}
   */

  const variables = {
    name:
      email?.name || "",

    firstName:
      email?.name || "",

    fullName:
      email?.name || "",

    email:
      recipientEmail,

    company:
      email?.company || "",

    companyName:
      email?.company || "",

    website:
      email?.website || "",
  };

  /**
   * ========================================================
   * RANDOM TEMPLATE
   * ========================================================
   */

  const templates =
    recipientStep.step
      .templates || [];

  console.log(
    `[FOLLOW-UP][${campaign.id}] 🎲 Available templates: ${templates.length}`
  );

  const selectedTemplate =
    getRandomTemplate(
      `${campaign.id}:${recipientStep.step.id}`,
      templates
    );

  let rawSubject =
    recipientStep.step.subject;

  let rawBody =
    recipientStep.step.body;

  if (selectedTemplate) {
    rawSubject =
      selectedTemplate.subject;

    rawBody =
      selectedTemplate.body;

    console.log(
      `[FOLLOW-UP][${campaign.id}] 🎲 Random template selected: ${selectedTemplate.id}`
    );
  } else {
    console.log(
      `[FOLLOW-UP][${campaign.id}] 📄 No template selected, using step content`
    );
  }

  /**
   * ========================================================
   * APPLY VARIABLES
   * ========================================================
   */

  const subject =
    applySpinText(
      applyCampaignVariables(
        rawSubject,
        variables
      )
    );

  const body =
    applySpinText(
      applyCampaignVariables(
        rawBody,
        variables
      )
    );

  const textBody =
    htmlToText(body);

  console.log(
    `[FOLLOW-UP][${campaign.id}] 📧 Sending to: ${recipientEmail}`
  );

  console.log(
    `[FOLLOW-UP][${campaign.id}] 📝 Subject: ${subject}`
  );

  /**
   * ========================================================
   * SEND EMAIL
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
            cleanEmail(
              smtp.username
            ),

          password:
            smtp.password || "",

          email:
            senderEmail,

          fromName:
            smtp.senderName,

          userId:
            campaign.userId,
        },

        to:
          recipientEmail,

        subject,

        text:
          textBody,

        html:
          body,
      });

    console.log(
      `[FOLLOW-UP][${campaign.id}] SMTP RESULT:`,
      sendResult
    );

    if (
      !sendResult.success
    ) {
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

        await tx
          .followUpRecipientStep
          .update({
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
         * ==================================================
         * NEXT STEP
         * ==================================================
         */

        const nextStep =
          campaign.steps.find(
            (step) =>
              step.stepNumber >
              recipientStep
                .step
                .stepNumber
          );

        if (nextStep) {
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

          await tx
            .followUpRecipientStep
            .updateMany({
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

          await tx
            .followUpRecipient
            .update({
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
        } else {
          /**
           * ==================================================
           * RECIPIENT COMPLETED
           * ==================================================
           */

          await tx
            .followUpRecipient
            .update({
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
            await tx
              .followUpRecipient
              .count({
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

          if (
            remaining === 0
          ) {
            await tx
              .followUpCampaign
              .update({
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
      `[FOLLOW-UP][${campaign.id}] 🎉 SENT -> ${recipientEmail}`
    );

    console.log(
      `[FOLLOW-UP][${campaign.id}] 📤 SMTP -> ${senderEmail}`
    );

    if (selectedTemplate) {
      console.log(
        `[FOLLOW-UP][${campaign.id}] 📝 Template -> ${selectedTemplate.id}`
      );
    }

    return true;
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : String(error);

    console.error(
      `[FOLLOW-UP][${campaign.id}] ❌ FAILED -> ${recipientEmail}`,
      message
    );

    await prisma
      .followUpRecipientStep
      .update({
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

    await prisma
      .followUpRecipient
      .update({
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
  return prisma
    .followUpCampaign
    .findUnique({
      where: {
        id:
          campaignId,
      },

      include: {
        /**
         * Selected SMTPs only.
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

          /**
           * IMPORTANT:
           *
           * Load templates with every step.
           */
          include: {
            templates: true,
          },
        },
      },
    });
}

/**
 * ============================================================
 * ACTIVATE SCHEDULED CAMPAIGNS
 * ============================================================
 */

async function activateScheduledCampaigns() {
  const now =
    new Date();

  const immediate =
    await prisma
      .followUpCampaign
      .updateMany({
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

  if (
    immediate.count > 0
  ) {
    console.log(
      `[FOLLOW-UP WORKER] 🚀 ${immediate.count} campaign(s) started immediately`
    );
  }

  const scheduled =
    await prisma
      .followUpCampaign
      .updateMany({
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

  if (
    scheduled.count > 0
  ) {
    console.log(
      `[FOLLOW-UP WORKER] ⏰ ${scheduled.count} scheduled campaign(s) started`
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
    await prisma
      .followUpCampaign
      .findMany({
        where: {
          status:
            "RUNNING",
        },

        include: {
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

            include: {
              templates: true,
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
 * CLEAN CAMPAIGN STATE
 * ============================================================
 */

function cleanupCampaignState(
  campaignId: string
) {
  smtpQueues.delete(
    campaignId
  );

  lastUsedSmtp.delete(
    campaignId
  );

  /**
   * Templates are keyed by:
   * campaignId:stepId
   *
   * Remove them too.
   */

  for (const key of templateQueues.keys()) {
    if (
      key.startsWith(
        `${campaignId}:`
      )
    ) {
      templateQueues.delete(
        key
      );
    }
  }
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

    await initializePendingSteps(
      campaignId
    );

    while (true) {
      try {
        const campaign =
          await getCampaignById(
            campaignId
          );

        /**
         * Deleted
         */

        if (!campaign) {
          console.log(
            `[FOLLOW-UP][${campaignId}] ❌ Campaign not found`
          );

          break;
        }

        /**
         * Status changed
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
         * SMTP validation
         */

        if (
          campaign.smtpConfigs
            .length === 0
        ) {
          console.log(
            `[FOLLOW-UP][${campaignId}] ❌ No SMTP selected`
          );

          await sleep(
            30_000
          );

          continue;
        }

        /**
         * Steps validation
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

        await initializePendingSteps(
          campaignId
        );

        /**
         * ====================================================
         * SENDING WINDOW
         * ====================================================
         */

        const insideWindow =
          isWithinSendingWindow(
            new Date(),

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
         * DUE STEP
         * ====================================================
         */

        const dueStep =
          await getNextDueStep(
            campaignId
          );

        if (!dueStep) {
          const next =
            await getNextScheduledFollowUp(
              campaignId
            );

          if (
            next?.scheduledAt
          ) {
            const remaining =
              Math.max(
                0,
                Math.ceil(
                  (
                    next
                      .scheduledAt
                      .getTime() -
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
         * SEND
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
        } else if (
          sent
        ) {
          await logNextFollowUp(
            campaignId,
            campaign.timezone
          );

          await sleep(
            1_000
          );
        } else {
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

    cleanupCampaignState(
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
       * Activate scheduled campaigns
       */

      await activateScheduledCampaigns();

      /**
       * Find running campaigns
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