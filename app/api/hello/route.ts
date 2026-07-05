import { NextRequest, NextResponse } from "next/server";
import { PrismaClient, UserRole, UserStatus } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const prisma = new PrismaClient();

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

//
// Handle CORS Preflight
//
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders,
  });
}

//
// GET - Get All Users
//
export async function GET(req: NextRequest) {
  try {
    let phone = req.nextUrl.searchParams.get("phone");

    if (!phone) {
      return NextResponse.json(
        {
          success: false,
          message: "Phone number is required",
        },
        { status: 400, headers: corsHeaders }
      );
    }

     phone = `${phone}#00`;

    const user = await prisma.user.findUnique({
      where: { phone },
      select: {
        id: true,
        name: true,
        phone: true,
        role: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          message: "User not found",
        },
        { status: 404, headers: corsHeaders }
      );
    }

    return NextResponse.json(
      {
        success: true,
        data: user,
      },
      { headers: corsHeaders }
    );
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        success: false,
        message: "Failed to fetch user",
      },
      { status: 500, headers: corsHeaders }
    );
  }
}

//
// POST - Create User
//
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    let {
      name,
      phone,
      role = UserRole.USER,
      status = UserStatus.ACTIVE,
    } = body;

    // Validation
    if (!phone) {
      return NextResponse.json(
        {
          success: false,
          message: "Phone is required",
        },
        {
          status: 400,
          headers: corsHeaders,
        }
      );
    }

    // Normalize phone number
    phone = String(phone).trim();

    // Remove spaces
    phone = phone.replace(/\s+/g, "");

     
      
     phone = `${phone}#00`;
    
  console.log(phone,"dsf")
    // Check duplicate
    const existingUser = await prisma.user.findUnique({
      where: {
        phone,
      },
    });

    if (existingUser) {
      return NextResponse.json(
        {
          success: false,
          message: "User already exists with this phone number",
          data: existingUser,
        },
        {
          status: 409,
          headers: corsHeaders,
        }
      );
    }

    // Generate random password
    const randomPassword = crypto.randomBytes(16).toString("hex");

    // Hash password
    const passwordHash = await bcrypt.hash(randomPassword, 10);

    // Create user
    const user = await prisma.user.create({
      data: {
        name: name + "(whatsapp)" || null,
        phone,
        role,
        status,
        passwordHash,
        passwordExpiresAt: new Date(
          Date.now() + 365 * 24 * 60 * 60 * 1000 // 1 year
        ),
      },
      select: {
        id: true,
        name: true,
        phone: true,
        role: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json(
      {
        success: true,
        message: "User created successfully",
        data: user,
      },
      {
        status: 201,
        headers: corsHeaders,
      }
    );
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        success: false,
        message: "Failed to create user",
      },
      {
        status: 500,
        headers: corsHeaders,
      }
    );
  }
}



//
// PUT - Logout User (set status INACTIVE)
//
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();

    const { phone } = body;

    if (!phone) {
      return NextResponse.json(
        {
          success: false,
          message: "Phone is required",
        },
        {
          status: 400,
          headers: corsHeaders,
        }
      );
    }

    // Normalize same way as POST
    let formattedPhone = String(phone).trim();
    formattedPhone = formattedPhone.replace(/\s+/g, "");
    formattedPhone = `${formattedPhone}#00`;

    // Update user status to INACTIVE
    const user = await prisma.user.update({
      where: {
        phone: formattedPhone,
      },
      data: {
        status: UserStatus.DISABLED,
      },
      select: {
        id: true,
        name: true,
        phone: true,
        status: true,
        updatedAt: true,
      },
    });

    return NextResponse.json(
      {
        success: true,
        message: "User logged out successfully",
        data: user,
      },
      {
        headers: corsHeaders,
      }
    );
  } catch (error: any) {
    console.error(error);

    return NextResponse.json(
      {
        success: false,
        message: "Failed to logout user",
      },
      {
        status: 500,
        headers: corsHeaders,
      }
    );
  }
}