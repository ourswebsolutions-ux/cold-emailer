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
`
  },
  {
    subject: "Checking In",
    body: `
Hello,

Hope you're doing well.

This is a quick check-in message sent as part of our regular communication process.

Wishing you a productive day ahead.

Kind regards
`
  },
  {
    subject: "Routine Email",
    body: `
Hi,

Just sending a quick message to stay in touch and ensure smooth email communication.

Thank you and have a wonderful day.

Regards
`
  }
];

export async function runWarmupCycle() {
  console.log("Running warmup cycle...");

  const warmupAccounts = await prisma.sMTPConfig.findMany({
    where: {
      warmup: true,
      isActive: true,
    },
  });

  if (!warmupAccounts.length) {
    console.log("No warmup accounts found");
    return;
  }

  const systemEmails = await prisma.systemConfig.findMany({
    where: {
      isActive: true,
    },
  });

  if (!systemEmails.length) {
    console.log("No active system emails found");
    return;
  }

  for (const account of warmupAccounts) {
    const receiver =
      systemEmails[Math.floor(Math.random() * systemEmails.length)];

    // User Templates
    const userTemplates = await prisma.emailTemplate.findMany({
      where: {
        userId: account.userId,
      },
      select: {
        subject: true,
        body: true,
      },
    });

    let template;

    if (userTemplates.length) {
      template =
        userTemplates[
          Math.floor(Math.random() * userTemplates.length)
        ];
    } else {
      template =
        defaultTemplates[
          Math.floor(Math.random() * defaultTemplates.length)
        ];
    }

    await sendSMTPEmail({
      host: account.host,
      port: account.port,
      username: account.username,
      password: account.password,
      from: account.senderEmail,
      fromName: account.senderName || "Warmup",
      to: receiver.username,
      subject: template.subject,
      text: template.body || "",
    });

    await prisma.warmupEmail.create({
      data: {
        senderId: account.id,
        receiverEmail: receiver.username,
        subject: template.subject,
        status: "SENT",
      },
    });
  }

  console.log("Warmup cycle completed");
}