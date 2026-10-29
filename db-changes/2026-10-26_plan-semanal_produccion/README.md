Aplicado en producción el 2026-10-29: pasos 00a a 06 con resultado esperado; ensayo con la UO 1660.

# Plan semanal: aplicación en PRODUCCIÓN (rtwjwfpaturmbmegwtys)

Cada archivo es una corrida en el SQL Editor de Supabase. Antes de cada una:

- Confirma en la URL del editor que estás en **rtwjwfpaturmbmegwtys** (producción).
- Quita cualquier texto seleccionado: si hay selección, solo se ejecuta la selección.
- El editor solo muestra el resultado de la última consulta; por eso cada archivo de lectura tiene una sola.

El cambio en sí **no está copiado aquí**. Se corren tal cual, sin editar:

- Cambio: `db-changes/2026-10-26_plan-semanal.sql`
- Reversa (solo si hace falta): `db-changes/2026-10-26_plan-semanal_reversa.sql`

No se corren en producción: pruebas, seed, backfill ni los scripts temporales de `es_coordinador()`.

## Orden

| Paso | Archivo | Escribe | Qué esperar | Qué me mandas |
|---|---|---|---|---|
| 1 | `00a_lectura_tablas-no-existen.sql` | No | 1 fila, `todo_listo = true` | Solo si sale `false`: la fila |
| 2 | `00b_lectura_funciones-actuales.sql` | No | 2 filas, `igual_a_la_reversa = true` | Si alguna sale `false`: **detente** y mándame la columna `definicion` de esa fila |
| 3 | `00c_lectura_perfiles-y-datos.sql` | No | `perfiles_seed = 0`, `uos_seed_prueba = 0`, `integrantes_encontrados = 3` | La fila completa (quiero ver los analistas) |
| 4 | **`../2026-10-26_plan-semanal.sql`** (el cambio, tal cual) | **Sí** | Sin filas y sin error | Solo si hay error: el mensaje completo |
| 5 | `02a_lectura_permisos-tablas.sql` | No | 6 filas: `rls` y `authenticated_select` en true, lo demás false | Solo si algo no coincide |
| 6 | `02b_lectura_permisos-funciones.sql` | No | 13 filas: `search_path_vacio` true, `anon_execute` false; `authenticated_execute` true solo en `reprogramar_actividad` | Solo si algo no coincide |
| 7 | `02c_lectura_semillas.sql` | No | 12 filas: 3 rendimientos (30 / 5 / 17.5), 7 de capacidad (viernes 0.75 "9-15 h", sábado y domingo 0), 2 parámetros (0.5 y 1.0) | Solo si algo no coincide |
| 8 | `03_escribe_integrantes.sql` | **Sí** | Sin filas y sin error | Si aborta: el mensaje completo |
| 9 | `04_lectura_integrantes.sql` | No | 3 filas en orden: Ademir Marquez, Miguel Angel Sanchez, Uziel Alarcon | Solo si algo no coincide |
| 10 | En la app (producción): asigna una UO real a uno de los tres desde FichaUO | **Sí (la app)** | La asignación se guarda como siempre | La referencia de esa UO |
| 11 | `05_lectura_ensayo-asignacion.sql` (reemplaza `PEGAR_REFERENCIA`) | No | 4 filas con fecha desde hoy y `fecha_origen = 'propuesta'`; `suma_carga = jornadas_esperadas` | Las 4 filas |
| 12 | `06_lectura_consistencia.sql` | No | 0 filas | Si hay filas: todas |

## Si algo sale mal

- **Paso 2 con `false`**: producción tiene una versión de `generar_actividades_uo` o `reasignar_actividades_uo` distinta de la de SIGOprueba. No corras el paso 4: el cambio la reemplazaría y la reversa restauraría la de SIGOprueba, no la de producción. Mándame la `definicion`; ajusto el cambio y la reversa a esa versión.
- **Paso 4 con error**: el archivo va dentro de `begin … commit` y el editor deshace todo si falla; no queda nada a medias. Mándame el error.
- **Pasos 5 a 7 no coinciden**: no sigas. Si hay que deshacer, corre la reversa tal cual. La reversa aborta si ya existe algún evento `reprogramar` (para no borrar auditoría); justo después de aplicar no habrá ninguno.
- **Paso 8 aborta**: no escribe nada. Lo normal es que un nombre no coincida exacto (acentos, espacios) o esté repetido; el mensaje dice cuál.
- **Paso 11 sin fechas**: la asignación se guardó pero la propuesta falló (queda un WARNING en los logs de Postgres). Mándame las filas; no hace falta deshacer nada.

## Después

- Con 12 en verde: actualizar los encabezados de `2026-10-26_plan-semanal.sql` (marca `APLICADO EN SIGOPRUEBA Y PRODUCCIÓN` y fecha de producción) y hacer el commit con las fechas.
- Solo entonces se mergea el frontend (`feature/plan-semanal`): CLAUDE.md pide que el SQL esté en producción antes.
- Los previews de Vercel usan producción: antes del paso 4 la pantalla Plan semanal sale vacía (falla en silencio); no es un error.
