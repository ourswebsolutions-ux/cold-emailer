import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, userId, isActive } = body;   // isActive is now passed from frontend

    if (!id || !userId) {
      return NextResponse.json(
        { success: false, message: "id and userId are required" },
        { status: 400 }
      );
    }

    // Allow multiple active accounts (no more forcing others to false)
    const updated = await prisma.systemConfig.update({
      where: { id },
      data: {
        isActive: isActive ?? true,   // toggle value from frontend
      },
    });

    return NextResponse.json({
      success: true,
      message: `SMTP account ${updated.isActive ? "activated" : "deactivated"}`,
      data: updated,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { success: false, message: "Failed to update SMTP account" },
      { status: 500 }
    );
  }
}