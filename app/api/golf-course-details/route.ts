import { NextRequest, NextResponse } from 'next/server';

const API_BASE = 'https://api.golfcourseapi.com/v1';
const API_KEY = process.env.NEXT_PUBLIC_GOLF_COURSE_API_KEY;

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id');
  const name = request.nextUrl.searchParams.get('name');

  console.log("Details request for:", { id, name });

  // Try by ID
  if (id && API_KEY) {
    try {
      const res = await fetch(`${API_BASE}/courses/${id}`, {
        headers: { 'Authorization': `Key ${API_KEY}` }
      });

      if (res.ok) {
        const data = await res.json();
        console.log("ID fetch success");
        return NextResponse.json({
          ...data,
          scorecard: data.scorecard || data.holes || [],
        });
      }
    } catch (e) {
      console.error('ID fetch failed:', e);
    }
  }

  // Try by name
  if (name && API_KEY) {
    try {
      const res = await fetch(`${API_BASE}/search?search_query=${encodeURIComponent(name)}`, {
        headers: { 'Authorization': `Key ${API_KEY}` }
      });

      if (res.ok) {
        const data = await res.json();
        const course = data.courses?.[0];
        if (course) {
          console.log("Name search success");
          return NextResponse.json({
            ...course,
            scorecard: course.scorecard || course.holes || [],
          });
        }
      }
    } catch (e) {
      console.error('Name search failed:', e);
    }
  }

  // Mock
  console.log("Using mock data");
  const mockData = {
    name: name || 'Mock Golf Club',
    course_name: name || 'Mock Golf Club',
    scorecard: Array.from({ length: 18 }, (_, i) => ({
      Hole: i + 1,
      Par: [4,5,4,4,3,4,5,4,4,4,5,4,3,4,5,4,3,4][i],
      yardage: [450,520,380,410,190,430,550,390,420,460,530,400,210,440,560,380,220,450][i],
      Handicap: (i % 18) + 1
    }))
  };

  return NextResponse.json(mockData);
}