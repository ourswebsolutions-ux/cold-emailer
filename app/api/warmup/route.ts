import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function GET(req: NextRequest) {
  try {
    const userId = req.nextUrl.searchParams.get("userId");

    if (!userId) {
      return NextResponse.json(
        {
          success: false,
          message: "userId is required",
        },
        { status: 400 }
      );
    }

    const smtpAccounts = await prisma.sMTPConfig.findMany({
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
      const sent = account.emailHealth?.totalSent ?? 0;
      const replied = account.emailHealth?.totalReplies ?? 0;

const warmupDay = account.emailHealth?.warmupDay ?? 1;

const dayProgress = Math.min(warmupDay / 30, 1);

const warmupScore = dayProgress * 70;

const replyRate =
  sent > 0 ? replied / sent : 0;

const replyScore = replyRate * 30;

const health = Math.min(
  99,
  Math.round(warmupScore + replyScore)
);
      return {
  id: account.id,
  senderEmail: account.senderEmail,
  senderName: account.senderName,
  warmup: account.warmup,

  warmupDay,
  dailyLimit: account.emailHealth?.dailyLimit ?? 3,

  totalSent: sent,
  totalReplies: replied,

  todaySent: account.emailHealth?.todaySent ?? 0,
  todayReplies: account.emailHealth?.todayReplies ?? 0,

  completed: account.emailHealth?.completed ?? false,

  health,
};
    });

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        success: false,
        message: "Internal Server Error",
      },
      {
        status: 500,
      }
    );
  }
}