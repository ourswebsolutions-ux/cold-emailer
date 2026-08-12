import { prisma } from "@/services/database/prisma";
import { readInbox } from "@/services/smtp/imap.service";
import { sendSMTPEmail } from "@/services/smtp/smtp.service";
import { generateAIReply } from "@/lib/groq/reply";
// ============================================================
// IN-MEMORY PROCESSED MESSAGE TRACKING
// No database required
// ============================================================

const processedMessages = new Set<string>();

// ============================================================
// GENERATE REPLY
// ============================================================

async function generateReply(email: any) {
  console.log("🤖 Generating automatic reply...");

  const sender =
    normalizeEmail(email.from?.value?.[0]?.address) ||
    normalizeEmail(email.from) ||
    "";

  const senderName =
    email.from?.value?.[0]?.name ||
    email.from?.name ||
    "";

  const subject = String(email.subject || "").trim();

  const body =
    email.text ||
    email.textBody ||
    email.body ||
    email.html ||
    email.htmlBody ||
    email.message ||
    "";

  const reply = await generateAIReply({
    senderEmail: sender,
    senderName: senderName || undefined,
    subject,
    body: String(body).trim(),
    date: email.date,
    messageId: getMessageId(email) || undefined,
  });

  return reply;
}

// ============================================================
// REPLY DELAY
// TESTING: 1 MINUTE
// ============================================================

function getRandomReplyDelay() {
  const min = 1;
  const max = 1;

  const minutes =
    Math.floor(Math.random() * (max - min + 1)) + min;

  console.log(
    `⏱️ Reply delay selected: ${minutes} minute(s)`
  );

  return {
    minutes,
    milliseconds: minutes * 60 * 1000,
  };
}

// ============================================================
// SLEEP
// ============================================================

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================
// NORMALIZE EMAIL
// ============================================================

function normalizeEmail(value?: string) {
  return value?.toLowerCase().trim() || "";
}

// ============================================================
// GET MESSAGE ID
// ============================================================

function getMessageId(email: any) {
  const messageId =
    email.messageId ||
    email.headers?.["message-id"] ||
    email.headers?.["Message-ID"] ||
    "";

  return String(messageId).trim();
}

// ============================================================
// CHECK AUTOMATED / UNWANTED SENDERS
// ============================================================

function shouldSkipEmail(email: any) {
  const sender = normalizeEmail(
    email.from?.value?.[0]?.address
  );

  console.log("🔎 Checking sender:", sender);

  if (!sender) {
    console.log("❌ Sender email is missing");
    return true;
  }

  const domain = sender.split("@")[1];

  if (!domain) {
    console.log("❌ Sender domain is missing");
    return true;
  }

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

  const blocked = blockedKeywords.some((keyword) =>
    sender.includes(keyword)
  );

  if (blocked) {
    console.log(
      `⏭️ Automated sender blocked: ${sender}`
    );

    return true;
  }

  const blockedDomains = [
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
    "mg.remote.co",
    
  ];

  if (blockedDomains.includes(domain)) {
    console.log(
      `⏭️ Automated/social domain blocked: ${domain}`
    );

    return true;
  }

  console.log(
    `✅ Sender passed basic filter: ${sender}`
  );

  return false;
}

// ============================================================
// DECIDE WHETHER AUTO REPLY IS ALLOWED
// ============================================================

function shouldAutoReply(email: any) {
  console.log("");
  console.log("🔎 AUTO-REPLY RULE CHECK");

  const sender = normalizeEmail(
    email.from?.value?.[0]?.address
  );

  if (!sender) {
    console.log("❌ No sender");
    return false;
  }

  // ----------------------------------------------------------
  // Skip if no valid message ID
  // ----------------------------------------------------------

  const messageId = getMessageId(email);

  if (!messageId) {
    console.log(
      "⚠️ Message ID not available"
    );

    // We can still process the email.
    // The limitation is that duplicate protection
    // cannot work for this message.
  }

  // ----------------------------------------------------------
  // Check duplicate
  // ----------------------------------------------------------

  if (
    messageId &&
    processedMessages.has(messageId)
  ) {
    console.log(
      "⏭️ Message already processed in this worker session"
    );

    console.log(
      "🆔 Message ID:",
      messageId
    );

    return false;
  }

  // ----------------------------------------------------------
  // Skip automated senders
  // ----------------------------------------------------------

  if (shouldSkipEmail(email)) {
    console.log(
      "⏭️ Auto-reply denied because sender is automated"
    );

    return false;
  }

  // ----------------------------------------------------------
  // Require a recognizable subject
  // ----------------------------------------------------------

  const subject =
    String(email.subject || "").trim();

  if (!subject) {
    console.log(
      "⏭️ Auto-reply skipped: subject is empty"
    );

    return false;
  }

  console.log(
    "✅ Auto-reply rules passed"
  );

  console.log(
    "📧 Sender:",
    sender
  );

  console.log(
    "📋 Subject:",
    subject
  );

  return true;
}

// ============================================================
// MARK MESSAGE AS PROCESSED
// ============================================================

function markMessageProcessed(email: any) {
  const messageId = getMessageId(email);

  if (!messageId) {
    console.log(
      "⚠️ Cannot mark message as processed: Message ID missing"
    );

    return;
  }

  processedMessages.add(messageId);

  console.log("");
  console.log(
    "💾 MESSAGE MARKED AS PROCESSED"
  );

  console.log(
    "🆔 Message ID:",
    messageId
  );

  console.log(
    "📊 Processed messages in memory:",
    processedMessages.size
  );
}

// ============================================================
// CLEAN OLD IN-MEMORY DATA
// ============================================================

function cleanupProcessedMessages() {
  // Keep memory usage bounded.
  // This is only runtime protection.
  const MAX_PROCESSED_MESSAGES = 5000;

  if (
    processedMessages.size <=
    MAX_PROCESSED_MESSAGES
  ) {
    return;
  }

  console.log(
    "🧹 Cleaning processed message memory..."
  );

  const messages =
    Array.from(processedMessages);

  processedMessages.clear();

  // Keep the newest portion
  const keepCount = 2500;

  messages
    .slice(-keepCount)
    .forEach((messageId) => {
      processedMessages.add(messageId);
    });

  console.log(
    `✅ Processed message memory cleaned. Current size: ${processedMessages.size}`
  );
}

// ============================================================
// START REPLY WORKER
// ============================================================

async function startReplyWorker() {
  console.log("");
  console.log(
    "=============================================="
  );
  console.log(
    "🚀 REPLY WORKER STARTED"
  );
  console.log(
    "=============================================="
  );

  console.log(
    "🕐 Started:",
    new Date().toISOString()
  );

  console.log(
    "💾 Database:",
    "Used for SMTPConfig + EmailHealth"
  );

  console.log(
    "🧠 Processed message tracking:",
    "IN-MEMORY"
  );

  console.log(
    "=============================================="
  );

  while (true) {
    try {
      console.log("");
      console.log(
        "=============================================="
      );
      console.log(
        "🔄 NEW REPLY WORKER CYCLE"
      );
      console.log(
        "=============================================="
      );

      console.log(
        "🕐 Cycle started:",
        new Date().toISOString()
      );

      cleanupProcessedMessages();

      // ========================================================
      // GET ACTIVE SYSTEM ACCOUNTS
      // ========================================================

      console.log("");
      console.log(
        "🔍 Fetching active SystemConfig accounts..."
      );

      const systems =
        await prisma.systemConfig.findMany({
          where: {
            isActive: true,
          },
          orderBy: {
            createdAt: "desc",
          },
        });

      console.log(
        `📊 Active system accounts: ${systems.length}`
      );

      if (!systems.length) {
        console.log(
          "⚠️ No active SystemConfig accounts found"
        );
      }

      // ========================================================
      // PROCESS SYSTEM ACCOUNTS
      // ========================================================

      for (const system of systems) {
        try {
          console.log("");
          console.log(
            "=============================================="
          );
          console.log(
            "📮 SYSTEM ACCOUNT"
          );
          console.log(
            "=============================================="
          );

          console.log(
            "🆔 ID:",
            system.id
          );

          console.log(
            "👤 User ID:",
            system.userId
          );

          console.log(
            "📧 Username:",
            system.username
          );

          console.log(
            "📧 Sender Email:",
            system.senderEmail
          );

          console.log(
            "🔘 Active:",
            system.isActive
          );

          // ======================================================
          // READ INBOX
          // ======================================================

          console.log("");
          console.log(
            `📥 Checking inbox for: ${system.username}`
          );

          const emails = await readInbox({
            host: "imap.gmail.com",
            port: 993,
            username: system.username,
            password: system.password,
          });

          console.log("");
          console.log(
            `📨 Inbox returned ${emails.length} email(s)`
          );

          if (!emails.length) {
            console.log(
              "📭 No unread emails"
            );

            continue;
          }

          // ======================================================
          // PROCESS EMAILS
          // ======================================================

          for (const email of emails) {
            try {
              console.log("");
              console.log(
                "=============================================="
              );
              console.log(
                "📩 INCOMING EMAIL"
              );
              console.log(
                "=============================================="
              );

              const messageId =
                getMessageId(email);

              const sender =
                normalizeEmail(
                  email.from?.value?.[0]?.address
                );

              const subject =
                String(
                  email.subject || ""
                ).trim();

              console.log(
                "🆔 Message ID:",
                messageId || "N/A"
              );

              console.log(
                "📧 Sender:",
                sender
              );

              console.log(
                "📥 Receiving system:",
                system.username
              );

              console.log(
                "📋 Subject:",
                subject
              );

              console.log(
                "📅 Date:",
                email.date
              );

              // ==================================================
              // BASIC VALIDATION
              // ==================================================

              if (!sender) {
                console.log(
                  "❌ Sender missing"
                );

                continue;
              }

              // ==================================================
              // DUPLICATE CHECK
              // ==================================================

              if (
                messageId &&
                processedMessages.has(messageId)
              ) {
                console.log("");
                console.log(
                  "⏭️ DUPLICATE EMAIL"
                );

                console.log(
                  "🆔 Already processed:",
                  messageId
                );

                continue;
              }

              // ==================================================
              // AUTO REPLY RULE
              // ==================================================

              console.log("");
              console.log(
                "🔎 Checking auto-reply eligibility..."
              );

              const allowed =
                shouldAutoReply(email);

              if (!allowed) {
                console.log(
                  "⏭️ Auto-reply not allowed for this email"
                );

                continue;
              }

              console.log(
                "✅ Email is eligible for auto-reply"
              );

              // ==================================================
              // DELAY
              // ==================================================

              const delay =
                getRandomReplyDelay();

              console.log("");
              console.log(
                "⏳ REPLY SCHEDULED"
              );

              console.log(
                "📧 To:",
                sender
              );

              console.log(
                "⏱️ Delay:",
                `${delay.minutes} minute(s)`
              );

              await sleep(
                delay.milliseconds
              );

              console.log(
                "✅ Delay completed"
              );

              // ==================================================
              // GENERATE REPLY
              // ==================================================

              const reply =
                await generateReply(email);

              console.log(
                `✅ Reply generated ${reply} character(s)`
              );

              // ==================================================
              // SUBJECT
              // ==================================================

              const replySubject =
                subject
                  .toLowerCase()
                  .startsWith("re:")
                  ? subject
                  : `Re: ${
                      subject ||
                      "Checking In"
                    }`;

              // ==================================================
              // SEND REPLY
              // ==================================================

              console.log("");
              console.log(
                "=============================================="
              );
              console.log(
                "📤 SENDING REPLY"
              );
              console.log(
                "=============================================="
              );

              console.log(
                "FROM:",
                system.username
              );

              console.log(
                "TO:",
                sender
              );

              console.log(
                "SUBJECT:",
                replySubject
              );

              await sendSMTPEmail({
                host: "smtp.gmail.com",
                port: 465,
                from: system.username,
                to: sender,
                subject: replySubject,
                html: reply,
                username: system.username,
                password: system.password,
              });

              console.log("");
              console.log(
                "✅ REPLY SENT SUCCESSFULLY"
              );

              console.log(
                `📤 ${system.username} → ${sender}`
              );

              // ==================================================
              // MARK PROCESSED
              // ==================================================

              markMessageProcessed(email);

              // ==================================================
              // FIND SMTP CONFIG
              // ==================================================

              console.log("");
              console.log(
                "=============================================="
              );
              console.log(
                "🔎 FINDING MATCHING SMTP CONFIG"
              );
              console.log(
                "=============================================="
              );

              const normalizedSender =
                normalizeEmail(sender);

              console.log(
                "📧 Looking for:",
                normalizedSender
              );

              const smtpConfigs =
                await prisma.sMTPConfig.findMany({
                  where: {
                    senderEmail:
                      normalizedSender,
                  },

                  select: {
                    id: true,
                    userId: true,
                    username: true,
                    senderEmail: true,
                    senderName: true,
                    isActive: true,
                    warmup: true,
                  },
                });

              console.log(
                `📊 Matching SMTPConfig records: ${smtpConfigs.length}`
              );

              if (!smtpConfigs.length) {
                console.log(
                  "⚠️ No matching SMTPConfig found"
                );

                console.log(
                  "⚠️ Reply was sent successfully"
                );

                continue;
              }

              // ==================================================
              // UPDATE EMAIL HEALTH
              // ==================================================

              for (const smtpConfig of smtpConfigs) {
                try {
                  console.log("");
                  console.log(
                    "=============================================="
                  );
                  console.log(
                    "📈 UPDATING EMAIL HEALTH"
                  );
                  console.log(
                    "=============================================="
                  );

                  console.log(
                    "🆔 SMTPConfig:",
                    smtpConfig.id
                  );

                  console.log(
                    "📧 Email:",
                    smtpConfig.senderEmail
                  );

                  console.log(
                    "👤 User ID:",
                    smtpConfig.userId
                  );

                  console.log(
                    "🔘 Active:",
                    smtpConfig.isActive
                  );

                  // ==================================================
                  // EXISTING HEALTH
                  // ==================================================

                  const existingHealth =
                    await prisma.emailHealth.findUnique({
                      where: {
                        smtpConfigId:
                          smtpConfig.id,
                      },
                    });

                  if (existingHealth) {
                    console.log(
                      "✅ Existing EmailHealth found"
                    );

                    console.log(
                      "📤 Total sent:",
                      existingHealth.totalSent
                    );

                    console.log(
                      "📩 Total replies:",
                      existingHealth.totalReplies
                    );

                    console.log(
                      "📤 Today sent:",
                      existingHealth.todaySent
                    );

                    console.log(
                      "📩 Today replies:",
                      existingHealth.todayReplies
                    );
                  } else {
                    console.log(
                      "⚠️ EmailHealth not found"
                    );

                    console.log(
                      "🆕 Creating new EmailHealth"
                    );
                  }

                  // ==================================================
                  // UPSERT HEALTH
                  // ==================================================

                  const updatedHealth =
                    await prisma.emailHealth.upsert({
                      where: {
                        smtpConfigId:
                          smtpConfig.id,
                      },

                      update: {
                        totalReplies: {
                          increment: 1,
                        },

                        todayReplies: {
                          increment: 1,
                        },

                        updatedAt:
                          new Date(),
                      },

                      create: {
                        smtpConfigId:
                          smtpConfig.id,

                        warmupDay: 1,

                        dailyLimit: 3,

                        totalSent: 0,

                        totalReplies: 1,

                        todaySent: 0,

                        todayReplies: 1,

                        health: 0,

                        startedAt:
                          new Date(),

                        lastWarmupDate:
                          new Date(),

                        completed: false,
                      },
                    });

                  console.log("");
                  console.log(
                    "✅ EMAIL HEALTH UPDATED"
                  );

                  console.log(
                    "📤 Total sent:",
                    updatedHealth.totalSent
                  );

                  console.log(
                    "📩 Total replies:",
                    updatedHealth.totalReplies
                  );

                  console.log(
                    "📤 Today sent:",
                    updatedHealth.todaySent
                  );

                  console.log(
                    "📩 Today replies:",
                    updatedHealth.todayReplies
                  );

                  // ==================================================
                  // REPLY RATE
                  // ==================================================

                  const replyRate =
                    updatedHealth.totalSent > 0
                      ? (
                          (updatedHealth.totalReplies /
                            updatedHealth.totalSent) *
                          100
                        )
                      : 0;

                  console.log(
                    `📊 Reply rate: ${replyRate.toFixed(2)}%`
                  );
                } catch (healthError) {
                  console.error("");
                  console.error(
                    "❌ EMAIL HEALTH UPDATE FAILED"
                  );

                  console.error(
                    healthError
                  );
                }
              }

              // ==================================================
              // FINAL
              // ==================================================

              console.log("");
              console.log(
                "=============================================="
              );
              console.log(
                "🎉 EMAIL PROCESS COMPLETED"
              );
              console.log(
                "=============================================="
              );

              console.log(
                "📧 Incoming:",
                sender
              );

              console.log(
                "📤 Replied from:",
                system.username
              );

              console.log(
                "🆔 Message:",
                messageId || "N/A"
              );

              console.log(
                "💾 Duplicate tracking:",
                messageId
                  ? "ACTIVE"
                  : "UNAVAILABLE"
              );

              console.log(
                "=============================================="
              );
            } catch (emailError) {
              console.error("");
              console.error(
                "=============================================="
              );
              console.error(
                "❌ EMAIL PROCESSING ERROR"
              );
              console.error(
                "=============================================="
              );

              console.error(
                emailError
              );
            }
          }
        } catch (systemError) {
          console.error("");
          console.error(
            "=============================================="
          );
          console.error(
            `❌ SYSTEM ACCOUNT ERROR: ${system.username}`
          );
          console.error(
            "=============================================="
          );

          console.error(
            systemError
          );
        }
      }
    } catch (workerError) {
      console.error("");
      console.error(
        "=============================================="
      );
      console.error(
        "❌ REPLY WORKER ERROR"
      );
      console.error(
        "=============================================="
      );

      console.error(
        workerError
      );
    }

    // ==========================================================
    // NEXT CHECK
    // ==========================================================

    const nextCheck =
      Math.floor(
        Math.random() * 6
      ) + 5;

    console.log("");
    console.log(
      "=============================================="
    );

    console.log(
      `⏰ Next inbox check after ${nextCheck} minute(s)`
    );

    console.log(
      "=============================================="
    );

    await sleep(
      nextCheck * 60 * 1000
    );
  }
}

// ============================================================
// START
// ============================================================

startReplyWorker().catch((error) => {
  console.error("");
  console.error(
    "💥 REPLY WORKER CRASHED"
  );

  console.error(error);

  process.exit(1);
});