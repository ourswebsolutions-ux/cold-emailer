import { NextRequest, NextResponse } from "next/server"
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// GET - Spin Greeting status
export async function GET(req: NextRequest) {
  try {
    const userId = req.nextUrl.searchParams.get("userId")

    if (!userId) {
      return NextResponse.json(
        { success: false, error: "userId is required" },
        { status: 400 }
      )
    }

    const greeting = await prisma.spinGreeting.findFirst({
      where: {
        userId,
      },
      select: {
        spixwork: true,
      },
    })

    return NextResponse.json({
      success: true,
      enabled: greeting?.spixwork ?? false,
    })
  } catch (error) {
    console.error("GET /api/email/greeting error:", error)

    return NextResponse.json(
      { success: false, error: "Failed to get greeting status" },
      { status: 500 }
    )
  }
}

// POST - Spin Greeting ON/OFF
export async function POST(req: NextRequest) {
  try {
    const { userId, enabled } = await req.json()

    if (!userId || typeof enabled !== "boolean") {
      return NextResponse.json(
        {
          success: false,
          error: "userId and enabled are required",
        },
        { status: 400 }
      )
    }

    const result = await prisma.spinGreeting.updateMany({
      where: {
        userId,
      },
      data: {
        spixwork: enabled,
      },
    })

    return NextResponse.json({
      success: true,
      enabled,
      updated: result.count,
    })
  } catch (error) {
    console.error("POST /api/email/greeting error:", error)

    return NextResponse.json(
      { success: false, error: "Failed to update greeting status" },
      { status: 500 }
    )
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()

    const { userId, enabled } = body

    if (!userId) {
      return NextResponse.json(
        { success: false, error: "userId is required" },
        { status: 400 }
      )
    }

    if (typeof enabled !== "boolean") {
      return NextResponse.json(
        { success: false, error: "enabled must be boolean" },
        { status: 400 }
      )
    }

    await prisma.spinGreeting.updateMany({
      where: {
        userId,
      },
      data: {
        spixwork: enabled,
      },
    })

    return NextResponse.json({
      success: true,
      enabled,
    })
  } catch (error) {
    console.error("PATCH /api/email/greeting error:", error)

    return NextResponse.json(
      {
        success: false,
        error: "Failed to update spin greeting",
      },
      { status: 500 }
    )
  }
}