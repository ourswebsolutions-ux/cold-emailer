import { prisma } from "@/services/database/prisma";
import { readInbox } from "@/services/smtp/imap.service";
import { sendSMTPEmail } from "@/services/smtp/smtp.service";

async function generateReply(email: any) {
  return `
Hi,

Thanks for your reply.

We have received your message and will get back to you shortly.

Best regards
`;
}

function getRandomReplyDelay() {
  const min = 5;
  const max = 45;

  const minutes =
    Math.floor(Math.random() * (max - min + 1)) + min;

  return {
    minutes,
    milliseconds: minutes * 60 * 1000,
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Skip automated emails
 */
function shouldSkipEmail(email: any) {
  const sender =
    email.from?.value?.[0]?.address?.toLowerCase() || "";

  if (!sender) return true;

  const domain = sender.split("@")[1];

  if (!domain) return true;

  // Block common automated addresses
  const blockedKeywords = [
    "noreply",
    "no-reply",
    "donotreply",
    "do-not-reply",
    "mailer-daemon",
    "postmaster",
    "bounce",
    "newsletter",
    "notification",
    "notifications",
    "verify",
    "verification",
    "security",
    "alert",
  ];

  if (blockedKeywords.some((k) => sender.includes(k))) {
    return true;
  }

  // Allow Gmail
  if (domain === "gmail.com") {
    return false;
  }

  // Allow company domains only
  // Example: abc.com, microsoft.com, axorawebsolutions.com
  if (
    domain.includes(".") &&
    ![
      "facebook.com",
      "facebookmail.com",
      "linkedin.com",
      "linkedinmail.com",
      "instagram.com",
      "twitter.com",
      "x.com",
      "em.linkedin.com",
      "tiktok.com",
      "youtube.com",
      "google.com",
      "github.com",
      "gitlab.com",
      "bitbucket.org",
      "slack.com",
      "discord.com",
      "zoom.us",
    ].includes(domain)
  ) {
    return false;
  }

  return true;
}

async function startReplyWorker() {
  console.log("📩 Reply worker started");

  while (true) {
    try {
      const systems = await prisma.systemConfig.findMany({
        where: {
          isActive: true,
        },
      });

      console.log(`📧 Active accounts found: ${systems.length}`);

      for (const system of systems) {
        try {
          console.log(`\n🔍 Checking inbox: ${system.username}`);

          const emails = await readInbox({
            host: "imap.gmail.com",
            port: 993,
            username: system.username,
            password: system.password,
          });

          console.log(`📨 New emails found: ${emails.length}`);

          for (const email of emails) {
            try {
              const sender =
                email.from?.value?.[0]?.address;

              if (!sender) {
                console.log("⚠️ Sender not found");
                continue;
              }

              if (shouldSkipEmail(email)) {
                console.log(
                  `⏭️ Skipping automated/social email: ${sender}`
                );
                continue;
              }

              const delay = getRandomReplyDelay();

              console.log(
                `⏳ Reply scheduled for ${sender} after ${delay.minutes} minutes`
              );

              await sleep(delay.milliseconds);

              const reply = await generateReply(email);

              console.log("📤 Sending reply...", {
                from: system.username,
                to: sender,
                subject: email.subject,
              });

              await sendSMTPEmail({
                host: "smtp.gmail.com",
                port: 465,
                from: system.username,
                to: sender,
                subject: email.subject?.startsWith("Re:")
                  ? email.subject
                  : `Re: ${email.subject}`,
                text: reply,
                username: system.username,
                password: system.password,
              });

              // Update Email Health
            // Update Email Health
const smtpAccount = await prisma.sMTPConfig.findFirst({
  where: {
    senderEmail: system.username,
  },
});

if (smtpAccount) {
  await prisma.emailHealth.upsert({
    where: {
      smtpConfigId: smtpAccount.id,
    },
    update: {
      totalReplies: {
        increment: 1,
      },
      todayReplies: {
        increment: 1,
      },
      updatedAt: new Date(),
    },
    create: {
      smtpConfigId: smtpAccount.id,

      // Warmup
      warmupDay: 1,
      dailyLimit: 3,
      completed: false,

      // Totals
      totalSent: 0,
      totalReplies: 1,

      // Daily Counters
      todaySent: 0,
      todayReplies: 1,

      // Health starts from 0
      health: 0,

      startedAt: new Date(),
      lastWarmupDate: new Date(),
    },
  });
}

              console.log(
                `✅ Reply sent successfully: ${sender}`
              );
            } catch (err) {
              console.error(
                "❌ Reply send failed:",
                err
              );
            }
          }
        } catch (err) {
          console.error(
            `❌ Inbox error (${system.username}):`,
            err
          );
        }
      }
    } catch (err) {
      console.error("❌ Worker Error:", err);
    }

    const nextCheck =
      Math.floor(Math.random() * (10 - 5 + 1)) + 5;

    console.log(
      `⏰ Next inbox check after ${nextCheck} minutes`
    );

    await sleep(nextCheck * 60 * 1000);
  }
}

startReplyWorker();