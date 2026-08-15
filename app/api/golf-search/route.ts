import { NextRequest, NextResponse } from 'next/server';

const GOLFCOURSE_BASE = 'https://api.golfcourseapi.com/v1';
const GOLFCOURSE_KEY =
  process.env.GOLF_COURSE_API_KEY ||
  process.env.NEXT_PUBLIC_GOLF_COURSE_API_KEY;

const RAPID_HOST =
  process.env.RAPIDAPI_GOLF_HOST || 'golf-course-api.p.rapidapi.com';
const RAPID_KEY = process.env.RAPIDAPI_KEY;

type NormalizedCourse = {
  id: string | number | null;
  name: string;
  club_name: string;
  city?: string;
  state?: string;
  location?: string;
  source: 'golfcourseapi' | 'rapidapi';
  raw?: any;
};

function normalizeGolfCourseApi(c: any): NormalizedCourse {
  const loc = c.location || {};
  const address = loc.address || '';
  return {
    id: c.id ?? null,
    name: c.course_name || c.club_name || c.name || 'Course',
    club_name: c.club_name || c.course_name || '',
    city: loc.city,
    state: loc.state,
    location:
      address ||
      [loc.city, loc.state].filter(Boolean).join(', ') ||
      undefined,
    source: 'golfcourseapi',
    raw: c,
  };
}

function normalizeRapid(c: any): NormalizedCourse {
  // RYZE / Rapid shapes vary — cover common fields
  const name =
    c.course_name ||
    c.courseName ||
    c.name ||
    c.club_name ||
    c.clubName ||
    'Course';
  const club = c.club_name || c.clubName || c.club || name;
  const city = c.city || c.location?.city;
  const state = c.state || c.location?.state;
  const address =
    c.address ||
    c.location?.address ||
    [city, state].filter(Boolean).join(', ');

  return {
    id: c.id ?? c.course_id ?? c.club_id ?? null,
    name,
    club_name: club,
    city,
    state,
    location: address || undefined,
    source: 'rapidapi',
    raw: c,
  };
}

async function searchGolfCourseApi(query: string): Promise<NormalizedCourse[]> {
  if (!GOLFCOURSE_KEY) return [];

  const res = await fetch(
    `${GOLFCOURSE_BASE}/search?search_query=${encodeURIComponent(query)}`,
    {
      headers: { Authorization: `Key ${GOLFCOURSE_KEY}` },
      next: { revalidate: 0 },
    }
  );

  if (!res.ok) {
    console.error('GolfCourseAPI search failed', res.status);
    return [];
  }

  const data = await res.json();
  const list = data.courses || data.data || (Array.isArray(data) ? data : []);
  return (list as any[]).map(normalizeGolfCourseApi);
}

async function searchRapidApi(query: string): Promise<NormalizedCourse[]> {
  if (!RAPID_KEY) return [];

  // Try common RYZE-style search paths; first that works wins
  const candidates = [
    `https://${RAPID_HOST}/search?name=${encodeURIComponent(query)}`,
    `https://${RAPID_HOST}/courses/search?name=${encodeURIComponent(query)}`,
    `https://${RAPID_HOST}/v1/search?name=${encodeURIComponent(query)}`,
    `https://${RAPID_HOST}/api/search?query=${encodeURIComponent(query)}`,
  ];

  const headers = {
    'X-RapidAPI-Key': RAPID_KEY,
    'X-RapidAPI-Host': RAPID_HOST,
  };

  for (const url of candidates) {
    try {
      const res = await fetch(url, { headers, next: { revalidate: 0 } });
      if (!res.ok) continue;

      const data = await res.json();
      const list =
        data.courses ||
        data.data ||
        data.results ||
        data.clubs ||
        (Array.isArray(data) ? data : []);

      if (Array.isArray(list) && list.length > 0) {
        return list.map(normalizeRapid);
      }
    } catch (e) {
      console.error('RapidAPI candidate failed', url, e);
    }
  }

  return [];
}

export async function GET(request: NextRequest) {
  const query = (request.nextUrl.searchParams.get('q') || '').trim();

  if (query.length < 3) {
    return NextResponse.json({ results: [], sources: [] });
  }

  const [primary, secondary] = await Promise.all([
    searchGolfCourseApi(query).catch((e) => {
      console.error(e);
      return [] as NormalizedCourse[];
    }),
    searchRapidApi(query).catch((e) => {
      console.error(e);
      return [] as NormalizedCourse[];
    }),
  ]);

  // Prefer GolfCourseAPI hits; append RapidAPI names that aren’t obvious dupes
  const seen = new Set(
    primary.map(
      (c) =>
        `${(c.name || '').toLowerCase()}|${(c.location || '').toLowerCase()}`
    )
  );

  const merged = [...primary];
  for (const c of secondary) {
    const key = `${(c.name || '').toLowerCase()}|${(c.location || '').toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(c);
    }
  }

  return NextResponse.json({
    results: merged.slice(0, 25),
    sources: {
      golfcourseapi: primary.length,
      rapidapi: secondary.length,
    },
  });
}