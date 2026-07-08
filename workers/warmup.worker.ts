
import dotenv from "dotenv";
import { runWarmupCycle } from "@/services/warmup/warmup.service";


dotenv.config();



function getRandomCheckInterval(){

  // Random wait between 10 - 20 minutes

  const min = 10;
  const max = 20;


  const minutes =
    Math.floor(
      Math.random() * (max - min + 1)
    ) + min;


  return {
    minutes,
    milliseconds: minutes * 60 * 1000
  };

}




function getTime(){

  return new Date()
    .toLocaleString();

}




async function startWorker(){


  console.log(
    "🔥 Warmup worker started",
    getTime()
  );



  while(true){


    try{


      console.log(
        "\n=============================="
      );


      console.log(
        "🚀 Warmup cycle starting:",
        getTime()
      );



      const result =
        await runWarmupCycle();



      console.log(
        "✅ Warmup cycle completed:",
        getTime()
      );



      if(result){

        console.log(
          "📊 Warmup result:",
          result
        );

      }



    }
    catch(error){


      console.error(
        "❌ Warmup worker error:",
        error
      );


    }



    const nextRun =
      getRandomCheckInterval();



    console.log(
      `⏳ Next warmup check after ${nextRun.minutes} minutes`
    );


    console.log(
      "🕒 Next run:",
      new Date(
        Date.now() + nextRun.milliseconds
      ).toLocaleString()
    );



    console.log(
      "==============================\n"
    );



    await new Promise(
      resolve =>
        setTimeout(
          resolve,
          nextRun.milliseconds
        )
    );


  }


}



startWorker();

