import { prisma } from "@/services/database/prisma";
import { sendSMTPEmail } from "@/services/smtp/smtp.service";

const defaultTemplates = [
  {
    subject: "Quick Follow-up",
    body: `
Hi,

I just wanted to follow up and make sure everything is working as expected.

No action is needed on your end—this is simply a routine email to maintain healthy communication.

Have a great day!

Best regards
`,
  },
  {
    subject: "Checking In",
    body: `
Hello,

Hope you're doing well.

This is a quick check-in message sent as part of our regular communication process.

Wishing you a productive day ahead.

Kind regards
`,
  },
  {
    subject: "Routine Email",
    body: `
Hi,

Just sending a quick message to stay in touch and ensure smooth email communication.

Thank you and have a wonderful day.

Regards
`,
  },
];

/**
 * =========================================================
 * WARMUP CONFIG
 * =========================================================
 */

const MAX_WARMUP_DAY = 30;
const MAX_DAILY_LIMIT = 100;

/**
 * Day 1 = 3
 * Day 2 = 6
 * Day 3 = 9
 * ...
 * Max = 100
 */
function calculateDailyLimit(day: number) {
  return Math.min(
    MAX_DAILY_LIMIT,
    3 + (day - 1) * 3
  );
}

/**
 * Calculate random delay for next email.
 *
 * Emails are distributed across 24 hours.
 * Random variation = ±35%
 */
function calculateNextDelay(
  dailyLimit: number
) {
  const averageMinutes =
    (24 * 60) / dailyLimit;

  const variation =
    averageMinutes * 0.35;

  const minutes = Math.max(
    5,
    Math.round(
      averageMinutes +
        (Math.random() * variation * 2 -
          variation)
    )
  );

  return minutes;
}

/**
 * =========================================================
 * FORMAT HELPERS
 * =========================================================
 */

function formatDate(date: Date | null) {
  if (!date) {
    return "N/A";
  }

  return date.toLocaleString();
}

function getRemainingMinutes(
  date: Date
) {
  const difference =
    date.getTime() - Date.now();

  if (difference <= 0) {
    return 0;
  }

  return Math.ceil(
    difference / (60 * 1000)
  );
}

/**
 * =========================================================
 * UPDATE WARMUP DAY
 * =========================================================
 */

async function updateWarmupDay(
  accountId: string,
  senderEmail: string
) {
  console.log(
    `📅 [${senderEmail}] Checking warmup day...`
  );

  const health =
    await prisma.emailHealth.findUnique({
      where: {
        smtpConfigId: accountId,
      },
    });

  if (!health) {
    console.log(
      `⚠️ [${senderEmail}] Health record not found while updating day`
    );

    return null;
  }

  const now = new Date();

  const lastDate =
    health.lastWarmupDate
      ? new Date(
          health.lastWarmupDate
        )
      : now;

  const diffDays = Math.floor(
    (now.getTime() -
      lastDate.getTime()) /
      (24 * 60 * 60 * 1000)
  );

  console.log(
    `📅 [${senderEmail}] Current warmup day: ${health.warmupDay}/${MAX_WARMUP_DAY}`
  );

  console.log(
    `📅 [${senderEmail}] Last warmup date: ${formatDate(lastDate)}`
  );

  console.log(
    `📅 [${senderEmail}] Days since last warmup: ${diffDays}`
  );

  /**
   * Same day
   */
  if (diffDays < 1) {
    console.log(
      `📅 [${senderEmail}] Same warmup day. No day update needed.`
    );

    return health;
  }

  /**
   * New day
   */
  const nextDay = Math.min(
    health.warmupDay + diffDays,
    MAX_WARMUP_DAY
  );

  const dailyLimit =
    calculateDailyLimit(nextDay);

  const delay =
    calculateNextDelay(
      dailyLimit
    );

  const nextWarmupAt =
    new Date(
      now.getTime() +
        delay * 60 * 1000
    );

  console.log(
    `📈 [${senderEmail}] NEW WARMUP DAY`
  );

  console.log(
    `   Previous Day : ${health.warmupDay}`
  );

  console.log(
    `   New Day      : ${nextDay}`
  );

  console.log(
    `   Daily Limit  : ${dailyLimit}`
  );

  console.log(
    `   Next Delay   : ${delay} minutes`
  );

  console.log(
    `   Next Send    : ${formatDate(nextWarmupAt)}`
  );

  const updated =
    await prisma.emailHealth.update({
      where: {
        smtpConfigId: accountId,
      },

      data: {
        warmupDay: nextDay,

        dailyLimit,

        todaySent: 0,

        todayReplies: 0,

        completed:
          nextDay >=
          MAX_WARMUP_DAY,

        lastWarmupDate: now,

        nextWarmupAt,
      },
    });

  console.log(
    `✅ [${senderEmail}] Warmup day updated successfully`
  );

  return updated;
}

/**
 * =========================================================
 * PROCESS ONE SMTP ACCOUNT
 * =========================================================
 */

async function processAccount(
  account: any,
  systemEmails: any[]
) {
  const senderEmail =
    account.senderEmail;

  console.log("");
  console.log(
    "------------------------------------------------------------"
  );

  console.log(
    `🚀 ACCOUNT PROCESS START: ${senderEmail}`
  );

  console.log(
    "------------------------------------------------------------"
  );

  try {
    /**
     * =======================================================
     * STEP 1 — LOAD HEALTH
     * =======================================================
     */

    console.log(
      `🔍 [${senderEmail}] STEP 1: Loading email health...`
    );

    let health =
      await prisma.emailHealth.findUnique({
        where: {
          smtpConfigId: account.id,
        },
      });

    /**
     * =======================================================
     * STEP 2 — CREATE HEALTH IF NOT EXISTS
     * =======================================================
     */

    if (!health) {
      console.log(
        `🆕 [${senderEmail}] No health record found. Creating...`
      );

      const dailyLimit = 3;

      health =
        await prisma.emailHealth.create({
          data: {
            smtpConfigId:
              account.id,

            warmupDay: 1,

            dailyLimit,

            totalSent: 0,

            totalReplies: 0,

            todaySent: 0,

            todayReplies: 0,

            health: 0,

            completed: false,

            startedAt: new Date(),

            lastWarmupDate:
              new Date(),

            /**
             * IMPORTANT:
             * First email is ready immediately.
             */
            nextWarmupAt:
              new Date(),
          },
        });

      console.log(
        `✅ [${senderEmail}] Health record created`
      );

      console.log(
        `📅 [${senderEmail}] Warmup Day: 1`
      );

      console.log(
        `📧 [${senderEmail}] Daily Limit: 3`
      );

      console.log(
        `🚀 [${senderEmail}] First email is READY NOW`
      );
    }

    /**
     * =======================================================
     * STEP 3 — UPDATE WARMUP DAY
     * =======================================================
     */

    console.log(
      `📅 [${senderEmail}] STEP 2: Checking warmup day...`
    );

    const updatedHealth =
      await updateWarmupDay(
        account.id,
        senderEmail
      );

    if (updatedHealth) {
      health = updatedHealth;
    }

    /**
     * =======================================================
     * STEP 4 — PRINT CURRENT STATUS
     * =======================================================
     */

    const now = new Date();

    console.log("");
    console.log(
      `📊 [${senderEmail}] ACCOUNT STATUS`
    );

    console.log(
      `   Warmup Day    : ${health.warmupDay}/${MAX_WARMUP_DAY}`
    );

    console.log(
      `   Daily Limit   : ${health.dailyLimit}`
    );

    console.log(
      `   Today Sent    : ${health.todaySent}/${health.dailyLimit}`
    );

    console.log(
      `   Total Sent    : ${health.totalSent}`
    );

    console.log(
      `   Total Replies : ${health.totalReplies}`
    );

    console.log(
      `   Completed     : ${health.completed}`
    );

    console.log(
      `   Next Warmup   : ${formatDate(health.nextWarmupAt)}`
    );

    console.log(
      `   Current Time  : ${formatDate(now)}`
    );

    /**
     * =======================================================
     * STEP 5 — CHECK COMPLETED
     * =======================================================
     */

    if (health.completed) {
      console.log("");
      console.log(
        `🏁 [${senderEmail}] WARMUP COMPLETED`
      );

      console.log(
        `⏭️ [${senderEmail}] Skipping account`
      );

      return;
    }

    /**
     * =======================================================
     * STEP 6 — CHECK DAILY LIMIT
     * =======================================================
     */

    if (
      health.todaySent >=
      health.dailyLimit
    ) {
      console.log("");
      console.log(
        `⛔ [${senderEmail}] DAILY LIMIT REACHED`
      );

      console.log(
        `   ${health.todaySent}/${health.dailyLimit} emails sent today`
      );

      return;
    }

    /**
     * =======================================================
     * STEP 7 — CHECK INDIVIDUAL TIMER
     * =======================================================
     */

    if (
      health.nextWarmupAt &&
      health.nextWarmupAt.getTime() >
        now.getTime()
    ) {
      const remaining =
        getRemainingMinutes(
          health.nextWarmupAt
        );

      console.log("");
      console.log(
        `⏳ [${senderEmail}] WAITING FOR NEXT SEND`
      );

      console.log(
        `   Next Send : ${formatDate(health.nextWarmupAt)}`
      );

      console.log(
        `   Remaining : ${remaining} minutes`
      );

      return;
    }

    /**
     * =======================================================
     * STEP 8 — ACCOUNT IS READY
     * =======================================================
     */

    console.log("");
    console.log(
      `🟢 [${senderEmail}] READY TO SEND`
    );

    /**
     * =======================================================
     * STEP 9 — FIND RECEIVERS
     * =======================================================
     */

    console.log(
      `🔍 [${senderEmail}] Finding available receivers...`
    );

    const receivers =
      systemEmails.filter(
        (item) =>
          item.username !==
          senderEmail
      );

    console.log(
      `📬 [${senderEmail}] Available receivers: ${receivers.length}`
    );

    if (!receivers.length) {
      console.log(
        `⚠️ [${senderEmail}] NO RECEIVER AVAILABLE`
      );

      return;
    }

    /**
     * Select random receiver
     */
    const receiver =
      receivers[
        Math.floor(
          Math.random() *
            receivers.length
        )
      ];

    console.log(
      `📨 [${senderEmail}] Selected receiver: ${receiver.username}`
    );

    /**
     * =======================================================
     * STEP 10 — LOAD EMAIL TEMPLATES
     * =======================================================
     */

    console.log(
      `📝 [${senderEmail}] Loading email templates...`
    );

    const templates =
      await prisma.emailTemplate.findMany({
        where: {
          userId:
            account.userId,
        },

        select: {
          subject: true,
          body: true,
        },
      });

    console.log(
      `📝 [${senderEmail}] User templates found: ${templates.length}`
    );

    const template =
      templates.length > 0
        ? templates[
            Math.floor(
              Math.random() *
                templates.length
            )
          ]
        : defaultTemplates[
            Math.floor(
              Math.random() *
                defaultTemplates.length
            )
          ];

    console.log(
      `📝 [${senderEmail}] Selected subject: "${template.subject}"`
    );

    /**
     * =======================================================
     * STEP 11 — SEND SMTP EMAIL
     * =======================================================
     */

    console.log("");
    console.log(
      `📤 [${senderEmail}] SMTP SEND START`
    );

    console.log(
      `   FROM     : ${account.senderEmail}`
    );

    console.log(
      `   TO       : ${receiver.username}`
    );

    console.log(
      `   HOST     : ${account.host}`
    );

    console.log(
      `   PORT     : ${account.port}`
    );

    console.log(
      `   SUBJECT  : ${template.subject}`
    );

    const sendStartedAt =
      Date.now();

    await sendSMTPEmail({
      host: account.host,

      port: account.port,

      username:
        account.username,

      password:
        account.password,

      from:
        account.senderEmail,

      fromName:
        account.senderName ||
        "Warmup",

      to:
        receiver.username,

      subject:
        template.subject,

      html:
        template.body || "",
    });

    const sendDuration =
      Date.now() -
      sendStartedAt;

    console.log("");
    console.log(
      `✅ [${senderEmail}] SMTP SEND SUCCESS`
    );

    console.log(
      `⏱️ [${senderEmail}] SMTP duration: ${sendDuration}ms`
    );

    /**
     * =======================================================
     * STEP 12 — CALCULATE NEXT SEND
     * =======================================================
     */

    const nextDelay =
      calculateNextDelay(
        health.dailyLimit
      );

    const nextWarmupAt =
      new Date(
        Date.now() +
          nextDelay *
            60 *
            1000
      );

    console.log("");
    console.log(
      `⏳ [${senderEmail}] NEXT EMAIL CALCULATED`
    );

    console.log(
      `   Delay    : ${nextDelay} minutes`
    );

    console.log(
      `   Next Send: ${formatDate(nextWarmupAt)}`
    );

    /**
     * =======================================================
     * STEP 13 — UPDATE DATABASE
     * =======================================================
     */

    console.log(
      `💾 [${senderEmail}] Updating email health...`
    );

    await prisma.emailHealth.update({
      where: {
        smtpConfigId:
          account.id,
      },

      data: {
        totalSent: {
          increment: 1,
        },

        todaySent: {
          increment: 1,
        },

        /**
         * IMPORTANT:
         *
         * Don't update lastWarmupDate here.
         * It is used for warmup-day calculation.
         */

        nextWarmupAt,
      },
    });

    console.log(
      `✅ [${senderEmail}] Database updated`
    );

    /**
     * =======================================================
     * FINAL SUCCESS
     * =======================================================
     */

    console.log("");
    console.log(
      `🎉 [${senderEmail}] WARMUP EMAIL COMPLETED`
    );

    console.log(
      `   Sent To     : ${receiver.username}`
    );

    console.log(
      `   Today       : ${health.todaySent + 1}/${health.dailyLimit}`
    );

    console.log(
      `   Next Email  : ${formatDate(nextWarmupAt)}`
    );

    console.log(
      "------------------------------------------------------------"
    );
  } catch (error) {
    console.error("");
    console.error(
      `❌ [${senderEmail}] WARMUP FAILED`
    );

    console.error(
      `❌ [${senderEmail}] Error:`,
      error
    );

    console.error(
      "------------------------------------------------------------"
    );
  }
}

/**
 * =========================================================
 * MAIN WARMUP CYCLE
 * =========================================================
 */

export async function runWarmupCycle() {
  const cycleStartedAt =
    Date.now();

  console.log("");
  console.log(
    "############################################################"
  );

  console.log(
    `🚀 WARMUP CYCLE START: ${new Date().toLocaleString()}`
  );

  console.log(
    "############################################################"
  );

  /**
   * =======================================================
   * LOAD WARMUP ACCOUNTS
   * =======================================================
   */

  console.log(
    "🔍 Loading warmup SMTP accounts..."
  );

  const warmupAccounts =
    await prisma.sMTPConfig.findMany({
      where: {
        warmup: true,
      },
    });

  console.log(
    `📧 Warmup accounts found: ${warmupAccounts.length}`
  );

  if (!warmupAccounts.length) {
    console.log(
      "❌ NO WARMUP ACCOUNTS FOUND"
    );

    return;
  }

  /**
   * Print accounts
   */
  for (
    let i = 0;
    i < warmupAccounts.length;
    i++
  ) {
    console.log(
      `   ${i + 1}. ${warmupAccounts[i].senderEmail}`
    );
  }

  /**
   * =======================================================
   * LOAD RECEIVERS
   * =======================================================
   */

  console.log("");
  console.log(
    "🔍 Loading active system emails..."
  );

  const systemEmails =
    await prisma.systemConfig.findMany({
      where: {
        isActive: true,
      },
    });

  console.log(
    `📬 Active system emails found: ${systemEmails.length}`
  );

  if (!systemEmails.length) {
    console.log(
      "❌ NO ACTIVE SYSTEM EMAILS FOUND"
    );

    return;
  }

  /**
   * =======================================================
   * PARALLEL PROCESSING
   * =======================================================
   */

  console.log("");
  console.log(
    "🔥 STARTING ALL ACCOUNTS IN PARALLEL"
  );

  console.log(
    `🔥 Total accounts to process: ${warmupAccounts.length}`
  );

  const results =
    await Promise.allSettled(
      warmupAccounts.map(
        (account) =>
          processAccount(
            account,
            systemEmails
          )
      )
    );

  /**
   * =======================================================
   * RESULTS
   * =======================================================
   */

  const successful =
    results.filter(
      (result) =>
        result.status ===
        "fulfilled"
    ).length;

  const failed =
    results.filter(
      (result) =>
        result.status ===
        "rejected"
    ).length;

  const cycleDuration =
    Date.now() -
    cycleStartedAt;

  console.log("");
  console.log(
    "############################################################"
  );

  console.log(
    `✅ WARMUP CYCLE COMPLETED`
  );

  console.log(
    `📧 Accounts processed : ${warmupAccounts.length}`
  );

  console.log(
    `✅ Promise fulfilled   : ${successful}`
  );

  console.log(
    `❌ Promise rejected    : ${failed}`
  );

  console.log(
    `⏱️ Cycle duration      : ${cycleDuration}ms`
  );

  console.log(
    `🕒 Completed at        : ${new Date().toLocaleString()}`
  );

  console.log(
    "############################################################"
  );

  console.log("");
}