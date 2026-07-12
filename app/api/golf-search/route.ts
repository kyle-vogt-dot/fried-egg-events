// app/api/golf-search/route.ts
import { NextRequest, NextResponse } from 'next/server';

const API_BASE = 'https://api.golfcourseapi.com/v1';
const API_KEY = process.env.NEXT_PUBLIC_GOLF_COURSE_API_KEY;

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('q');

  if (!query || query.length < 3) {
    return NextResponse.json({ results: [] });
  }

  try {
    if (API_KEY) {
      const res = await fetch(
        `${API_BASE}/search?search_query=${encodeURIComponent(query)}`,
        { headers: { 'Authorization': `Key ${API_KEY}` } }
      );

      if (res.ok) {
        const data = await res.json();
        return NextResponse.json({ 
          results: data.courses || data || [],
          source: 'golfcourseapi' 
        });
      }
    }
  } catch (err) {
    console.error('Search error:', err);
  }

  // Fallback mock search results
  return NextResponse.json({
    results: [{
      id: null, // no real id
      name: query,
      club_name: "Local Course",
      city: "Cumming",
      state: "GA",
      location: "Cumming, GA"
    }],
    source: 'mock'
  });
}