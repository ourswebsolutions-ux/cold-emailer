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
p
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


function calculateDailyLimit(day: number) {
  return Math.min(
    100,
    3 + (day - 1) * 3
  );
}


async function updateWarmupDay(accountId: string) {

  const health = await prisma.emailHealth.findUnique({
    where: {
      smtpConfigId: accountId,
    },
  });


  if (!health) return;


  const lastDate = health.lastWarmupDate
    ? new Date(health.lastWarmupDate)
    : new Date();


  const today = new Date();


  const diffDays = Math.floor(
    (today.getTime() - lastDate.getTime()) /
    (1000 * 60 * 60 * 24)
  );


  if (diffDays >= 1) {

    const nextDay = Math.min(
      health.warmupDay + 1,
      30
    );


    await prisma.emailHealth.update({
      where:{
        smtpConfigId: accountId,
      },

      data:{
        warmupDay: nextDay,

        dailyLimit:
          calculateDailyLimit(nextDay),

        todaySent:0,

        todayReplies:0,

        completed:
          nextDay >= 30,

        lastWarmupDate:
          new Date(),
      },
    });


    console.log(
      `📈 Warmup day updated ${nextDay}/30`
    );
  }

}



export async function runWarmupCycle() {

  console.log(
    "🚀 Running warmup cycle..."
  );


  const warmupAccounts =
    await prisma.sMTPConfig.findMany({

      where:{
        warmup:true,
      },

    });



  if(!warmupAccounts.length){

    console.log(
      "❌ No warmup accounts found"
    );

    return;

  }



  const systemEmails =
    await prisma.systemConfig.findMany({

      where:{
        isActive:true,
      },

    });



  if(!systemEmails.length){

    console.log(
      "❌ No active system emails found"
    );

    return;

  }




  for(const account of warmupAccounts){


    try{


      await updateWarmupDay(
        account.id
      );



      let health =
        await prisma.emailHealth.findUnique({

          where:{
            smtpConfigId:account.id,
          },

        });



      if(!health){

        health =
          await prisma.emailHealth.create({

            data:{

              smtpConfigId:
                account.id,

              warmupDay:1,

              dailyLimit:3,

              totalSent:0,

              totalReplies:0,

              todaySent:0,

              todayReplies:0,

              health:0,

              completed:false,

              startedAt:new Date(),

              lastWarmupDate:new Date(),

            },

          });

      }




      if(
        health.todaySent >=
        health.dailyLimit
      ){

        console.log(
          `⏭️ Daily limit reached ${account.senderEmail}`
        );

        continue;

      }




      const receivers =
        systemEmails.filter(
          item =>
          item.username !==
          account.senderEmail
        );



      if(!receivers.length){

        console.log(
          "⚠️ No receiver available"
        );

        continue;

      }



      const receiver =
        receivers[
          Math.floor(
            Math.random() *
            receivers.length
          )
        ];




      const templates =
        await prisma.emailTemplate.findMany({

          where:{
            userId:
              account.userId,
          },

          select:{
            subject:true,
            body:true,
          },

        });



      const template =
        templates.length
        ?
        templates[
          Math.floor(
            Math.random() *
            templates.length
          )
        ]
        :
        defaultTemplates[
          Math.floor(
            Math.random() *
            defaultTemplates.length
          )
        ];





      await sendSMTPEmail({

        host:
          account.host,

        port:
          account.port,

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

        text:
          template.body || "",

      });





      await prisma.emailHealth.update({

        where:{
          smtpConfigId:
            account.id,
        },


        data:{

          totalSent:{
            increment:1,
          },

          todaySent:{
            increment:1,
          },

          lastWarmupDate:
            new Date(),

        },

      });




      console.log(
        `✅ Warmup sent ${account.senderEmail} → ${receiver.username}`
      );



    }catch(error){

      console.error(
        `❌ Warmup failed ${account.senderEmail}`,
        error
      );

    }

  }



  console.log(
    "✅ Warmup cycle completed"
  );

}