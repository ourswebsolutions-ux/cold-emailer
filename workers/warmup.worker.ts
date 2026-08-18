import dotenv from "dotenv";
import { runWarmupCycle } from "@/services/warmup/warmup.service";

dotenv.config();

function getTime() {
  return new Date().toLocaleString();
}

async function startWorker() {
  console.log(
    "🔥 Warmup worker started",
    getTime()
  );

  /*
   * Check every 30 seconds.
   *
   * Each account has its own nextWarmupAt,
   * so this worker does NOT control the
   * actual sending interval.
   */
  while (true) {
    try {
      console.log(
        `\n🔎 Warmup check: ${getTime()}`
      );

      await runWarmupCycle();

      /*
       * Check again after 30 seconds.
       */
      await new Promise((resolve) =>
        setTimeout(
          resolve,
          30 * 1000
        )
      );
    } catch (error) {
      console.error(
        "❌ Warmup worker error:",
        error
      );

      /*
       * Retry after 1 minute
       */
      await new Promise((resolve) =>
        setTimeout(
          resolve,
          60 * 1000
        )
      );
    }
  }
}

startWorker();