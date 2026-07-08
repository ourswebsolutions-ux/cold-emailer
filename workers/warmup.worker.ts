import dotenv from "dotenv";
import { runWarmupCycle } from "@/services/warmup/warmup.service";


dotenv.config();


async function startWorker() {


  console.log(
    "Warmup worker started"
  );


  while (true) {


    try {

      await runWarmupCycle();

    }
    catch(error) {

      console.error(
        "Warmup worker error:",
        error
      );

    }



    // wait 10 minutes

    await new Promise(
      resolve =>
        setTimeout(
          resolve,
          10 * 60 * 1000
        )
    );


  }

}


startWorker();