import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/services/database/prisma";

// GET
// ?userId=xxx          -> Get all templates
// ?id=xxx              -> Get single template
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const id = searchParams.get("id");
    const userId = searchParams.get("userId");

    if (id) {
      const template = await prisma.emailTemplate.findUnique({
        where: { id },
      });

      if (!template) {
        return NextResponse.json(
          { error: "Template not found" },
          { status: 404 }
        );
      }

      return NextResponse.json(template);
    }

    if (!userId) {
      return NextResponse.json(
        { error: "userId is required" },
        { status: 400 }
      );
    }

    const templates = await prisma.emailTemplate.findMany({
      where: { userId },
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json(templates);
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}

// POST
// Create template
export async function POST(req: NextRequest) {
  try {
    const { userId, subject, body } = await req.json();

    if (!userId || !subject || !body) {
      return NextResponse.json(
        { error: "userId, subject and body are required" },
        { status: 400 }
      );
    }

    const template = await prisma.emailTemplate.create({
      data: {
        userId,
        subject,
        body,
      },
    });

    return NextResponse.json(template, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Failed to create template" },
      { status: 500 }
    );
  }
}

// DELETE
// /api/email-templates?id=templateId
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "id is required" },
        { status: 400 }
      );
    }

    await prisma.emailTemplate.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      message: "Template deleted successfully",
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Failed to delete template" },
      { status: 500 }
    );
  }
}