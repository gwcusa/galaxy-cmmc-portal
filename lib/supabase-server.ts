import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

function isValidUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

export function createServerSupabaseClient() {
  const cookieStore = cookies();
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseUrl = isValidUrl(rawUrl) ? rawUrl! : "https://placeholder.supabase.co";
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-key";
  return createServerClient(
    supabaseUrl,
    supabaseKey,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: Record<string, unknown>) {
          cookieStore.set({ name, value, ...options });
        },
        remove(name: string, options: Record<string, unknown>) {
          cookieStore.set({ name, value: "", ...options });
        },
      },
    }
  );
}

export function createServiceSupabaseClient() {
  const cookieStore = cookies();
  const rawUrl2 = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseUrl2 = isValidUrl(rawUrl2) ? rawUrl2! : "https://placeholder.supabase.co";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder-service-key";
  return createServerClient(
    supabaseUrl2,
    serviceKey,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: Record<string, unknown>) {
          cookieStore.set({ name, value, ...options });
        },
        remove(name: string, options: Record<string, unknown>) {
          cookieStore.set({ name, value: "", ...options });
        },
      },
    }
  );
}
