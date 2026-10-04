import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const LOCAL_KEY = 'salary-studio-supabase'

function readLocalConfig() {
  try {
    const raw = localStorage.getItem(LOCAL_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as { url?: string; anonKey?: string }
    return {
      url: parsed.url?.trim(),
      anonKey: parsed.anonKey?.trim(),
    }
  } catch {
    return {}
  }
}

const local = readLocalConfig()
const supabaseUrl =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) || local.url
const supabaseAnonKey =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ||
  local.anonKey

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null

export function saveSupabaseConfig(url: string, anonKey: string) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify({ url, anonKey }))
}
