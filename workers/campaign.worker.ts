import { prisma } from "@/lib/follow-up-api";
import {
  sendCampaignEmailViaSmtp,
  applyCampaignVariables,
  applySpinText,
} from "@/services/follow-up/campaign-send-adapter";

/**
 * ============================================================
 * ACTIVE CAMPAIGN WORKERS
 * ============================================================
 *
 * Har RUNNING campaign ka apna independent worker loop hoga.
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

/**
 * ============================================================
 * CAMPAIGN TYPE
 * ============================================================
 *
 * EMAIL:
 *   campaignType === "EMAIL"
 *
 * FOLLOW_UP:
 *   campaignType !== "EMAIL"
 *
 * null / old campaigns are treated as FOLLOW_UP.
 */

function isEmailCampaign(
  campaignType: string | null | undefined
): boolean {
  return campaignType === "EMAIL";
}

function getCampaignType(
  campaignType: string | null | undefined
): "EMAIL" | "FOLLOW_UP" {
  return isEmailCampaign(campaignType)
    ? "EMAIL"
    : "FOLLOW_UP";
}

/**
 * ============================================================
 * GET RUNNING CAMPAIGNS
 * ============================================================
 *
 * IMPORTANT:
 *
 * Do NOT filter by campaignType.
 *
 * Both EMAIL and FOLLOW_UP campaigns are required.
 */
async function getRunningCampaigns() {
  const campaigns =
    await prisma.followUpCampaign.findMany({
      where: {
        status: "RUNNING",
      },

      include: {
        smtpConfig: true,

        steps: {
          where: {
            enabled: true,
          },

          orderBy: {
            stepNumber: "asc",
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
 * DAILY SENT COUNT
 * ============================================================
 *
 * Counts successfully sent steps for this campaign today.
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
 * SENDING WINDOW
 * ============================================================
 */

function isWithinSendingWindow(
  now: Date,
  timezone: string,
  sendingStart: string,
  sendingEnd: string
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
      formatter.formatToParts(now);

    const hour = Number(
      parts.find(
        (part) =>
          part.type === "hour"
      )?.value || 0
    );

    const minute = Number(
      parts.find(
        (part) =>
          part.type === "minute"
      )?.value || 0
    );

    const [startHour, startMinute] =
      sendingStart
        .split(":")
        .map(Number);

    const [endHour, endMinute] =
      sendingEnd
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
     * Normal window:
     *
     * 09:00 -> 18:00
     */
    if (start <= end) {
      return (
        current >= start &&
        current < end
      );
    }

    /**
     * Overnight window:
     *
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
 * GET NEXT DUE STEP
 * ============================================================
 *
 * Only returns a step whose scheduledAt has arrived.
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
 * GET NEXT SCHEDULED FOLLOW-UP
 * ============================================================
 *
 * Used only for logging.
 *
 * This tells us:
 *
 * - which step will run
 * - which recipient
 * - exact UTC time
 * - exact Pakistan time
 * - remaining minutes
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
  campaignId: string
): Promise<void> {
  const next =
    await getNextScheduledFollowUp(
      campaignId
    );

  if (!next?.scheduledAt) {
    console.log(
      `[FOLLOW-UP][${campaignId}] ✅ No pending follow-up steps remaining`
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
        remainingMs /
          60_000
      )
    );

  const pakistanTime =
    scheduledAt.toLocaleString(
      "en-PK",
      {
        timeZone:
          "Asia/Karachi",

        dateStyle:
          "medium",

        timeStyle:
          "medium",
      }
    );

  console.log(
    `[FOLLOW-UP][${campaignId}] ⏳ No due follow-up step`
  );

  console.log(
    `[FOLLOW-UP][${campaignId}] 📅 Next Step: ${next.step.stepNumber}`
  );

  console.log(
    `[FOLLOW-UP][${campaignId}] 👤 Recipient: ${
      next.recipient.email?.email ||
      "UNKNOWN"
    }`
  );

  console.log(
    `[FOLLOW-UP][${campaignId}] 🕐 Scheduled UTC: ${scheduledAt.toISOString()}`
  );

  console.log(
    `[FOLLOW-UP][${campaignId}] 🇵🇰 Scheduled Pakistan Time: ${pakistanTime}`
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
      typeof getRunningCampaigns
    >
  >[number]
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
      "N/A"
    }`
  );

  /**
   * ========================================================
   * CLAIM STEP
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

    console.log(
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
    `[FOLLOW-UP][${campaign.id}] 📧 Sending: ${email.email}`
  );

  /**
   * ========================================================
   * SMTP
   * ========================================================
   *
   * IMPORTANT:
   *
   * We use ONLY:
   *
   * campaign.smtpConfigId
   *
   * We do NOT select another SMTP based on isActive.
   */

  try {
    if (!campaign.smtpConfigId) {
      throw new Error(
        "SMTP ID not assigned"
      );
    }

    const smtp =
      campaign.smtpConfig;

    if (!smtp) {
      throw new Error(
        `SMTP configuration not found for ID: ${campaign.smtpConfigId}`
      );
    }

    console.log(
      `[FOLLOW-UP][${campaign.id}] 🔌 SMTP ID: ${smtp.id}`
    );

    console.log(
      `[FOLLOW-UP][${campaign.id}] 📤 SMTP Sender: ${smtp.senderEmail}`
    );

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
         * Mark current step SENT.
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
         * Find next enabled step.
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
            new Date(
              sentAt
            );

          /**
           * delayDays is relative
           * to current step's send time.
           */
          nextScheduledAt.setUTCDate(
            nextScheduledAt.getUTCDate() +
              Math.max(
                0,
                nextStep.delayDays
              )
          );

          await tx.followUpRecipientStep.updateMany(
            {
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
            }
          );

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
                  "Asia/Karachi",

                dateStyle:
                  "medium",

                timeStyle:
                  "medium",
              }
            )}`
          );
        }

        /**
         * ====================================================
         * RECIPIENT COMPLETED
         * ====================================================
         */

        else {
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

          if (
            remaining === 0
          ) {
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
 * PROCESS ONE CAMPAIGN
 * ============================================================
 *
 * EMAIL:
 *
 *   send
 *   ↓
 *   interval
 *   ↓
 *   send
 *
 * FOLLOW_UP:
 *
 *   scheduledAt
 *   ↓
 *   send
 *   ↓
 *   delayDays
 *   ↓
 *   next scheduledAt
 *   ↓
 *   send
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

  /**
   * Prevent duplicate worker.
   */
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
    const campaignType =
      getCampaignType(
        initialCampaign.campaignType
      );

    const emailCampaign =
      campaignType ===
      "EMAIL";

    console.log("");

    console.log(
      "=================================================="
    );

    console.log(
      `[FOLLOW-UP][${campaignId}] 🚀 CAMPAIGN START`
    );

    console.log(
      `[FOLLOW-UP][${campaignId}] Name: ${initialCampaign.name}`
    );

    console.log(
      `[FOLLOW-UP][${campaignId}] Type: ${campaignType}`
    );

    console.log(
      `[FOLLOW-UP][${campaignId}] SMTP ID: ${
        initialCampaign.smtpConfigId ||
        "NOT ASSIGNED"
      }`
    );

    console.log(
      `[FOLLOW-UP][${campaignId}] Interval: ${initialCampaign.intervalValue} ${initialCampaign.intervalUnit}`
    );

    console.log(
      `[FOLLOW-UP][${campaignId}] Daily limit: ${initialCampaign.dailyLimit}`
    );

    console.log(
      `[FOLLOW-UP][${campaignId}] Sending Window: ${initialCampaign.sendingStart} - ${initialCampaign.sendingEnd}`
    );

    console.log(
      `[FOLLOW-UP][${campaignId}] Timezone: ${initialCampaign.timezone}`
    );

    console.log(
      "=================================================="
    );

    /**
     * EMAIL only.
     */
    const interval =
      intervalToMs(
        initialCampaign.intervalValue,
        initialCampaign.intervalUnit
      );

    /**
     * Daily limit.
     */
    const dailyLimit =
      Math.max(
        0,
        initialCampaign.dailyLimit ??
          50
      );

    /**
     * ========================================================
     * MAIN CAMPAIGN LOOP
     * ========================================================
     */

    while (true) {
      try {
        /**
         * Always reload latest campaign state.
         */
        const campaign =
          await prisma.followUpCampaign.findUnique({
            where: {
              id:
                campaignId,
            },

            include: {
              smtpConfig: true,

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
         * Campaign stopped.
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
         * ====================================================
         * SMTP ID VALIDATION
         * ====================================================
         *
         * The campaign must have an assigned SMTP ID.
         */
        if (
          !campaign.smtpConfigId
        ) {
          console.log(
            `[FOLLOW-UP][${campaignId}] ❌ SMTP ID not assigned`
          );

          break;
        }

        /**
         * The assigned SMTP must exist.
         */
        if (
          !campaign.smtpConfig
        ) {
          console.log(
            `[FOLLOW-UP][${campaignId}] ❌ Assigned SMTP not found: ${campaign.smtpConfigId}`
          );

          break;
        }

        /**
         * IMPORTANT:
         *
         * Do NOT check smtp.isActive here.
         *
         * Campaign already has a specific
         * smtpConfigId and that exact SMTP
         * is used.
         */

        /**
         * ====================================================
         * STEPS
         * ====================================================
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
            `[FOLLOW-UP][${campaignId}] ⏰ Outside sending window (${campaign.sendingStart}-${campaign.sendingEnd})`
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

          /**
           * Do NOT stop campaign.
           *
           * Tomorrow it can continue.
           */
          await sleep(
            60_000
          );

          continue;
        }

        /**
         * ====================================================
         * FIND DUE STEP
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
          /**
           * EMAIL
           */
          if (
            emailCampaign
          ) {
            console.log(
              `[FOLLOW-UP][${campaignId}] ⏳ No due email. Checking again in 30 seconds`
            );
          }

          /**
           * FOLLOW_UP
           */
          else {
            await logNextFollowUp(
              campaignId
            );
          }

          await sleep(
            30_000
          );

          continue;
        }

        /**
         * ====================================================
         * SEND ONE STEP
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
         *
         * ONLY EMAIL uses interval.
         */
        if (
          sent &&
          emailCampaign
        ) {
          console.log(
            `[FOLLOW-UP][${campaignId}] ⏳ EMAIL interval: ${Math.round(
              interval /
                1000
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
         * ====================================================
         * FOLLOW-UP
         * ====================================================
         *
         * Do NOT wait delayDays here.
         *
         * scheduledAt controls the next execution.
         */
        else if (
          sent &&
          !emailCampaign
        ) {
          console.log(
            `[FOLLOW-UP][${campaignId}] 📅 Next follow-up is controlled by scheduledAt`
          );

          /**
           * Immediately show next scheduled date.
           */
          await logNextFollowUp(
            campaignId
          );

          await sleep(
            1_000
          );
        }

        /**
         * Failed.
         */
        else {
          console.log(
            `[FOLLOW-UP][${campaignId}] ⚠️ Failed/skipped. Retrying/checking in 5 seconds`
          );

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
 * START FOLLOW-UP WORKER
 * ============================================================
 *
 * Global worker only discovers RUNNING campaigns.
 *
 * Every campaign has its own independent loop.
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
           * IMPORTANT:
           *
           * Don't await.
           *
           * Every campaign runs independently.
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
     * Only discovers new campaigns.
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