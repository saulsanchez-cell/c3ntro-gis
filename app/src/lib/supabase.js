import { createClient } from '@supabase/supabase-js'

// Respaldo: producción. Las variables VITE_ (p. ej. en app/.env.local) solo se
// usan si vienen las dos, para no mezclar la URL de un proyecto con la key de otro.
const PROYECTO_PRODUCCION = 'rtwjwfpaturmbmegwtys'
const SUPABASE_URL_DEFAULT = `https://${PROYECTO_PRODUCCION}.supabase.co`
const SUPABASE_ANON_KEY_DEFAULT = 'sb_publishable_pW3f_Od7dI1268ZvYpGI8w_LLULUDh2'

const usarEnv = Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY)

const SUPABASE_URL = usarEnv ? import.meta.env.VITE_SUPABASE_URL : SUPABASE_URL_DEFAULT
const SUPABASE_ANON_KEY = usarEnv ? import.meta.env.VITE_SUPABASE_ANON_KEY : SUPABASE_ANON_KEY_DEFAULT

// En desarrollo (npm run dev) nunca se conecta a producción: sin app/.env.local
// la app usaba producción y solo avisaba en la consola (pasó el 2026-11-02).
// main.jsx muestra este mensaje en lugar de la app. El build (Vercel) no cambia.
export const ERROR_ENTORNO = !import.meta.env.DEV ? null
  : !usarEnv ? 'Falta app/.env.local (VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY de SIGOprueba). En desarrollo la app no se conecta a producción.'
  : SUPABASE_URL.includes(PROYECTO_PRODUCCION) ? 'app/.env.local apunta a producción. En desarrollo usa SIGOprueba.'
  : null

export const supabase = ERROR_ENTORNO ? null : createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  }
})
