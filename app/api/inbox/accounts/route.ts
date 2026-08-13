import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

export async function GET(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get("userId");

    if (!userId || typeof userId !== "string" || userId.trim() === "") {
      return NextResponse.json(
        { success: false, error: "userId is required" },
        { status: 400 }
      );
    }

    const configs = await prisma.sMTPConfig.findMany({
      where: { userId: userId.trim() },
      select: {
        id: true,
        provider: true,
        senderEmail: true,
        senderName: true,
        isActive: true,
      },
      orderBy: { createdAt: "desc" },
    });

    const accounts = await Promise.all(
      configs.map(async (config) => {
        const unreadCount = await prisma.inboxMessage.count({
          where: {
            smtpConfigId: config.id,
            isRead: false,
            direction: "INCOMING",
          },
        });

        return {
          id: config.id,
          provider: config.provider as "SMTP" | "GMAIL" | "OUTLOOK",
          senderEmail: config.senderEmail,
          senderName: config.senderName ?? null,
          isActive: config.isActive,
          unreadCount,
        };
      })
    );

    return NextResponse.json({ success: true, accounts });
  } catch (error) {
    console.error("[inbox/accounts]", error);
    return NextResponse.json(
      { success: false, error: "Unable to load accounts" },
      { status: 500 }
    );
  }
}
