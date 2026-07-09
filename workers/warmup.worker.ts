import dotenv from "dotenv";
import { runWarmupCycle } from "@/services/warmup/warmup.service";

dotenv.config();

// Worker start time
const workerStartedAt = Date.now();

function getWarmupSchedule() {
  const now = Date.now();

  // Warmup Day (1,2,3...)
  const day =
    Math.floor(
      (now - workerStartedAt) /
      (24 * 60 * 60 * 1000)
    ) + 1;

  // Daily target
  let dailyEmails = 3;

  if (day <= 5) {
    // 3 → 11
    dailyEmails = 3 + (day - 1) * 2;
  } else if (day <= 15) {
    // 13 → 40
    dailyEmails = 13 + (day - 6) * 3;
  } else {
    // Max 80/day
    dailyEmails = Math.min(
      80,
      43 + (day - 16) * 4
    );
  }

  // Average gap between emails
  const averageMinutes =
    (24 * 60) / dailyEmails;

  // ±35% randomness
  const variation =
    averageMinutes * 0.35;

  const minutes = Math.max(
    5,
    Math.round(
      averageMinutes +
        (Math.random() * variation * 2 - variation)
    )
  );

  return {
    day,
    dailyEmails,
    minutes,
    milliseconds:
      minutes * 60 * 1000,
  };
}

function getTime() {
  return new Date().toLocaleString();
}

async function startWorker() {
  console.log(
    "🔥 Warmup worker started",
    getTime()
  );

  while (true) {
    try {
      console.log("\n==============================");

      const schedule =
        getWarmupSchedule();

      console.log(
        `📅 Warmup Day: ${schedule.day}`
      );

      console.log(
        `📧 Target Emails Today: ${schedule.dailyEmails}`
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

      if (result) {
        console.log(result);
      }

      console.log(
        `⏳ Next warmup after ${schedule.minutes} minutes`
      );

      console.log(
        "🕒 Next run:",
        new Date(
          Date.now() +
            schedule.milliseconds
        ).toLocaleString()
      );

      console.log(
        "==============================\n"
      );

      await new Promise((resolve) =>
        setTimeout(
          resolve,
          schedule.milliseconds
        )
      );
    } catch (error) {
      console.error(
        "❌ Warmup worker error:",
        error
      );

      // Error aaye to 5 minute baad retry
      await new Promise((resolve) =>
        setTimeout(resolve, 5 * 60 * 1000)
      );
    }
  }
}

startWorker();