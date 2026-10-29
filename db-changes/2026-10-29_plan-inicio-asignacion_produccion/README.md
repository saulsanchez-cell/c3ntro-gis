Aplicado en producción el 2026-10-29: pasos 1 a 7 con el resultado esperado; ensayo con la UO 656 (Miguel Angel Sanchez, No empezar antes de 2026-11-03).

# "No empezar antes de": aplicación en PRODUCCIÓN (rtwjwfpaturmbmegwtys)

Cada archivo es una corrida en el SQL Editor de Supabase. Antes de cada una:

- Confirma en la URL del editor que estás en **rtwjwfpaturmbmegwtys** (producción).
- Quita cualquier texto seleccionado: si hay selección, solo se ejecuta la selección.
- El editor solo muestra el resultado de la última consulta; por eso cada archivo de lectura tiene una sola.

El cambio **no está copiado aquí**. Se corre tal cual, sin editar:

- Cambio: `db-changes/2026-10-29_plan-inicio-asignacion_sigoprueba/01_escribe_cambio.sql`
- Reversa (solo si hace falta): `db-changes/2026-10-29_plan-inicio-asignacion_reversa.sql`

No se corren en producción las pruebas (`02_pruebas_rollback.sql` de la carpeta `_sigoprueba`) ni las 52 del plan semanal.

## Reglas de esta aplicación

1. **El SQL se aplica primero.** El frontend (`feature/plan-inicio-asignacion`) no se fusiona hasta que los pasos 1 a 4 salgan bien.
2. **El frontend se prueba en el preview de Vercel antes de fusionar.** El preview usa producción: la prueba escribe datos reales. Se hace con **una UO real de baja importancia**, que de verdad haya que asignar, y nada más.
3. **Para revertir:** primero se revierte el frontend (revert del PR o redeploy de la versión anterior) y **después** se corre la reversa independiente. Al revés, cualquier asignación con fecha falla porque la columna ya no existe.
4. **Nadie asigna UOs durante la aplicación.** El trigger de asignación ya está activo con asignaciones reales: avisa al equipo antes del paso 1 y libera hasta terminar el paso 4 (o el 7 si haces el ensayo en la misma ventana).

## Orden

| Paso | Archivo | Escribe | Qué esperar | Qué me mandas |
|---|---|---|---|---|
| 0 | Aviso al equipo: nadie asigna UOs | — | — | — |
| 1 | `00_lectura_columna-y-huellas.sql` | No | 1 fila, todo en `true`, `todo_listo = true` | Solo si algo sale `false`: la fila. **Detente.** |
| 2 | **`../2026-10-29_plan-inicio-asignacion_sigoprueba/01_escribe_cambio.sql`** (tal cual) | **Sí** | Sin filas y sin error | Solo si hay error: el mensaje completo |
| 3 | `02_lectura_permisos-proponer.sql` | No | 1 fila, `todo_listo = true`; `public_execute`, `anon_execute` y `authenticated_execute` en `false` | Solo si algo no coincide: la fila |
| 4 | `03_lectura_consistencia.sql` | No | 0 filas | Si hay filas: todas |
| 5 | Preview de Vercel de `feature/plan-inicio-asignacion`: en FichaUO asigna **una UO real de baja importancia**, con digitalizador y una fecha en "NO EMPEZAR ANTES DE" | **Sí (la app)** | La asignación se guarda sin alert de error; al recargar, el panel muestra la fecha como texto con la nota de REPROGRAMAR | La referencia de esa UO y la fecha que pusiste |
| 6 | `04_lectura_ensayo-asignacion.sql` (reemplaza `PEGAR_REFERENCIA`; córrelo el mismo día del paso 5) | No | 4 filas; `fecha_origen = 'propuesta'`, `cumple_no_antes_de = true`, `suma_carga = jornadas_esperadas`; `primer_dia_carga` es la fecha que pusiste o el siguiente día hábil con espacio | Las 4 filas |
| 7 | `03_lectura_consistencia.sql` otra vez | No | 0 filas | Si hay filas: todas |
| 8 | Actualizar encabezados con la fecha de producción (ver "Después"), commit con las fechas y Squash and merge del PR | — | — | Confirmación |

## Si algo sale mal

- **Paso 1 con `false`:** producción no está como SIGOprueba antes del cambio. No corras el paso 2: el 01 compararía contra otra versión y la reversa restauraría un cuerpo que no es el de producción. Mándame la fila.
- **Paso 2 con error:** el archivo va dentro de `begin … commit` y el editor deshace todo si falla; no queda nada a medias. El 01 aborta solo si la columna ya existe o si la huella de `proponer_fechas_uo` no es `5a907348c2626b4c083433688c99b686`. Mándame el error.
- **Pasos 3 o 4 no coinciden:** no sigas al preview. Mándame el resultado. Si hay que deshacer, el frontend todavía no está fusionado: se puede correr la reversa directamente.
- **Paso 5 con alert de error:** el alert trae el mensaje de Supabase; mándamelo. El historial puede quedar con un registro "Asignada" aunque el UPDATE haya fallado (el insert va antes; es comportamiento anterior a este cambio).
- **Paso 6 sin fechas (actividades sin `fecha_programada`, sin carga):** la asignación se guardó pero la propuesta falló (queda un WARNING en los logs de Postgres). Mándame las filas; no hace falta deshacer nada.
- **Paso 6 con `cumple_no_antes_de = false`:** no fusiones. Mándame las filas.
- **Revertir después de fusionar:** primero el frontend; después `db-changes/2026-10-29_plan-inicio-asignacion_reversa.sql`. La reversa borra los valores de la columna (el NOTICE dice cuántas UOs tenían); las fechas y la carga ya propuestas no cambian.

## Después

- Con el paso 7 en verde: actualizar el encabezado de `../2026-10-29_plan-inicio-asignacion_sigoprueba/01_escribe_cambio.sql` (marca `APLICADO EN SIGOPRUEBA Y PRODUCCIÓN` y fecha de producción) y anotar arriba de este README la fecha y la UO del ensayo. Luego el commit con las fechas.
- Solo entonces se fusiona el frontend (paso 8).
