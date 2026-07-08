import { prisma } from "@/services/database/prisma";
import { readInbox } from "@/services/smtp/imap.service";


async function startReplyWorker(){

  console.log("Reply worker started");


  while(true){


    const systems =
      await prisma.systemConfig.findMany({
        where:{
          isActive:true
        }
      });



    for(const system of systems){


      try{


        const emails =
          await readInbox({

            host:"imap.gmail.com",

            port:993,

            username:system.username,

            password:system.password

          });



        console.log(
          "New emails:",
          emails.length
        );


      }
      catch(error){

        console.log(
          "IMAP error",
          error
        );

      }


    }



    await new Promise(
      r=>setTimeout(
        r,
        5 * 60 * 1000
      )
    );


  }


}


startReplyWorker();
