import { NextRequest, NextResponse } from "next/server"
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// GET: greetings fetch
export async function GET(req: NextRequest) {
  try {
    const userId = req.nextUrl.searchParams.get("userId")

    if (!userId) {
      return NextResponse.json(
        { success: false, error: "userId is required" },
        { status: 400 }
      )
    }

    const greetings = await prisma.spinGreeting.findMany({
      where: {
        userId,
      },
      orderBy: {
        createdAt: "asc",
      },
    })

    return NextResponse.json({
      success: true,
      data: greetings.map((item) => item.value),
    })
  } catch (error) {
    console.error("GET /api/email/spin-text error:", error)

    return NextResponse.json(
      { success: false, error: "Failed to fetch greetings" },
      { status: 500 }
    )
  }
}

// POST: greeting add
export async function POST(req: NextRequest) {
  try {
    const { userId, value } = await req.json()

    if (!userId || !value?.trim()) {
      return NextResponse.json(
        { success: false, error: "userId and value are required" },
        { status: 400 }
      )
    }

    const greeting = await prisma.spinGreeting.create({
      data: {
        userId,
        value: value.trim(),
      },
    })

    return NextResponse.json({
      success: true,
      data: greeting,
    })
  } catch (error) {
    console.error("POST /api/email/spin-text error:", error)

    return NextResponse.json(
      { success: false, error: "Failed to add greeting" },
      { status: 500 }
    )
  }
}

// DELETE: greeting delete
export async function DELETE(req: NextRequest) {
  try {
    const { userId, value } = await req.json()

    if (!userId || !value) {
      return NextResponse.json(
        { success: false, error: "userId and value are required" },
        { status: 400 }
      )
    }

    await prisma.spinGreeting.deleteMany({
      where: {
        userId,
        value,
      },
    })

    return NextResponse.json({
      success: true,
      message: "Greeting deleted successfully",
    })
  } catch (error) {
    console.error("DELETE /api/email/spin-text error:", error)

    return NextResponse.json(
      { success: false, error: "Failed to delete greeting" },
      { status: 500 }
    )
  }
}