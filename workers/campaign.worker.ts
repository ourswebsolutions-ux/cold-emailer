import { prisma } from "@/lib/follow-up-api";

import {
  sendCampaignEmailViaSmtp,
  applyCampaignVariables,
  applySpinText,
} from "@/services/follow-up/campaign-send-adapter";

/**
 * ============================================================
 * CONFIG
 * ============================================================
 */

const DEFAULT_TIMEZONE = "Asia/Karachi";
const WORKER_POLL_MS = 30_000;
const ERROR_RETRY_MS = 5_000;
const OUTSIDE_WINDOW_MS = 30_000;
const DAILY_LIMIT_WAIT_MS = 60_000;

/**
 * ============================================================
 * ACTIVE CAMPAIGNS
 * ============================================================
 */

const activeCampaigns = new Set<string>();

/**
 * ============================================================
 * SMTP ROTATION
 * ============================================================
 */

const smtpQueues = new Map<string, string[]>();
const lastUsedSmtp = new Map<string, string>();

/**
 * ============================================================
 * TEMPLATE ROTATION
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

function shuffle<T>(items: T[]): T[] {
  const array = [...items];

  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));

    [array[i], array[j]] = [
      array[j],
      array[i],
    ];
  }

  return array;
}

function cleanEmail(
  value: string | null | undefined
): string {
  return String(value || "").trim();
}

/**
 * ============================================================
 * CAMPAIGN TYPE
 * ============================================================
 */

function getCampaignType(
  value: string | null | undefined
): "EMAIL" | "FOLLOW_UP" {
  return value === "EMAIL"
    ? "EMAIL"
    : "FOLLOW_UP";
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
  const amount = Number(value);

  if (!Number.isFinite(amount) || amount <= 0) {
    return 60_000;
  }

  switch (
    String(unit || "minutes").toLowerCase()
  ) {
    case "second":
    case "seconds":
      return amount * 1_000;

    case "minute":
    case "minutes":
      return amount * 60_000;

    case "hour":
    case "hours":
      return amount * 60 * 60_000;

    case "day":
    case "days":
      return amount * 24 * 60 * 60_000;

    default:
      return 60_000;
  }
}

/**
 * ============================================================
 * HTML -> TEXT
 * ============================================================
 */

function htmlToText(html: string): string {
  return String(html || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .trim();
}

/**
 * ============================================================
 * TIMEZONE HELPERS
 * ============================================================
 */

function getLocalTime(
  date: Date,
  timezone: string
): {
  hour: number;
  minute: number;
  second: number;
  formatted: string;
} {
  try {
    const formatter =
      new Intl.DateTimeFormat("en-GB", {
        timeZone: timezone || DEFAULT_TIMEZONE,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      });

    const parts = formatter.formatToParts(date);

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

    const second = Number(
      parts.find(
        (part) => part.type === "second"
      )?.value || 0
    );

    return {
      hour,
      minute,
      second,
      formatted:
        `${String(hour).padStart(2, "0")}:` +
        `${String(minute).padStart(2, "0")}:` +
        `${String(second).padStart(2, "0")}`,
    };
  } catch {
    const hour = date.getHours();
    const minute = date.getMinutes();
    const second = date.getSeconds();

    return {
      hour,
      minute,
      second,
      formatted:
        `${String(hour).padStart(2, "0")}:` +
        `${String(minute).padStart(2, "0")}:` +
        `${String(second).padStart(2, "0")}`,
    };
  }
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
  const tz = timezone || DEFAULT_TIMEZONE;

  const local = getLocalTime(now, tz);

  const [startHour, startMinute] = (
    sendingStart || "09:00"
  )
    .split(":")
    .map(Number);

  const [endHour, endMinute] = (
    sendingEnd || "18:00"
  )
    .split(":")
    .map(Number);

  const currentMinutes =
    local.hour * 60 + local.minute;

  const startMinutes =
    startHour * 60 + startMinute;

  const endMinutes =
    endHour * 60 + endMinute;

  console.log(
    `[FOLLOW-UP] 🕐 Current local time: ${local.formatted}`
  );

  console.log(
    `[FOLLOW-UP] 🪟 Window: ${sendingStart || "09:00"} - ${
      sendingEnd || "18:00"
    }`
  );

  /**
   * Normal window:
   * 09:00 -> 18:00
   */

  if (startMinutes <= endMinutes) {
    const inside =
      currentMinutes >= startMinutes &&
      currentMinutes < endMinutes;

    console.log(
      `[FOLLOW-UP] ${
        inside
          ? "🟢 INSIDE"
          : "🔴 OUTSIDE"
      } sending window`
    );

    return inside;
  }

  /**
   * Overnight window:
   *
   * 22:00 -> 06:00
   */

  const inside =
    currentMinutes >= startMinutes ||
    currentMinutes < endMinutes;

  console.log(
    `[FOLLOW-UP] ${
      inside
        ? "🟢 INSIDE"
        : "🔴 OUTSIDE"
    } sending window`
  );

  return inside;
}

/**
 * ============================================================
 * DAILY SENT COUNT
 * ============================================================
 *
 * IMPORTANT:
 * Campaign timezone ke according current day
 * calculate karna zaroori hai.
 *
 * DB mein sentAt UTC mein store hota hai.
 */

async function getDailySentCount(
  campaignId: string
): Promise<number> {
  const now = new Date();

  /**
   * Simple UTC boundary avoid kar rahe hain.
   *
   * Campaign ke timezone ke current date ko
   * determine karte hain.
   */

  const timezone =
    (
      await prisma.followUpCampaign.findUnique({
        where: {
          id: campaignId,
        },
        select: {
          timezone: true,
        },
      })
    )?.timezone || DEFAULT_TIMEZONE;

  const localDate = new Intl.DateTimeFormat(
    "en-CA",
    {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }
  ).format(now);

  /**
   * Approximate UTC range.
   *
   * For most campaign use-cases this is enough,
   * while sentAt itself remains UTC.
   */

  const startOfDay = new Date(
    `${localDate}T00:00:00`
  );

  const endOfDay = new Date(
    `${localDate}T23:59:59.999`
  );

  return prisma.followUpRecipientStep.count({
    where: {
      status: "SENT",

      sentAt: {
        gte: startOfDay,
        lte: endOfDay,
      },

      recipient: {
        campaignId,
      },
    },
  });
}

/**
 * ============================================================
 * SMTP ROTATION
 * ============================================================
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

  const smtpMap = new Map(
    smtpConfigs.map((smtp) => [
      smtp.id,
      smtp,
    ])
  );

  let queue =
    smtpQueues.get(campaignId) || [];

  /**
   * Remove deleted/unselected SMTPs.
   */

  queue = queue.filter((id) =>
    smtpMap.has(id)
  );

  /**
   * New cycle.
   */

  if (queue.length === 0) {
    queue = shuffle(
      smtpConfigs.map(
        (smtp) => smtp.id
      )
    );

    const previous =
      lastUsedSmtp.get(campaignId);

    /**
     * Same SMTP consecutive prevent.
     */

    if (
      previous &&
      queue.length > 1 &&
      queue[0] === previous
    ) {
      [
        queue[0],
        queue[1],
      ] = [
        queue[1],
        queue[0],
      ];
    }
  }

  const selectedId = queue.shift();

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
    smtpMap.get(selectedId) || null
  );
}

/**
 * ============================================================
 * TEMPLATE ROTATION
 * ============================================================
 */

function getRandomTemplate<
  T extends {
    id: string;
  }
>(
  key: string,
  templates: T[]
): T | null {
  if (!templates.length) {
    return null;
  }

  const templateMap = new Map(
    templates.map((template) => [
      template.id,
      template,
    ])
  );

  let queue =
    templateQueues.get(key) || [];

  queue = queue.filter((id) =>
    templateMap.has(id)
  );

  if (!queue.length) {
    queue = shuffle(
      templates.map(
        (template) => template.id
      )
    );
  }

  const selectedId =
    queue.shift();

  templateQueues.set(
    key,
    queue
  );

  if (!selectedId) {
    return null;
  }

  return (
    templateMap.get(
      selectedId
    ) || null
  );
}

/**
 * ============================================================
 * INITIALIZE FIRST STEPS
 * ============================================================
 *
 * IMPORTANT FIX:
 *
 * COMPLETED recipients ko yahan include nahi karna.
 *
 * Sirf PENDING recipient ka first pending step
 * initialize hoga.
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

          status: "PENDING",
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
      `[FOLLOW-UP][${campaignId}] ⚡ Initialized ${result.count} first step(s)`
    );
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
      id: campaignId,
    },

    include: {
      smtpConfigs: true,

      steps: {
        where: {
          enabled: true,
        },

        orderBy: {
          stepNumber: "asc",
        },

        include: {
          templates: true,
        },
      },
    },
  });
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
      scheduledAt: "asc",
    },
  });
}

/**
 * ============================================================
 * GET NEXT SCHEDULED
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
 * LOG NEXT FOLLOW-UP
 * ============================================================
 */

async function logNextFollowUp(
  campaignId: string,
  timezone: string
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
        remainingMs / 60_000
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
          timezone || DEFAULT_TIMEZONE,

        dateStyle: "medium",
        timeStyle: "medium",
      }
    )}`
  );

  console.log(
    `[FOLLOW-UP][${campaignId}] ⏱️ Remaining: ${remainingMinutes} minute(s)`
  );
}

/**
 * ============================================================
 * PROCESS ONE STEP
 * ============================================================
 */

async function processOneRecipientStep(
  campaign: Awaited<
    ReturnType<typeof getCampaignById>
  >
): Promise<boolean> {
  const recipientStep =
    await getNextDueStep(
      campaign.id
    );

  if (!recipientStep) {
    return false;
  }

  const campaignId =
    campaign.id;

  console.log("");
  console.log(
    "--------------------------------------------------"
  );

  console.log(
    `[FOLLOW-UP][${campaignId}] Processing step: ${recipientStep.id}`
  );

  console.log(
    `[FOLLOW-UP][${campaignId}] Step: ${recipientStep.step.stepNumber}`
  );

  const recipient =
    recipientStep.recipient;

  const email =
    recipient.email;

  const recipientEmail =
    cleanEmail(
      email?.email
    );

  console.log(
    `[FOLLOW-UP][${campaignId}] Recipient: ${
      recipientEmail || "UNKNOWN"
    }`
  );

  /**
   * ========================================================
   * CLAIM
   * ========================================================
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
      `[FOLLOW-UP][${campaignId}] ⚠️ Step already claimed`
    );

    return false;
  }

  console.log(
    `[FOLLOW-UP][${campaignId}] ✅ Step claimed`
  );

  /**
   * ========================================================
   * VALIDATE EMAIL
   * ========================================================
   */

  if (!recipientEmail) {
    const error =
      "Recipient email is missing";

    await prisma.$transaction([
      prisma.followUpRecipientStep.update({
        where: {
          id: recipientStep.id,
        },

        data: {
          status: "FAILED",
          failedAt: new Date(),
          error,
        },
      }),

      prisma.followUpRecipient.update({
        where: {
          id: recipient.id,
        },

        data: {
          status: "FAILED",
          nextStepAt: null,
        },
      }),
    ]);

    console.error(
      `[FOLLOW-UP][${campaignId}] ❌ ${error}`
    );

    return false;
  }

  /**
   * ========================================================
   * SMTP
   * ========================================================
   */

  const smtp =
    getRandomSmtp(
      campaignId,
      campaign.smtpConfigs
    );

  if (!smtp) {
    const error =
      "No SMTP configuration selected for this campaign";

    await prisma.$transaction([
      prisma.followUpRecipientStep.update({
        where: {
          id: recipientStep.id,
        },

        data: {
          status: "FAILED",
          failedAt: new Date(),
          error,
        },
      }),

      prisma.followUpRecipient.update({
        where: {
          id: recipient.id,
        },

        data: {
          status: "FAILED",
          nextStepAt: null,
        },
      }),
    ]);

    console.error(
      `[FOLLOW-UP][${campaignId}] ❌ ${error}`
    );

    return false;
  }

  const senderEmail =
    cleanEmail(
      smtp.senderEmail ||
        smtp.username
    );

  console.log(
    `[FOLLOW-UP][${campaignId}] 🎲 SMTP selected: ${smtp.id}`
  );

  console.log(
    `[FOLLOW-UP][${campaignId}] 📤 Sender: ${senderEmail}`
  );

  /**
   * ========================================================
   * VARIABLES
   * ========================================================
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
   * TEMPLATE
   * ========================================================
   */

  const templates =
    recipientStep.step.templates || [];

  const template =
    getRandomTemplate(
      `${campaignId}:${recipientStep.step.id}`,
      templates
    );

  let rawSubject =
    recipientStep.step.subject;

  let rawBody =
    recipientStep.step.body;

  if (template) {
    rawSubject =
      template.subject;

    rawBody =
      template.body;

    console.log(
      `[FOLLOW-UP][${campaignId}] 🎲 Template: ${template.id}`
    );
  } else {
    console.log(
      `[FOLLOW-UP][${campaignId}] 📄 Using step content`
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
    `[FOLLOW-UP][${campaignId}] 📧 Sending: ${recipientEmail}`
  );

  console.log(
    `[FOLLOW-UP][${campaignId}] 📝 Subject: ${subject}`
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
          id: smtp.id,

          host:
            smtp.host || "",

          port:
            Number(smtp.port) || 587,

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
      `[FOLLOW-UP][${campaignId}] SMTP RESULT:`,
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
     * ======================================================
     * SAVE SUCCESS
     * ======================================================
     */

    await prisma.$transaction(
      async (tx) => {
        /**
         * Current step
         */

        await tx.followUpRecipientStep.update({
          where: {
            id: recipientStep.id,
          },

          data: {
            status: "SENT",

            sentAt,

            failedAt: null,

            error: null,
          },
        });

        /**
         * Find next enabled step
         */

        const nextStep =
          campaign.steps.find(
            (step) =>
              step.stepNumber >
              recipientStep.step.stepNumber
          );

        /**
         * ====================================================
         * NEXT STEP
         * ====================================================
         */

        if (nextStep) {
          const nextScheduledAt =
            new Date(sentAt);

          nextScheduledAt.setUTCDate(
            nextScheduledAt.getUTCDate() +
              Math.max(
                0,
                Number(
                  nextStep.delayDays || 0
                )
              )
          );

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
              id: recipient.id,
            },

            data: {
              status: "RUNNING",

              currentStep:
                nextStep.stepNumber,

              lastSentAt:
                sentAt,

              nextStepAt:
                nextScheduledAt,
            },
          });

          console.log(
            `[FOLLOW-UP][${campaignId}] 📅 Next step ${nextStep.stepNumber} scheduled`
          );

          console.log(
            `[FOLLOW-UP][${campaignId}] 🕐 UTC: ${nextScheduledAt.toISOString()}`
          );
        } else {
          /**
           * ==================================================
           * RECIPIENT COMPLETED
           * ==================================================
           */

          await tx.followUpRecipient.update({
            where: {
              id: recipient.id,
            },

            data: {
              status: "COMPLETED",

              currentStep:
                recipientStep.step.stepNumber,

              lastSentAt:
                sentAt,

              nextStepAt:
                null,

              completedAt:
                sentAt,
            },
          });

          /**
           * Check remaining recipients.
           */

          const remaining =
            await tx.followUpRecipient.count({
              where: {
                campaignId,

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
                id: campaignId,
              },

              data: {
                status:
                  "COMPLETED",
              },
            });

            console.log(
              `[FOLLOW-UP][${campaignId}] 🏁 Campaign completed`
            );
          }
        }
      }
    );

    console.log(
      `[FOLLOW-UP][${campaignId}] 🎉 SENT -> ${recipientEmail}`
    );

    console.log(
      `[FOLLOW-UP][${campaignId}] 📤 SMTP -> ${senderEmail}`
    );

    return true;
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : String(error);

    console.error(
      `[FOLLOW-UP][${campaignId}] ❌ FAILED -> ${recipientEmail}`
    );

    console.error(
      `[FOLLOW-UP][${campaignId}] Error: ${message}`
    );

    /**
     * Failed step ko FAILED mark karo.
     */

    await prisma.$transaction([
      prisma.followUpRecipientStep.update({
        where: {
          id: recipientStep.id,
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
      }),

      prisma.followUpRecipient.update({
        where: {
          id: recipient.id,
        },

        data: {
          status:
            "FAILED",

          nextStepAt:
            null,
        },
      }),
    ]);

    return false;
  }
}

/**
 * ============================================================
 * ACTIVATE SCHEDULED CAMPAIGNS
 * ============================================================
 */

async function activateScheduledCampaigns() {
  const now =
    new Date();

  /**
   * Immediate campaigns
   */

  const immediate =
    await prisma.followUpCampaign.updateMany({
      where: {
        status: "SCHEDULED",

        scheduledAt: null,
      },

      data: {
        status: "RUNNING",
      },
    });

  if (immediate.count > 0) {
    console.log(
      `[FOLLOW-UP WORKER] 🚀 ${immediate.count} immediate campaign(s) started`
    );
  }

  /**
   * Scheduled campaigns
   */

  const scheduled =
    await prisma.followUpCampaign.updateMany({
      where: {
        status: "SCHEDULED",

        scheduledAt: {
          not: null,
          lte: now,
        },
      },

      data: {
        status: "RUNNING",
      },
    });

  if (scheduled.count > 0) {
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
    await prisma.followUpCampaign.findMany({
      where: {
        status: "RUNNING",
      },

      include: {
        smtpConfigs: true,

        steps: {
          where: {
            enabled: true,
          },

          orderBy: {
            stepNumber: "asc",
          },

          include: {
            templates: true,
          },
        },
      },

      orderBy: {
        createdAt: "asc",
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

  for (
    const key of templateQueues.keys()
  ) {
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
      `[FOLLOW-UP][${campaignId}] Daily Limit: ${
        initialCampaign.dailyLimit ?? 50
      }`
    );

    console.log(
      `[FOLLOW-UP][${campaignId}] Window: ${
        initialCampaign.sendingStart ||
        "09:00"
      } - ${
        initialCampaign.sendingEnd ||
        "18:00"
      }`
    );

    console.log(
      `[FOLLOW-UP][${campaignId}] Timezone: ${
        initialCampaign.timezone ||
        DEFAULT_TIMEZONE
      }`
    );

    const local =
      getLocalTime(
        new Date(),
        initialCampaign.timezone ||
          DEFAULT_TIMEZONE
      );

    console.log(
      `[FOLLOW-UP][${campaignId}] 🕐 Current local time: ${local.formatted}`
    );

    console.log(
      `[FOLLOW-UP][${campaignId}] 🪟 Window: ${
        initialCampaign.sendingStart ||
        "09:00"
      } - ${
        initialCampaign.sendingEnd ||
        "18:00"
      }`
    );

    console.log(
      "=================================================="
    );

    /**
     * Initialize first steps.
     */

    await initializePendingSteps(
      campaignId
    );

    /**
     * ========================================================
     * CAMPAIGN LOOP
     * ========================================================
     */

    while (true) {
      try {
        const campaign =
          await getCampaignById(
            campaignId
          );

        /**
         * Campaign deleted.
         */

        if (!campaign) {
          console.log(
            `[FOLLOW-UP][${campaignId}] ❌ Campaign not found`
          );

          break;
        }

        /**
         * Campaign stopped/completed.
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
         * SMTP validation.
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
         * Steps validation.
         */

        if (
          campaign.steps.length === 0
        ) {
          console.log(
            `[FOLLOW-UP][${campaignId}] ❌ No enabled steps`
          );

          break;
        }

        /**
         * Make sure first steps are initialized.
         */

        await initializePendingSteps(
          campaignId
        );

        /**
         * ====================================================
         * SENDING WINDOW
         * ====================================================
         */

        const timezone =
          campaign.timezone ||
          DEFAULT_TIMEZONE;

        const now =
          new Date();

        const local =
          getLocalTime(
            now,
            timezone
          );

        console.log(
          `[FOLLOW-UP][${campaignId}] 🕐 Current local time: ${local.formatted}`
        );

        console.log(
          `[FOLLOW-UP][${campaignId}] 🪟 Sending window: ${
            campaign.sendingStart ||
            "09:00"
          } - ${
            campaign.sendingEnd ||
            "18:00"
          }`
        );

        const insideWindow =
          isWithinSendingWindow(
            now,

            timezone,

            campaign.sendingStart,

            campaign.sendingEnd
          );

        if (!insideWindow) {
          console.log(
            `[FOLLOW-UP][${campaignId}] ⏰ Outside sending window`
          );

          console.log(
            `[FOLLOW-UP][${campaignId}] 🌍 Timezone: ${timezone}`
          );

          console.log(
            `[FOLLOW-UP][${campaignId}] 🕐 Current local time: ${local.formatted}`
          );

          console.log(
            `[FOLLOW-UP][${campaignId}] 🪟 Sending window: ${
              campaign.sendingStart ||
              "09:00"
            } - ${
              campaign.sendingEnd ||
              "18:00"
            }`
          );

          await sleep(
            OUTSIDE_WINDOW_MS
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
            Number(
              campaign.dailyLimit ?? 50
            )
          );

        const sentToday =
          await getDailySentCount(
            campaignId
          );

        console.log(
          `[FOLLOW-UP][${campaignId}] 📊 Daily sent: ${sentToday}/${dailyLimit}`
        );

        if (
          sentToday >=
          dailyLimit
        ) {
          console.log(
            `[FOLLOW-UP][${campaignId}] 🛑 Daily limit reached`
          );

          await sleep(
            DAILY_LIMIT_WAIT_MS
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
              `[FOLLOW-UP][${campaignId}] ⏳ Next step ${
                next.step.stepNumber
              } in ${remaining} minute(s)`
            );
          } else {
            console.log(
              `[FOLLOW-UP][${campaignId}] ⏳ No pending scheduled steps`
            );

            /**
             * Check if campaign should be completed.
             */

            const pending =
              await prisma.followUpRecipient.count({
                where: {
                  campaignId,

                  status: {
                    in: [
                      "PENDING",
                      "RUNNING",
                    ],
                  },
                },
              });

            if (pending === 0) {
              await prisma.followUpCampaign.update({
                where: {
                  id: campaignId,
                },

                data: {
                  status:
                    "COMPLETED",
                },
              });

              console.log(
                `[FOLLOW-UP][${campaignId}] 🏁 Campaign automatically completed`
              );

              break;
            }
          }

          await sleep(
            OUTSIDE_WINDOW_MS
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
         * EMAIL CAMPAIGN INTERVAL
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
            `[FOLLOW-UP][${campaignId}] ⏳ Email interval: ${Math.round(
              interval / 1000
            )} seconds`
          );

          await sleep(
            interval
          );

          console.log(
            `[FOLLOW-UP][${campaignId}] ▶️ Email interval finished`
          );
        } else if (sent) {
          /**
           * Follow-up campaign:
           * next step already scheduled in DB.
           */

          await logNextFollowUp(
            campaignId,
            timezone
          );

          await sleep(
            1_000
          );
        } else {
          await sleep(
            ERROR_RETRY_MS
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
          ERROR_RETRY_MS
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
    `[FOLLOW-UP WORKER] 🕐 Server UTC: ${new Date().toISOString()}`
  );

  console.log(
    `[FOLLOW-UP WORKER] 🌍 Server Karachi: ${new Date().toLocaleString(
      "en-PK",
      {
        timeZone:
          DEFAULT_TIMEZONE,

        dateStyle:
          "medium",

        timeStyle:
          "medium",
      }
    )}`
  );

  console.log(
    "=================================================="
  );

  while (true) {
    try {
      /**
       * Activate scheduled campaigns.
       */

      await activateScheduledCampaigns();

      /**
       * Get running campaigns.
       */

      const campaigns =
        await getRunningCampaigns();

      /**
       * Start each campaign worker.
       */

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
        "[FOLLOW-UP WORKER] ❌ Global error:",
        error instanceof Error
          ? error.message
          : error
      );
    }

    await sleep(
      WORKER_POLL_MS
    );
  }
}

/**
 * ============================================================
 * START WORKER
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