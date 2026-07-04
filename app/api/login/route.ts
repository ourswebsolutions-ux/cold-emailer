// app/api/login/route.ts
import { NextRequest, NextResponse } from "next/server";
import { PrismaClient, UserStatus } from "@prisma/client";
import bcrypt from "bcryptjs";   // ← Add this

const prisma = new PrismaClient();

export async function POST(request: NextRequest) {
  try {
    const { phone, password } = await request.json();

    if (!phone) {
      return NextResponse.json(
        { success: false, message: "Phone number is required" },
        { status: 400 }
      );
    }

    if (password) {
      // Hash the password
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(password, salt);

      const sessionExpiresAt = new Date();
      sessionExpiresAt.setDate(sessionExpiresAt.getDate() + 7);

      const passwordExpiresAt = new Date();
      passwordExpiresAt.setDate(passwordExpiresAt.getDate() + 30);

      const user = await prisma.user.upsert({
        where: { phone },
        update: {
          passwordHash,           // ← Fixed
          status: UserStatus.ACTIVE,
          sessionExpiresAt,
          passwordExpiresAt,
        },
        create: {
          phone,
          passwordHash,           // ← Fixed
          status: UserStatus.ACTIVE,
          sessionExpiresAt,
          passwordExpiresAt,
        },
      });

      return NextResponse.json({
        success: true,
        message: "Success",
        user: {
          id: user.id,
          phone: user.phone,
          status: user.status,
        },
      });
    }

    // Session validation (phone only)
    const user = await prisma.user.findUnique({
      where: { phone },
      select: { 
        id: true, 
        phone: true, 
        status: true, 
        sessionExpiresAt: true,
        passwordHash: true   // needed for future login check
      },
    });

    if (!user || user.status !== UserStatus.ACTIVE) {
      return NextResponse.json(
        { success: false, message: "Invalid session" },
        { status: 401 }
      );
    }

    if (user.sessionExpiresAt && new Date(user.sessionExpiresAt) < new Date()) {
      return NextResponse.json(
        { success: false, message: "Session expired" },
        { status: 401 }
      );
    }

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        phone: user.phone,
        status: user.status,
      },
    });
  } catch (error: any) {
    console.error("Login API Error:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}