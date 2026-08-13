import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

function asStringArray(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((v) => String(v).trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.map((v) => String(v).trim()).filter(Boolean);
      }
    } catch {
      // not JSON
    }
    return value
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

function joinEmails(value: unknown): string {
  return asStringArray(value).join(", ");
}

function deriveFolder(
  direction: string,
  isStarred: boolean,
  threadIsDeleted: boolean,
  threadIsArchived: boolean
): "inbox" | "starred" | "sent" | "drafts" | "trash" {
  if (threadIsDeleted) return "trash";
  if (direction === "OUTGOING") return "sent";
  if (isStarred) return "starred";
  if (threadIsArchived) return "trash";
  return "inbox";
}

export async function GET(request: NextRequest) {
  try {
    const accountId = request.nextUrl.searchParams.get("accountId");

    if (!accountId || accountId.trim() === "") {
      return NextResponse.json(
        { success: false, error: "accountId is required" },
        { status: 400 }
      );
    }

    const account = await prisma.sMTPConfig.findUnique({
      where: { id: accountId.trim() },
      select: { id: true, userId: true, isActive: true },
    });

    if (!account) {
      return NextResponse.json(
        { success: false, error: "Account not found" },
        { status: 404 }
      );
    }

    const rows = await prisma.inboxMessage.findMany({
      where: {
        smtpConfigId: account.id,
        thread: {
          isDeleted: false,
        },
      },
      include: {
        attachments: {
          select: {
            id: true,
            filename: true,
            contentType: true,
            size: true,
            storagePath: true,
          },
        },
        thread: {
          select: {
            id: true,
            isStarred: true,
            isArchived: true,
            isDeleted: true,
          },
        },
      },
      orderBy: [{ receivedAt: "desc" }, { sentAt: "desc" }, { createdAt: "desc" }],
      take: 200,
    });

    const messages = rows.map((msg) => {
      const dateSource = msg.receivedAt ?? msg.sentAt ?? msg.createdAt;
      const body = msg.htmlBody || msg.textBody || "";
      const folder = deriveFolder(
        msg.direction,
        msg.isStarred || msg.thread.isStarred,
        msg.thread.isDeleted,
        msg.thread.isArchived
      );

      return {
        id: msg.id,
        threadId: msg.threadId,
        from: msg.fromEmail,
        fromName: msg.fromName ?? null,
        to: joinEmails(msg.toEmails),
        cc: joinEmails(msg.ccEmails),
        bcc: joinEmails(msg.bccEmails),
        subject: msg.subject ?? "",
        snippet: msg.snippet ?? "",
        body,
        date: dateSource.toISOString(),
        unread: !msg.isRead,
        starred: msg.isStarred,
        hasAttachments: msg.hasAttachments,
        attachments: msg.attachments.map((att) => ({
          id: att.id,
          filename: att.filename,
          size: att.size ?? null,
          mimeType: att.contentType ?? null,
          url: att.storagePath ?? null,
        })),
        folder,
      };
    });

    return NextResponse.json({ success: true, messages });
  } catch (error) {
    console.error("[inbox/messages]", error);
    return NextResponse.json(
      { success: false, error: "Unable to load messages" },
      { status: 500 }
    );
  }
}
