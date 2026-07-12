// app/api/golf-course-details/route.ts
import { NextRequest, NextResponse } from 'next/server';

const API_BASE = 'https://api.golfcourseapi.com/v1';
const API_KEY = process.env.NEXT_PUBLIC_GOLF_COURSE_API_KEY;

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id');
  const name = request.nextUrl.searchParams.get('name');

  // Try real API first
  if (id && API_KEY) {
    try {
      const res = await fetch(`${API_BASE}/courses/${id}`, {
        headers: { 'Authorization': `Key ${API_KEY}` }
      });

      if (res.ok) {
        const data = await res.json();
        // Normalize to consistent shape for your frontend
        return NextResponse.json({
          ...data,
          scorecard: data.scorecard || data.holes || [],
          source: 'golfcourseapi'
        });
      }
    } catch (e) {
      console.error('Details fetch failed:', e);
    }
  }

  // Mock full data (rich enough for scorecards)
  const mockData = {
    name: name || 'Mock Golf Club',
    course_name: name || 'Mock Golf Club',
    location: 'Cumming, GA',
    scorecard: Array.from({ length: 18 }, (_, i) => ({
      Hole: i + 1,
      Par: [4,5,4,4,3,4,5,4,4,4,5,4,3,4,5,4,3,4][i % 18],
      yardage: [450,520,380,410,190,430,550,390,420,460,530,400,210,440,560,380,220,450][i % 18],
      Handicap: ((i % 18) + 1)
    }))
  };

  return NextResponse.json(mockData);
}