import { prisma } from "@/services/database/prisma";
import { readInbox } from "@/services/smtp/imap.service";
import { sendSMTPEmail } from "@/services/smtp/smtp.service";
import { generateAIReply } from "@/lib/groq/reply";

// ============================================================
// IN-MEMORY PROCESSED MESSAGE TRACKING
// ============================================================

const processedMessages = new Set<string>();

// ============================================================
// HELPERS
// ============================================================

function normalizeEmail(value?: string) {
  return String(value || "").toLowerCase().trim();
}

function getMessageId(email: any) {
  return String(
    email.messageId ||
      email.headers?.["message-id"] ||
      email.headers?.["Message-ID"] ||
      ""
  ).trim();
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================
// CHECK IF EMAIL IS AUTOMATED
// ============================================================

function shouldSkipEmail(email: any) {
  const sender = normalizeEmail(
    email.from?.value?.[0]?.address ||
      email.from?.address ||
      email.from
  );

  if (!sender) {
    console.log("❌ Sender email missing");
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

  const blockedDomains = [
    "facebook.com",
    "facebookmail.com",
    "linkedin.com",
    "linkedinmail.com",
    "instagram.com",
    "twitter.com",
    "x.com",
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

  if (
    blockedKeywords.some((keyword) =>
      sender.includes(keyword)
    )
  ) {
    console.log(
      `⏭️ Automated sender skipped: ${sender}`
    );

    return true;
  }

  const domain = sender.split("@")[1];

  if (domain && blockedDomains.includes(domain)) {
    console.log(
      `⏭️ Blocked domain skipped: ${domain}`
    );

    return true;
  }

  return false;
}

// ============================================================
// CHECK IF EMAIL SHOULD BE REPLIED TO
// ============================================================

function shouldReplyToEmail(email: any) {
  const messageId = getMessageId(email);

  const sender = normalizeEmail(
    email.from?.value?.[0]?.address ||
      email.from?.address ||
      email.from
  );

  const subject = String(
    email.subject || ""
  ).trim();

  console.log("");
  console.log("🔎 CHECKING INCOMING EMAIL");
  console.log("📧 Sender:", sender);
  console.log("📋 Subject:", subject);
  console.log("🆔 Message ID:", messageId || "N/A");

  if (!sender) {
    console.log("❌ No sender");
    return false;
  }

  if (
    messageId &&
    processedMessages.has(messageId)
  ) {
    console.log(
      "⏭️ Already processed"
    );

    return false;
  }

  if (shouldSkipEmail(email)) {
    return false;
  }

  if (!subject) {
    console.log(
      "⏭️ Subject missing"
    );

    return false;
  }

  console.log(
    "✅ EMAIL IS ELIGIBLE FOR REPLY"
  );

  return true;
}

// ============================================================
// GENERATE AI REPLY
// ============================================================

async function generateReply(email: any) {
  const sender = normalizeEmail(
    email.from?.value?.[0]?.address ||
      email.from?.address ||
      email.from
  );

  const senderName =
    email.from?.value?.[0]?.name ||
    email.from?.name ||
    "";

  const subject = String(
    email.subject || ""
  ).trim();

  const body =
    email.text ||
    email.textBody ||
    email.body ||
    email.html ||
    email.htmlBody ||
    email.message ||
    "";

  return generateAIReply({
    senderEmail: sender,
    senderName: senderName || undefined,
    subject,
    body: String(body).trim(),
    date: email.date,
    messageId: getMessageId(email) || undefined,
  });
}

// ============================================================
// MARK PROCESSED
// ============================================================

function markProcessed(email: any) {
  const messageId = getMessageId(email);

  if (messageId) {
    processedMessages.add(messageId);
  }
}

// ============================================================
// START REPLY WORKER
// ============================================================

async function startReplyWorker() {
  console.log("");
  console.log("==============================================");
  console.log("🚀 REPLY WORKER STARTED");
  console.log("==============================================");

  while (true) {
    try {
      // ========================================================
      // GET ACTIVE SMTP CONFIG ACCOUNTS
      // ========================================================

      const smtpConfigs =
        await prisma.systemConfig.findMany({
          where: {
            isActive: true,
          },

          orderBy: {
            createdAt: "desc",
          },
        });

      console.log("");
      console.log(
        `📊 Active SMTP accounts: ${smtpConfigs.length}`
      );

      if (!smtpConfigs.length) {
        console.log(
          "⚠️ No active SMTPConfig accounts"
        );

        await sleep(5 * 60 * 1000);
        continue;
      }

      // ========================================================
      // CHECK EACH SMTP CONFIG ACCOUNT
      // ========================================================

      for (const smtpConfig of smtpConfigs) {
        try {
          const inboxEmail = normalizeEmail(
            smtpConfig.senderEmail ||
              smtpConfig.username
          );

          console.log("");
          console.log("==============================================");
          console.log("📮 CHECKING SMTP ACCOUNT");
          console.log("==============================================");
          console.log(
            "📧 Account:",
            inboxEmail
          );

          // ======================================================
          // READ ONLY THIS SMTP ACCOUNT'S UNREAD INBOX
          // ======================================================

          const emails = await readInbox({
            host:
              smtpConfig.host ||
              "imap.gmail.com",

            port:
              smtpConfig.imapPort ||
              993,

            username:
              smtpConfig.username,

            password:
              smtpConfig.password,
          });

          console.log(
            `📨 Unread emails found: ${emails.length}`
          );

          if (!emails.length) {
            console.log(
              "📭 No unread emails"
            );

            continue;
          }

          // ======================================================
          // PROCESS UNREAD EMAILS
          // ======================================================

          for (const email of emails) {
            try {
              const sender = normalizeEmail(
                email.from?.value?.[0]?.address ||
                  email.from?.address ||
                  email.from
              );

              const messageId =
                getMessageId(email);

              const subject = String(
                email.subject || ""
              ).trim();

              console.log("");
              console.log("----------------------------------------------");
              console.log("📩 INCOMING UNREAD EMAIL");
              console.log("----------------------------------------------");

              console.log(
                "📥 Receiving account:",
                inboxEmail
              );

              console.log(
                "📧 Sender:",
                sender
              );

              console.log(
                "📋 Subject:",
                subject
              );

              console.log(
                "🆔 Message ID:",
                messageId || "N/A"
              );

              // ==================================================
              // IMPORTANT:
              // VERIFY EMAIL BELONGS TO CURRENT SMTP ACCOUNT
              // ==================================================

              const recipients = [
                ...(email.to?.value || []),
                ...(email.cc?.value || []),
              ]
                .map((item: any) =>
                  normalizeEmail(item.address)
                )
                .filter(Boolean);

              const belongsToThisAccount =
                recipients.length === 0 ||
                recipients.includes(inboxEmail);

              if (!belongsToThisAccount) {
                console.log(
                  "⏭️ Email does not belong to this SMTP account"
                );

                continue;
              }

              // ==================================================
              // CHECK IF THIS EMAIL SHOULD GET A REPLY
              // ==================================================

              if (!shouldReplyToEmail(email)) {
                console.log(
                  "⏭️ Not eligible for reply"
                );

                continue;
              }

              console.log("");
              console.log(
                "🎯 THIS EMAIL WILL BE REPLIED TO"
              );

              console.log(
                "📧 Reply recipient:",
                sender
              );

              console.log(
                "📥 SMTP account:",
                inboxEmail
              );

              // ==================================================
              // GENERATE AI REPLY
              // ==================================================

              const reply =
                await generateReply(email);

              if (!reply) {
                console.log(
                  "⚠️ AI returned empty reply"
                );

                continue;
              }

              // ==================================================
              // REPLY SUBJECT
              // ==================================================

              const replySubject =
                subject
                  .toLowerCase()
                  .startsWith("re:")
                  ? subject
                  : `Re: ${subject}`;

              // ==================================================
              // SEND REPLY
              // ==================================================

              console.log("");
              console.log(
                "📤 SENDING REPLY"
              );

              await sendSMTPEmail({
                host:
                  smtpConfig.host ||
                  "smtp.gmail.com",

                port:
                  smtpConfig.port ||
                  465,

                username:
                  smtpConfig.username,

                password:
                  smtpConfig.password,

                from:
                  smtpConfig.senderEmail ||
                  smtpConfig.username,

                fromName:
                  smtpConfig.senderName ||
                  undefined,

                to: sender,

                subject: replySubject,

                html: reply,
              });

              console.log(
                "✅ REPLY SENT"
              );

              // ==================================================
              // MARK ONLY AFTER SUCCESSFUL REPLY
              // ==================================================

              markProcessed(email);

              console.log(
                "💾 Message marked as processed"
              );

            } catch (emailError) {
              console.error(
                "❌ Email processing failed:",
                emailError
              );
            }
          }

        } catch (smtpError) {
          console.error(
            `❌ SMTP account failed: ${smtpConfig.senderEmail}`,
            smtpError
          );
        }
      }

    } catch (workerError) {
      console.error(
        "❌ Reply worker error:",
        workerError
      );
    }

    // ========================================================
    // NEXT CHECK
    // ========================================================

    const nextCheck =
      Math.floor(Math.random() * 6) + 5;

    console.log("");
    console.log(
      `⏰ Next inbox check in ${nextCheck} minute(s)`
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
  console.error(
    "💥 REPLY WORKER CRASHED",
    error
  );

  process.exit(1);
});