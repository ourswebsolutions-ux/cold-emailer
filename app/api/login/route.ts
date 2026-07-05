// app/api/login/route.ts
import { NextRequest, NextResponse } from "next/server";
import { PrismaClient, UserStatus, UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

export async function POST(request: NextRequest) {
  try {
    const { phone, password } = await request.json();

    if (!phone) {
      return NextResponse.json({ success: false, message: "Phone number is required" }, { status: 400 });
    }

    // If password is provided → Create or Login
    if (password) {
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(password, salt);

      const passwordExpiresAt = new Date();
      passwordExpiresAt.setDate(passwordExpiresAt.getDate() + 30);

      const sessionExpiresAt = new Date();
      sessionExpiresAt.setHours(sessionExpiresAt.getHours() + 12);

      const user = await prisma.user.upsert({
        where: { phone },
        update: {
          passwordHash,
          status: UserStatus.ACTIVE,
          
          passwordExpiresAt,
          sessionExpiresAt,
        },
        create: {
          phone,
          passwordHash,
          name: "Lead Master",
          
          status: UserStatus.ACTIVE,
          passwordExpiresAt,
          sessionExpiresAt,
        },
      });

      const response = NextResponse.json({
        success: true,
        message: "Login successful",
        user: { 
          id: user.id, 
          phone: user.phone, 
          role: user.role 
        }
      });

      // ✅ SET COOKIE FOR FRONTEND
      response.cookies.set({
        name: "userId",
        value: user.id,
        httpOnly: false,           // Important: Allow JS to read it
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 12 * 60 * 60,      // 12 hours
        path: "/",
      });

      return response;
    }

    // Session check (existing logic)
    const user = await prisma.user.findUnique({
      where: { phone },
      select: { 
        id: true, 
        phone: true, 
        status: true, 
        passwordExpiresAt: true, 
        sessionExpiresAt: true, 
        role: true 
      }
    });

    if (!user || user.status !== UserStatus.ACTIVE) {
      return NextResponse.json({ success: false, message: "Invalid credentials" }, { status: 401 });
    }

    if (new Date(user.passwordExpiresAt) < new Date()) {
      return NextResponse.json({ 
        success: false, 
        message: "Your subscription has expired. Please contact us on WhatsApp." 
      }, { status: 403 });
    }

    const response = NextResponse.json({ success: true, user });

    // Also set cookie on session check
    response.cookies.set({
      name: "userId",
      value: user.id,
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 12 * 60 * 60,
      path: "/",
    });

    return response;

  } catch (error) {
    console.error(error);
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}