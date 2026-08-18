
import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function calculateHealth(
  warmupDay: number,
  totalSent: number,
  totalReplies: number
) {
  // Keep warmup day between 1 and 30
  const safeDay = Math.max(
    1,
    Math.min(warmupDay, 30)
  );

  // ------------------------------------------------------------
  // WARMUP SCORE
  // This is the MAIN health factor.
  //
  // Day 1  = 2
  // Day 30 = 94
  // ------------------------------------------------------------

  const warmupScore =
    2 +
    ((safeDay - 1) / 29) * 92;

  // ------------------------------------------------------------
  // REPLY SCORE
  // Replies are only a SMALL bonus.
  //
  // Maximum reply bonus = 5 points
  //
  // Example:
  // 0% reply rate   = 0 bonus
  // 50% reply rate  = 2.5 bonus
  // 100% reply rate = 5 bonus
  // ------------------------------------------------------------

  const replyRate =
    totalSent > 0
      ? Math.min(
          totalReplies / totalSent,
          1
        )
      : 0;

  const replyBonus =
    replyRate * 5;

  // ------------------------------------------------------------
  // FINAL HEALTH
  // ------------------------------------------------------------

  const health =
    warmupScore + replyBonus;

  return Math.min(
    99,
    Math.max(
      1,
      Math.round(health)
    )
  );
}

function calculateDailyLimit(day: number) {
  const safeDay = Math.max(
    1,
    Math.min(day, 30)
  );

  if (safeDay === 1) {
    return 3;
  }

  return Math.min(
    100,
    Math.round(
      3 + ((safeDay - 1) * 97) / 29
    )
  );
}

export async function GET(req: NextRequest) {
  try {
    const userId =
      req.nextUrl.searchParams.get("userId");

    if (!userId) {
      return NextResponse.json(
        {
          success: false,
          message: "userId is required",
        },
        { status: 400 }
      );
    }

    const smtpAccounts =
      await prisma.sMTPConfig.findMany({
        where: {
          userId,
        },
        include: {
          emailHealth: true,
        },
        orderBy: {
          createdAt: "desc",
        },
      });

    const data = smtpAccounts.map((account) => {
      const healthRecord =
        account.emailHealth;

      const warmupDay =
        healthRecord?.warmupDay ?? 1;

      const totalSent =
        healthRecord?.totalSent ?? 0;

      const totalReplies =
        healthRecord?.totalReplies ?? 0;

      const todaySent =
        healthRecord?.todaySent ?? 0;

      const todayReplies =
        healthRecord?.todayReplies ?? 0;

      const dailyLimit =
        healthRecord?.dailyLimit ??
        calculateDailyLimit(warmupDay);

      const health = calculateHealth(
        warmupDay,
        totalSent,
        totalReplies
      );

      const replyRate =
        totalSent > 0
          ? Math.min(
              100,
              Math.round(
                (totalReplies / totalSent) * 100
              )
            )
          : 0;

      const warmupProgress = Math.min(
        100,
        Math.round(
          (warmupDay / 30) * 100
        )
      );

      return {
        id: account.id,
        senderEmail: account.senderEmail,
        senderName: account.senderName,

        isActive: account.isActive,
        warmup: account.warmup,

        warmupDay,
        warmupTotalDays: 30,
        warmupProgress,

        dailyLimit,

        totalSent,
        totalReplies,
        replyRate,

        todaySent,
        todayReplies,

        health,

        completed:
          healthRecord?.completed ??
          warmupDay >= 30,

        startedAt:
          healthRecord?.startedAt ?? null,

        lastWarmupDate:
          healthRecord?.lastWarmupDate ?? null,

        createdAt: account.createdAt,
        updatedAt: account.updatedAt,
      };
    });

    return NextResponse.json({
      success: true,
      count: data.length,
      data,
    });
  } catch (error) {
    console.error(
      "SMTP Health API Error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        message: "Internal Server Error",
      },
      { status: 500 }
    );
  }
}
