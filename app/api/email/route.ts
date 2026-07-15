import { NextRequest, NextResponse } from "next/server";
import { PrismaClient, EmailStatus } from "@prisma/client";

const prisma = new PrismaClient();

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json(
        {
          success: false,
          message: "userId is required",
        },
        { status: 400 }
      );
    }

    const emails = await prisma.email.findMany({
      where: {
        userId,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json({
      success: true,
      data: emails,
    });
  } catch (err) {
    console.error(err);

    return NextResponse.json(
      {
        success: false,
        message: "Internal Server Error",
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, contacts } = body;

    if (!userId || !Array.isArray(contacts)) {
      return NextResponse.json(
        {
          success: false,
          message: "userId and contacts are required",
        },
        { status: 400 }
      );
    }

    const data = contacts
      .filter((item: any) => item.email)
      .map((item: any) => ({
        userId,
        name: item.name,
        email: item.email.toLowerCase(),
        phone: item.phone,
        website: item.website,
        category: item.category,
        status: EmailStatus.PENDING,
      }));

    await prisma.email.createMany({
      data,
      skipDuplicates: true,
    });

    return NextResponse.json({
      success: true,
      message: "Contacts Saved",
    });
  } catch (err) {
    console.error(err);

    return NextResponse.json(
      {
        success: false,
        message: "Internal Server Error",
      },
      { status: 500 }
    );
  }
}
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { contacts } = body;

    if (!Array.isArray(contacts) || contacts.length === 0) {
      return NextResponse.json(
        {
          success: false,
          message: "contacts array is required",
        },
        { status: 400 }
      );
    }

    const updatedContacts = [];

    for (const contact of contacts) {
      const updated = await prisma.email.update({
        where: {
          id: contact.id,
        },
        data: {
          name: contact.name,
          email: contact.email.toLowerCase(),
          phone: contact.phone,
          website: contact.website,
          category: contact.category,
        },
      });

      updatedContacts.push(updated);
    }

    return NextResponse.json({
      success: true,
      message: "Contacts updated successfully",
      data: updatedContacts,
    });
  } catch (err) {
    console.error(err);

    return NextResponse.json(
      {
        success: false,
        message: "Update Failed",
      },
      { status: 500 }
    );
  }
}
export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const { ids, listId } = body;

    if (!ids || !Array.isArray(ids)) {
      return NextResponse.json({ success: false, message: "ids array required" }, { status: 400 });
    }

    await prisma.email.deleteMany({ where: { id: { in: ids } } });

    if (listId) {
      await prisma.emailList.update({
        where: { id: listId },
        data: { totalEmails: await prisma.email.count({ where: { listId } }) },
      });
    }

    return NextResponse.json({ success: true, message: "Deleted Successfully" });
  } catch (err) {
    console.log(err);
    return NextResponse.json({ success: false, message: "Delete Failed" }, { status: 500 });
  }
}