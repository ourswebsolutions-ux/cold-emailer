// lib/validateUser.ts
import { PrismaClient, UserStatus } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export async function validateUser(phone: string) {
  try {
    const user = await prisma.user.findUnique({
      where: {
        phone,
      },
      include: {
        smtpConfig: true,
      },
    });

    if (!user) {
      return null;
    }

    const now = new Date();

    // Check if user is active
    if (user.status !== UserStatus.ACTIVE) {
      return null;
    }

    // Check password expiration
    if (user.passwordExpiresAt && user.passwordExpiresAt < now) {
      return null;
    }

    // Check session expiration
    if (!user.sessionExpiresAt || user.sessionExpiresAt < now) {
      // Auto disable expired session
      await prisma.user.update({
        where: {
          id: user.id,
        },
        data: {
          status: UserStatus.DISABLED,
          sessionExpiresAt: null,
        },
      });
      return null;
    }

    return user;
  } catch (error) {
    console.error("ValidateUser error:", error);
    return null;
  }
}