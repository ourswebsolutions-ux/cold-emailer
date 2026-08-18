import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action");

    if (action === "dashboard") {
      const [totalUsers, activeUsers, expiredUsers, disabledUsers] = await Promise.all([
        prisma.user.count(),
        prisma.user.count({ where: { status: "ACTIVE", passwordExpiresAt: { gt: new Date() } } }),
        prisma.user.count({ where: { passwordExpiresAt: { lt: new Date() } } }),
        prisma.user.count({ where: { status: "DISABLED" } })
      ]);

      return NextResponse.json({
        success: true,
        stats: { totalUsers, activeUsers, expiredUsers, disabledUsers }
      });
    }

    const search = searchParams.get("search") || "";
    const statusFilter = searchParams.get("status") || "all";

    const where: any = {};

    if (search) {
      where.OR = [
        { phone: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (statusFilter !== "all") {
      if (statusFilter === "expired") where.passwordExpiresAt = { lt: new Date() };
      else if (statusFilter === "active") {
        where.status = "ACTIVE";
        where.passwordExpiresAt = { gt: new Date() };
      }
      else if (statusFilter === "disabled") where.status = "DISABLED";
    }

    const users = await prisma.user.findMany({
      where,
      select: {
        id: true,
        phone: true,
        name: true,
        status: true,
        passwordExpiresAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ success: true, users });
  } catch (error) {
    console.error("Admin GET Error:", error);
    return NextResponse.json({ success: false, message: "Failed to load data" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { action, id, days, newPassword } = await request.json();

    if (!action || !id) {
      return NextResponse.json({ success: false, message: "Missing parameters" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      return NextResponse.json({ success: false, message: "User not found" }, { status: 404 });
    }

    if (action === "renew") {
      const newExpiry = new Date();
      newExpiry.setDate(newExpiry.getDate() + Number(days));

      await prisma.user.update({
        where: { id },
        data: { passwordExpiresAt: newExpiry, status: "ACTIVE" }
      });
    } 
    else if (action === "change-password") {
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(newPassword, salt);
      await prisma.user.update({ where: { id }, data: { passwordHash } });
    } 
    else if (action === "toggle-status") {
      const newStatus = user.status === "ACTIVE" ? "DISABLED" : "ACTIVE";
      await prisma.user.update({ where: { id }, data: { status: newStatus } });
    } 
    else if (action === "delete") {
      await prisma.user.delete({ where: { id } });
    } 
    else {
      return NextResponse.json({ success: false, message: "Invalid action" }, { status: 400 });
    }

    return NextResponse.json({ success: true, message: "Operation completed" });
  } catch (error) {
    console.error("Admin POST Error:", error);
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  }
}