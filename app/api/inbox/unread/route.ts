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

    const { accountId, messageId } = (body ?? {}) as {
      accountId?: string;
      messageId?: string;
    };

    if (!accountId || !messageId) {
      return NextResponse.json(
        { success: false, error: "accountId and messageId are required" },
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
      select: { id: true, threadId: true, isRead: true },
    });

    if (!message) {
      return NextResponse.json(
        { success: false, error: "Message not found" },
        { status: 404 }
      );
    }

    if (message.isRead) {
      await prisma.$transaction([
        prisma.inboxMessage.update({
          where: { id: message.id },
          data: { isRead: false },
        }),
        prisma.inboxThread.update({
          where: { id: message.threadId },
          data: {
            unreadCount: {
              increment: 1,
            },
          },
        }),
      ]);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[inbox/unread]", error);
    return NextResponse.json(
      { success: false, error: "Unable to mark message as unread" },
      { status: 500 }
    );
  }
}
