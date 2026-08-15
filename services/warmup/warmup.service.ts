import { prisma } from "@/services/database/prisma";
import { sendSMTPEmail } from "@/services/smtp/smtp.service";
import { personalizeWarmupTemplate } from "@/lib/groq/send";

/**
 * =========================================================
 * DEFAULT WARMUP TEMPLATES
 * =========================================================
 */

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
 * Maximum = 100
 */
function calculateDailyLimit(day: number) {
  return Math.min(
    MAX_DAILY_LIMIT,
    3 + (day - 1) * 3
  );
}

/**
 * =========================================================
 * RANDOM NEXT SEND DELAY
 * =========================================================
 *
 * Emails are distributed across 24 hours.
 * Random variation = ±35%.
 */
function calculateNextDelay(dailyLimit: number) {
  const averageMinutes =
    (24 * 60) / dailyLimit;

  const variation =
    averageMinutes * 0.35;

  return Math.max(
    5,
    Math.round(
      averageMinutes +
        (Math.random() * variation * 2 -
          variation)
    )
  );
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

function getRemainingMinutes(date: Date) {
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
      `⚠️ [${senderEmail}] Health record not found`
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
    `   Current Day : ${health.warmupDay}/${MAX_WARMUP_DAY}`
  );

  console.log(
    `   Last Date   : ${formatDate(lastDate)}`
  );

  console.log(
    `   Days Passed : ${diffDays}`
  );

  /**
   * Same day
   */
  if (diffDays < 1) {
    console.log(
      `   Status      : SAME DAY`
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

  console.log("");
  console.log(
    `📈 [${senderEmail}] WARMUP DAY ADVANCED`
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
    `✅ [${senderEmail}] Warmup day updated`
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
  systemEmails: any[],
  accountIndex: number,
  totalAccounts: number
) {
  const senderEmail =
    account.senderEmail;

  console.log("");
  console.log(
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  );

  console.log(
    `🚀 ACCOUNT ${accountIndex}/${totalAccounts} | ${senderEmail}`
  );

  console.log(
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  );

  try {
    /**
     * =======================================================
     * STEP 1 — LOAD HEALTH
     * =======================================================
     */

    console.log("");
    console.log(
      `🔍 [${senderEmail}] Loading email health...`
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
        `🆕 [${senderEmail}] Health record not found`
      );

      console.log(
        `   Creating new health record...`
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

            startedAt:
              new Date(),

            lastWarmupDate:
              new Date(),

            /**
             * First email ready immediately.
             */
            nextWarmupAt:
              new Date(),
          },
        });

      console.log(
        `✅ [${senderEmail}] Health record created`
      );

      console.log(
        `   Warmup Day  : 1`
      );

      console.log(
        `   Daily Limit : 3`
      );

      console.log(
        `   First Send  : READY NOW`
      );
    }

    /**
     * =======================================================
     * STEP 3 — UPDATE WARMUP DAY
     * =======================================================
     */

    console.log("");
    console.log(
      `📅 [${senderEmail}] Checking warmup day...`
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
     * STEP 4 — CURRENT STATUS
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
        `⏭️ [${senderEmail}] Account skipped`
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
        `   Progress : ${health.todaySent}/${health.dailyLimit}`
      );

      console.log(
        `   Action   : SKIPPED`
      );

      return;
    }

    /**
     * =======================================================
     * STEP 7 — CHECK TIMER
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
     * STEP 8 — READY
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

    console.log("");
    console.log(
      `🔍 [${senderEmail}] Finding receivers...`
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
     * Random receiver
     */
    const receiver =
      receivers[
        Math.floor(
          Math.random() *
            receivers.length
        )
      ];

    console.log("");
    console.log(
      `📨 [${senderEmail}] RECEIVER SELECTED`
    );

    console.log(
      `   Email   : ${receiver.username}`
    );

    console.log(
      `   Name    : ${receiver.name || "N/A"}`
    );

    console.log(
      `   Company : ${receiver.company || "N/A"}`
    );

    /**
     * =======================================================
     * STEP 10 — LOAD TEMPLATES
     * =======================================================
     */

    console.log("");
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
      `   User Templates : ${templates.length}`
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
      `   Selected       : "${template.subject}"`
    );

    /**
     * =======================================================
     * STEP 11 — AI PERSONALIZATION
     * =======================================================
     */

    console.log("");
    console.log(
      `🤖 [${senderEmail}] AI PERSONALIZATION START`
    );

    console.log(
      `   Original Subject : "${template.subject}"`
    );

    const aiStartedAt =
      Date.now();

    const personalizedTemplate =
      await personalizeWarmupTemplate({
        subject:
          template.subject,

        body:
          template.body || "",

        receiver: {
          email:
            receiver.username,

          username:
            receiver.username,

          name:
            receiver.name,

          firstName:
            receiver.firstName,

          lastName:
            receiver.lastName,

          company:
            receiver.company,
        },
      });

    const aiDuration =
      Date.now() -
      aiStartedAt;

    console.log("");
    console.log(
      `✅ [${senderEmail}] AI PERSONALIZATION COMPLETED`
    );

    console.log(
      `   Final Subject : "${personalizedTemplate.subject}"`
    );

    console.log(
      `   Duration      : ${aiDuration}ms`
    );

    console.log(
      `   Status        : SUCCESS`
    );

    /**
     * =======================================================
     * STEP 12 — SMTP SEND
     * =======================================================
     */

    console.log("");
    console.log(
      `📤 [${senderEmail}] SMTP SEND START`
    );

    console.log(
      `   From    : ${account.senderEmail}`
    );

    console.log(
      `   To      : ${receiver.username}`
    );

    console.log(
      `   Host    : ${account.host}`
    );

    console.log(
      `   Port    : ${account.port}`
    );

    console.log(
      `   Subject : "${personalizedTemplate.subject}"`
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
        personalizedTemplate.subject,

      html:
        personalizedTemplate.body ||
        "",
    });

    const sendDuration =
      Date.now() -
      sendStartedAt;

    console.log("");
    console.log(
      `✅ [${senderEmail}] SMTP SEND SUCCESS`
    );

    console.log(
      `   Duration : ${sendDuration}ms`
    );

    /**
     * =======================================================
     * STEP 13 — NEXT SEND
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
      `⏳ [${senderEmail}] NEXT SEND SCHEDULED`
    );

    console.log(
      `   Delay     : ${nextDelay} minutes`
    );

    console.log(
      `   Next Send : ${formatDate(nextWarmupAt)}`
    );

    /**
     * =======================================================
     * STEP 14 — UPDATE DATABASE
     * =======================================================
     */

    console.log("");
    console.log(
      `💾 [${senderEmail}] UPDATING EMAIL HEALTH`
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
         * Don't update lastWarmupDate here.
         * It is used for warmup-day calculation.
         */
        nextWarmupAt,
      },
    });

    const newTodaySent =
      health.todaySent + 1;

    const newTotalSent =
      health.totalSent + 1;

    console.log(
      `   Total Sent : ${newTotalSent}`
    );

    console.log(
      `   Today Sent : ${newTodaySent}/${health.dailyLimit}`
    );

    console.log(
      `   Status     : ✅ DATABASE UPDATED`
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
      `   Receiver : ${receiver.username}`
    );

    console.log(
      `   Subject  : "${personalizedTemplate.subject}"`
    );

    console.log(
      `   Progress : ${newTodaySent}/${health.dailyLimit}`
    );

    console.log(
      `   Next Send: ${formatDate(nextWarmupAt)}`
    );

    console.log("");
    console.log(
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    );

  } catch (error: any) {
    console.error("");
    console.error(
      `❌ [${senderEmail}] ACCOUNT FAILED`
    );

    console.error(
      `   Error: ${error?.message || error}`
    );

    if (error?.stack) {
      console.error(
        `   Stack: ${error.stack}`
      );
    }

    console.error("");
    console.error(
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
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
    "🚀 WARMUP CYCLE START"
  );

  console.log(
    `🕒 Started At: ${new Date().toLocaleString()}`
  );

  console.log(
    "############################################################"
  );

  /**
   * =======================================================
   * LOAD WARMUP ACCOUNTS
   * =======================================================
   */

  console.log("");
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
    console.log("");
    console.log(
      "⚠️ NO WARMUP ACCOUNTS FOUND"
    );

    return;
  }

  /**
   * Print account list
   */
  console.log("");

  warmupAccounts.forEach(
    (account, index) => {
      console.log(
        `   ${index + 1}. ${account.senderEmail}`
      );
    }
  );

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
    `📬 Active system emails: ${systemEmails.length}`
  );

  if (!systemEmails.length) {
    console.log("");
    console.log(
      "⚠️ NO ACTIVE SYSTEM EMAILS FOUND"
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
    "🔥 STARTING PARALLEL ACCOUNT PROCESSING"
  );

  console.log(
    `   Accounts : ${warmupAccounts.length}`
  );

  console.log(
    `   Receivers: ${systemEmails.length}`
  );

  console.log("");

  const results =
    await Promise.allSettled(
      warmupAccounts.map(
        (account, index) =>
          processAccount(
            account,
            systemEmails,
            index + 1,
            warmupAccounts.length
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

  /**
   * =======================================================
   * FINAL SUMMARY
   * =======================================================
   */

  console.log("");
  console.log(
    "############################################################"
  );

  console.log(
    "🏁 WARMUP CYCLE COMPLETED"
  );

  console.log(
    "############################################################"
  );

  console.log(
    `📧 Accounts Processed : ${warmupAccounts.length}`
  );

  console.log(
    `✅ Promise Fulfilled  : ${successful}`
  );

  console.log(
    `❌ Promise Rejected   : ${failed}`
  );

  console.log(
    `⏱️ Cycle Duration     : ${cycleDuration}ms`
  );

  console.log(
    `🕒 Completed At       : ${new Date().toLocaleString()}`
  );

  console.log(
    "############################################################"
  );

  console.log("");
}