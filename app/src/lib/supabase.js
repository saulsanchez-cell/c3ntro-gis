import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://rtwjwfpaturmbmegwtys.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_pW3f_Od7dI1268ZvYpGI8w_LLULUDh2'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  }
})