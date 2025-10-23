import { type NextRequest, NextResponse } from "next/server"

// This is handled by the main /api/send route
export async function GET(request: NextRequest) {
  return NextResponse.json({ error: "Use /api/send?jobId=... instead" }, { status: 400 })
}
