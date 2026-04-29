// app/libs/supabase/supabase-server-client.ts
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { getEnvVar } from '@/app/utils/get-env-var';

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    getEnvVar(process.env.NEXT_PUBLIC_SUPABASE_URL!, 'NEXT_PUBLIC_SUPABASE_URL'),
    getEnvVar(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, 'NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch (error) {
            // Ignore cookie errors in some edge cases
          }
        },
      },
    }
  );
}