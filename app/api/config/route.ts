// app/api/smtp-config/route.ts

import { NextRequest, NextResponse } from "next/server";
import { PrismaClient, UserStatus } from "@prisma/client";
const prisma = new PrismaClient();

//
// GET
// Get SMTP Config by userId
//
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json(
        { success: false, message: "userId is required" },
        { status: 400 }
      );
    }

    const config = await prisma.sMTPConfig.findUnique({
      where: {
        userId,
      },
    });

    return NextResponse.json({
      success: true,
      data: config,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        success: false,
        message: "Failed to fetch SMTP config",
      },
      {
        status: 500,
      }
    );
  }
}

//
// POST
// Create SMTP Config
//
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      userId,
      host,
      port,
      username,
      password,
      senderEmail,
      senderName,
    } = body;

    if (
      !userId ||
      !host ||
      !port ||
      !username ||
      !password ||
      !senderEmail
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "Missing required fields",
        },
        {
          status: 400,
        }
      );
    }

    const exists = await prisma.sMTPConfig.findUnique({
      where: {
        userId,
      },
    });

    console.log(exists)
    if (exists) {
      return NextResponse.json(
        {
          success: false,
          message: "SMTP Config already exists",
        },
        {
          status: 409,
        }
      );
    }

    const config = await prisma.sMTPConfig.create({
      data: {
        userId,
        host,
        port: Number(port),
        username,
        password,
        senderEmail,
        senderName,
      },
    });

    return NextResponse.json({
      success: true,
      message: "SMTP Config Created",
      data: config,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        success: false,
        message: "Failed to create SMTP config",
      },
      {
        status: 500,
      }
    );
  }
}

//
// PUT
// Update SMTP Config
//
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      userId,
      host,
      port,
      username,
      password,
      senderEmail,
      senderName,
    } = body;

    if (!userId) {
      return NextResponse.json(
        {
          success: false,
          message: "userId is required",
        },
        {
          status: 400,
        }
      );
    }

    const config = await prisma.sMTPConfig.update({
      where: {
        userId,
      },
      data: {
        host,
        port: Number(port),
        username,
        password,
        senderEmail,
        senderName,
      },
    });

    return NextResponse.json({
      success: true,
      message: "SMTP Config Updated",
      data: config,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        success: false,
        message: "Failed to update SMTP config",
      },
      {
        status: 500,
      }
    );
  }
}

//
// DELETE
// Delete SMTP Config
//
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json(
        {
          success: false,
          message: "userId is required",
        },
        {
          status: 400,
        }
      );
    }

    await prisma.sMTPConfig.delete({
      where: {
        userId,
      },
    });

    return NextResponse.json({
      success: true,
      message: "SMTP Config Deleted",
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        success: false,
        message: "Failed to delete SMTP config",
      },
      {
        status: 500,
      }
    );
  }
}