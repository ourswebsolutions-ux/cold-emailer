import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();


export async function POST(request: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    const { accountId, messageId, starred } = (body ?? {}) as {
      accountId?: string;
      messageId?: string;
      starred?: boolean;
    };

    if (!accountId || !messageId || typeof starred !== "boolean") {
      return NextResponse.json(
        {
          success: false,
          error: "accountId, messageId and starred (boolean) are required",
        },
        { status: 400 }
      );
    }

    const account = await prisma.sMTPConfig.findUnique({
      where: { id: accountId },
      select: { id: true },
    });

    if (!account) {
      return NextResponse.json(
        { success: false, error: "Account not found" },
        { status: 404 }
      );
    }

    const message = await prisma.inboxMessage.findFirst({
      where: {
        id: messageId,
        smtpConfigId: account.id,
      },
      select: { id: true, threadId: true },
    });

    if (!message) {
      return NextResponse.json(
        { success: false, error: "Message not found" },
        { status: 404 }
      );
    }

    await prisma.$transaction([
      prisma.inboxMessage.update({
        where: { id: message.id },
        data: { isStarred: starred },
      }),
      prisma.inboxThread.update({
        where: { id: message.threadId },
        data: { isStarred: starred },
      }),
    ]);

    return NextResponse.json({ success: true, starred });
  } catch (error) {
    console.error("[inbox/star]", error);
    return NextResponse.json(
      { success: false, error: "Unable to update star state" },
      { status: 500 }
    );
  }
}
