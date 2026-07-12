import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('q');

  if (!query || query.length < 3) {
    return NextResponse.json([]);
  }

  try {
    const res = await fetch(`https://api.golfapi.io/courses/search?q=${encodeURIComponent(query)}`, {
      headers: {
        'Authorization': `Bearer ${process.env.NEXT_PUBLIC_GOLFAPI_IO_KEY}`
      }
    });

    if (!res.ok) {
      console.error("Golf API error:", res.status);
      return NextResponse.json([]);
    }

    const data = await res.json();
    return NextResponse.json(data.courses || data || []);
  } catch (err) {
    console.error('Golf search error:', err);
    return NextResponse.json([]);
  }
}
