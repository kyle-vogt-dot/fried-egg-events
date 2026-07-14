import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  console.log("Admin Invite API route hit!");

  try {
    const body = await request.json().catch(() => ({}));
    console.log("Body received:", body);

    return NextResponse.json({
      success: true,
      message: "Simulated email sent successfully"
    });
  } catch (error) {
    console.error("Route error:", error);
    return NextResponse.json({ 
      error: "Internal server error" 
    }, { status: 500 });
  }
}