
import { prisma } from "@/services/database/prisma";
import { readInbox } from "@/services/smtp/imap.service";
import { sendSMTPEmail } from "@/services/smtp/smtp.service";



async function generateReply(email:any){

  return `
Hi,

Thanks for your reply.

We have received your message and will get back to you shortly.

Best regards
`;

}




function getRandomReplyDelay(){

  // Random human-like reply delay
  // 5 minutes - 45 minutes

  const min = 5;
  const max = 45;


  const minutes =
    Math.floor(
      Math.random() * (max - min + 1)
    ) + min;


  return {
    minutes,
    milliseconds: minutes * 60 * 1000
  };

}





function sleep(ms:number){

  return new Promise(
    resolve => setTimeout(resolve, ms)
  );

}





async function startReplyWorker(){


  console.log(
    "📩 Reply worker started"
  );



  while(true){


    const systems =
      await prisma.systemConfig.findMany({
        where:{
          isActive:true
        }
      });



    console.log(
      `📧 Active accounts found: ${systems.length}`
    );



    for(const system of systems){


      try{


        console.log(
          "\n🔍 Checking inbox:",
          system.username
        );



        const emails =
          await readInbox({

            host:"imap.gmail.com",

            port:993,

            username:system.username,

            password:system.password

          });



        console.log(
          `📨 New emails found: ${emails.length}`
        );



        for(const email of emails){


          try{


            const sender =
              email.from?.value?.[0]?.address;



            if(!sender){

              console.log(
                "⚠️ Sender not found"
              );

              continue;

            }



            const delay =
              getRandomReplyDelay();



            console.log(
              `⏳ Reply scheduled for ${sender} after ${delay.minutes} minutes`
            );



            await sleep(
              delay.milliseconds
            );



            console.log(
              "✍️ Generating reply..."
            );



            const reply =
              await generateReply(email);



            console.log(
              "📤 Sending reply...",
              {
                from:system.username,
                to:sender,
                subject:email.subject
              }
            );



            await sendSMTPEmail({

              host:"smtp.gmail.com",

              port:465,

              from:system.username,

              to:sender,

              subject:
                email.subject?.startsWith("Re:")
                ?
                email.subject
                :
                "Re: " + email.subject,


              text:reply,


              username:system.username,

              password:system.password

            });



            console.log(
              "✅ Reply sent successfully:",
              sender
            );


          }
          catch(err){


            console.log(
              "❌ Reply send failed",
              err
            );


          }


        }



      }
      catch(error){


        console.log(
          "❌ IMAP error",
          error
        );


      }


    }



    // random inbox checking interval

    const nextCheck =
      Math.floor(
        Math.random() * (10 - 5 + 1)
      ) + 5;



    console.log(
      `⏰ Next inbox check after ${nextCheck} minutes`
    );



    await sleep(
      nextCheck * 60 * 1000
    );


  }


}



startReplyWorker();
