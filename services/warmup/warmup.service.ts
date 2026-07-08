import { prisma } from "@/services/database/prisma";
import { sendSMTPEmail } from "@/services/smtp/smtp.service";


export async function runWarmupCycle() {

  console.log("Running warmup cycle...");


  // User SMTP accounts where warmup is enabled
  const warmupAccounts =
    await prisma.sMTPConfig.findMany({
      where: {
        warmup: true,
       
      }
    });


  if (warmupAccounts.length === 0) {

    console.log(
      "No warmup SMTP accounts found"
    );

    return;
  }



  // System emails as receiver pool
  const systemEmails =
    await prisma.systemConfig.findMany({
      where: {
        isActive: true
      }
    });


    console.log("SYSTEM CONFIG DATA:");
console.log(JSON.stringify(systemEmails, null, 2));
// console.log(systemEmails,"sdf this is the system ")
  if (systemEmails.length === 0) {

    console.log(
      "No active system emails found"
    );

    return;
  }



  for (const account of warmupAccounts) {


    const receiver =
      systemEmails[
        Math.floor(
          Math.random() * systemEmails.length
        )
      ];



await sendSMTPEmail({

  host: account.host,

  port: account.port,

  username: account.username,

  password: account.password,

  from: account.senderEmail,

  fromName:
    account.senderName || "Warmup",

  to: receiver.username,

  subject:
    "Quick check",

  text:
    "Hi, hope everything is going well."
});


// Save warmup history
await prisma.warmupEmail.create({

  data: {

    senderId: account.id,

    receiverEmail: receiver.username,

    subject: "Quick check",

    status: "SENT"

  }

});

  }


  console.log(
    "Warmup cycle completed"
  );

}