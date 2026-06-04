import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const supabase = createClient(
  'https://rtwjwfpaturmbmegwtys.supabase.co',
  'sb_publishable_pW3f_Od7dI1268ZvYpGI8w_LLULUDh2'
)

const data = JSON.parse(readFileSync('./data.json', 'utf-8'))

console.log(`Insertando ${data.length} registros...`)

const BATCH = 50
let ok = 0
for (let i = 0; i < data.length; i += BATCH) {
  const chunk = data.slice(i, i + BATCH)
  const { error } = await supabase.from('unidades_operativas').upsert(chunk)
  if (error) {
    console.error(`Error en batch ${i}:`, error.message)
  } else {
    ok += chunk.length
    process.stdout.write(`\r${ok}/${data.length} insertados...`)
  }
}
console.log('\nListo.')
