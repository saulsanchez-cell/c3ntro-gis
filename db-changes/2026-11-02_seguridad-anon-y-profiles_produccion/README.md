# Cierre de anon y profiles solo coordinador: aplicación en PRODUCCIÓN (rtwjwfpaturmbmegwtys)

Estado: APLICADO EN SIGOPRUEBA Y PRODUCCIÓN (2026-11-02). Pasos 1 a 5 con el resultado esperado (reportado por Saúl).

Cada archivo es una corrida en el SQL Editor de Supabase. Antes de cada una:

- Confirma en la URL del editor que estás en **rtwjwfpaturmbmegwtys** (producción).
- Quita cualquier texto seleccionado: si hay selección, solo se ejecuta la selección.
- El editor solo muestra el resultado de la última consulta; por eso cada archivo de lectura tiene una sola.

Los scripts **no están copiados aquí**. Se corren tal cual, sin editar, desde `../2026-11-02_seguridad-anon-y-profiles_sigoprueba/`. No se corren en producción las pruebas (`02_pruebas_rollback.sql`).

Este cambio no tiene frontend: la app no cambia y no hay nada que fusionar antes o después del SQL. No hace falta pedirle al equipo que deje de trabajar.

## Orden

| Paso | Archivo | Escribe | Qué esperar | Qué me mandas |
|---|---|---|---|---|
| 1 | `00_lectura_previa.sql` | No | 1 fila, `todo_listo = true` | La fila (`tablas_con_anon` y `tablas_con_truncate_auth` son informativas) |
| 2 | `03_lectura_auditoria-seguridad.sql` | No | Las filas de antes del cambio: en SIGOprueba fueron 9 con `conocido = true` y 30 con `false` | Todas las filas con `conocido = false` |
| 3 | **`01_escribe_cambio.sql`** | **Sí** | Sin filas y sin error | Solo si hay error: el mensaje completo |
| 4 | `03_lectura_auditoria-seguridad.sql` otra vez | No | Solo filas con `conocido = true` (9) | Si hay alguna con `false`: todas |
| 5 | En la app de producción (no el preview): entra, abre Overview, una FichaUO y un Checklist; cierra sesión y abre `/login` | No | Todo carga como siempre; sin sesión manda a `/login` | Solo si algo no carga |
| 6 | Anotar fechas en los encabezados y en CLAUDE.md; commit con las fechas | — | — | Confirmación |

## Si algo sale mal

- **Paso 1 con `false`:** producción no está como SIGOprueba. No corras el 01; mándame la fila.
- **Paso 2 con filas `false` distintas de las de SIGOprueba:** mándamelas antes de seguir. Puede ser algo propio de producción.
- **Paso 3 con error:** el archivo va dentro de `begin … commit` y el editor deshace todo. Mándame el error.
- **Paso 5, alguna pantalla no carga:** corre `../2026-11-02_seguridad-anon-y-profiles_reversa.sql` (no depende del frontend) y mándame qué pantalla falló.

## Después

- Quedan 9 políticas de escritura abiertas (`USING true`) en las tablas viejas: es el pendiente de las políticas por rol.
- `03_lectura_auditoria-seguridad.sql` se vuelve a correr después de cada cambio de SQL. Cuando se cierre un hallazgo conocido, se quita de su lista en el mismo PR.
