// lib/auth/get-current-user.ts

import { cookies } from "next/headers";
import { prisma } from "@/services/database/prisma";

export async function getCurrentUser() {
  const cookieStore = await cookies();

  const userId = cookieStore.get("userId")?.value;

  if (!userId) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: {
      id: userId,
    },
  });

  return user;
}