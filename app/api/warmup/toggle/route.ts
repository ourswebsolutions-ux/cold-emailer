// app/api/smtp-config/activate/route.ts
import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, userId, warmup } = body;

    if (!id || !userId) {
      return NextResponse.json(
        { success: false, message: "id and userId are required" },
        { status: 400 }
      );
    }

    const updated = await prisma.sMTPConfig.update({
      where: {
        id,
      },
      data: {
        warmup,
      },
    });

    return NextResponse.json({
      success: true,
      message: "SMTP warmup updated",
      data: updated,
    });

  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        success: false,
        message: "Failed to update SMTP warmup",
      },
      {
        status: 500,
      }
    );
  }
}