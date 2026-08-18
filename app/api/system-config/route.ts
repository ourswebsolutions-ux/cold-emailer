// app/api/config/route.ts
import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Helper to get logged-in userId from session/cookies (common pattern)
async function getCurrentUserId(req: NextRequest): Promise<string | null> {
  // Option 1: From Authorization header (JWT/Token)
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    // Add your token verification logic here if using JWT
    // For now, we'll also check cookies
  }

  // Option 2: From cookie (most common in Next.js apps)
  const userIdCookie = req.cookies.get("userId")?.value;
  if (userIdCookie) return userIdCookie;

  // Fallback: query param (for backward compatibility during transition)
  const urlUserId = req.nextUrl.searchParams.get("userId");
  if (urlUserId) return urlUserId;

  return null;
}

//
// GET - Get all SMTP accounts for logged-in user
//
export async function GET(req: NextRequest) {
  try {
    const userId = await getCurrentUserId(req);
    if (!userId) {
      return NextResponse.json(
        { success: false, message: "User not authenticated" },
        { status: 401 }
      );
    }

    const configs = await prisma.systemConfig.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      success: true,
      data: configs,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch SMTP accounts" },
      { status: 500 }
    );
  }
}

//
// POST - Create new SMTP account for logged-in user
//
export async function POST(req: NextRequest) {
  try {
    const userId = await getCurrentUserId(req);
    if (!userId) {
      return NextResponse.json(
        { success: false, message: "User not authenticated" },
        { status: 401 }
      );
    }

    // Verify user actually exists
    const userExists = await prisma.user.findUnique({ where: { id: userId } });
    if (!userExists) {
      return NextResponse.json(
        { success: false, message: "User account not found. Please login again." },
        { status: 404 }
      );
    }

    const body = await req.json();
    const { host, port, username, password, senderEmail, senderName } = body;

    if (!host || !port || !username || !password || !senderEmail) {
      return NextResponse.json(
        { success: false, message: "Missing required fields" },
        { status: 400 }
      );
    }

    const config = await prisma.systemConfig.create({
      data: {
        userId,
        host,
        port: Number(port),
        username,
        password,
        senderEmail,
        senderName,
        isActive: false,
      },
    });

    return NextResponse.json({
      success: true,
      message: "SMTP Account Created Successfully",
      data: config,
    });
  } catch (error: any) {
    console.error(error);
    if (error.code === "P2003") {
      return NextResponse.json(
        { success: false, message: "Invalid user. Please login again." },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, message: "Failed to create SMTP account" },
      { status: 500 }
    );
  }
}

// PUT, DELETE, and ACTIVATE remain the same (they use id, not userId directly)
export async function PUT(req: NextRequest) {
  // ... keep your existing PUT code unchanged
  try {
    const body = await req.json();
    const { id, host, port, username, password, senderEmail, senderName } = body;

    if (!id) {
      return NextResponse.json({ success: false, message: "SMTP id is required" }, { status: 400 });
    }

    const config = await prisma.sMTPConfig.update({
      where: { id },
      data: { host, port: Number(port), username, password, senderEmail, senderName },
    });

    return NextResponse.json({ success: true, message: "SMTP Account Updated", data: config });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ success: false, message: "Failed to update" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  // ... keep your existing DELETE code unchanged
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) return NextResponse.json({ success: false, message: "id required" }, { status: 400 });

    const accountToDelete = await prisma.systemConfig.findUnique({ where: { id } });
    if (!accountToDelete) return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });

    await prisma.systemConfig.delete({ where: { id } });

    if (accountToDelete.isActive) {
      const remaining = await prisma.sMTPConfig.findMany({
        where: { userId: accountToDelete.userId },
        orderBy: { createdAt: "asc" },
      });
      if (remaining.length > 0) {
        await prisma.sMTPConfig.update({
          where: { id: remaining[0].id },
          data: { isActive: true },
        });
      }
    }

    return NextResponse.json({ success: true, message: "SMTP Account Deleted" });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ success: false, message: "Delete failed" }, { status: 500 });
  }
}