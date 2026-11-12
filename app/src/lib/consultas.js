// La API de Supabase devuelve como máximo 1000 filas por consulta (Max Rows) y
// corta el resto sin avisar. leerTodas pide la tabla en bloques con .range()
// hasta que un bloque llega incompleto, y junta todo.
//
// crear(desde, hasta) debe devolver una consulta NUEVA en cada llamada (el
// builder de Supabase no se reutiliza) con un orden estable que termine en una
// columna única, normalmente .order('id'); si no, entre bloques se pueden
// repetir o perder filas.
//
// Devuelve { data, error } como una consulta normal: si un bloque falla,
// data = null y error = el de ese bloque.

export const TAM_BLOQUE = 1000
const MAX_BLOQUES = 200  // 200 000 filas: freno por si la consulta no termina

export async function leerTodas(crear, tam = TAM_BLOQUE) {
  const data = []
  for (let i = 0; i < MAX_BLOQUES; i++) {
    const desde = i * tam
    const { data: bloque, error } = await crear(desde, desde + tam - 1)
    if (error) return { data: null, error }
    data.push(...(bloque || []))
    if (!bloque || bloque.length < tam) return { data, error: null }
  }
  return { data: null, error: { message: `La consulta paso de ${MAX_BLOQUES * tam} filas` } }
}
