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
      select: { id: true, userId: true },
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

    if (!message.isRead) {
      await prisma.$transaction([
        prisma.inboxMessage.update({
          where: { id: message.id },
          data: { isRead: true },
        }),
        prisma.inboxThread.update({
          where: { id: message.threadId },
          data: {
            unreadCount: {
              decrement: 1,
            },
          },
        }),
      ]);

      // Clamp unreadCount so it never goes below 0
      await prisma.inboxThread.updateMany({
        where: { id: message.threadId, unreadCount: { lt: 0 } },
        data: { unreadCount: 0 },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[inbox/read]", error);
    return NextResponse.json(
      { success: false, error: "Unable to mark message as read" },
      { status: 500 }
    );
  }
}
