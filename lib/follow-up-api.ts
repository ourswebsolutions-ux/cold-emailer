import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { prisma } from "@/services/database/prisma";

export { prisma };

export async function getCurrentUserId(): Promise<string | null> {
  const user = await getCurrentUser();

  return user?.id ?? null;
}

export function jsonOk<T>(data: T, status = 200) {
  return NextResponse.json(
    {
      success: true,
      data,
    },
    { status }
  );
}

export function jsonError(error: string, status = 400) {
  return NextResponse.json(
    {
      success: false,
      error,
    },
    { status }
  );
}

export function unauthorized() {
  return jsonError("Unauthorized", 401);
}

export function notFound(message = "Not found") {
  return jsonError(message, 404);
}

export function forbidden(message = "Forbidden") {
  return jsonError(message, 403);
}