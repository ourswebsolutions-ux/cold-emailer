// app/api/smtp-config/activate/route.ts
import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, userId } = body;

    if (!id || !userId) {
      return NextResponse.json(
        { success: false, message: "id and userId are required" },
        { status: 400 }
      );
    }

    // Deactivate all accounts for this user
    await prisma.sMTPConfig.updateMany({
      where: {
        userId,
      },
      data: {
        isActive: false,
      },
    });

    // Activate the selected one
    const activated = await prisma.sMTPConfig.update({
      where: {
        id,
      },
      data: {
        isActive: true,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Active SMTP account updated",
      data: activated,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to activate SMTP account",
      },
      {
        status: 500,
      }
    );
  }
}