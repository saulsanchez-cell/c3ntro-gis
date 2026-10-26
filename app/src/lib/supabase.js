import { createClient } from '@supabase/supabase-js'

// Respaldo: producción. Las variables VITE_ (p. ej. en app/.env.local) solo se
// usan si vienen las dos, para no mezclar la URL de un proyecto con la key de otro.
const SUPABASE_URL_DEFAULT = 'https://rtwjwfpaturmbmegwtys.supabase.co'
const SUPABASE_ANON_KEY_DEFAULT = 'sb_publishable_pW3f_Od7dI1268ZvYpGI8w_LLULUDh2'

const usarEnv = Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY)

const SUPABASE_URL = usarEnv ? import.meta.env.VITE_SUPABASE_URL : SUPABASE_URL_DEFAULT
const SUPABASE_ANON_KEY = usarEnv ? import.meta.env.VITE_SUPABASE_ANON_KEY : SUPABASE_ANON_KEY_DEFAULT

if (import.meta.env.DEV && !usarEnv) {
  console.warn('[supabase] Sin VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY: usando PRODUCCIÓN (' + SUPABASE_URL_DEFAULT + ')')
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  }
})
