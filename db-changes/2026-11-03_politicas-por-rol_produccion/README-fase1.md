# Políticas por rol, fase 1: aplicación en PRODUCCIÓN (rtwjwfpaturmbmegwtys)

Estado: APLICADO EN SIGOPRUEBA Y PRODUCCIÓN (2026-11-03). Pasos 1 a 4 con el resultado esperado (reportado por Saúl).

Cada archivo es una corrida en el SQL Editor de Supabase. Antes de cada una:

- Confirma en la URL del editor que estás en **rtwjwfpaturmbmegwtys** (producción).
- Quita cualquier texto seleccionado: si hay selección, solo se ejecuta la selección.
- El editor solo muestra el resultado de la última consulta; por eso cada archivo de lectura tiene una sola.

Los scripts **no están copiados aquí**. Se corren tal cual, sin editar, desde `../2026-11-03_politicas-por-rol-fase1_sigoprueba/`. No se corren en producción las pruebas (`02_pruebas_rollback.sql`).

Este cambio no necesita frontend: la app ya escribe con el propio usuario, en los borradores propios y en las UOs donde el analista es el QA. Sergio Canales empieza a contar como coordinador también en la base (REPROGRAMAR, marcar actividades de otros, editar perfiles).

## Orden

| Paso | Archivo | Escribe | Qué esperar | Qué me mandas |
|---|---|---|---|---|
| 0 | Aviso al equipo: 5 minutos sin guardar checklists ni logs | — | — | — |
| 1 | `00_lectura_previa.sql` | No | 1 fila, `todo_listo = true`, `coordinadores_activos = 2` | La fila |
| 2 | **`01_escribe_cambio.sql`** | **Sí** | Sin filas y sin error | Solo si hay error: el mensaje completo |
| 3 | `../2026-11-02_seguridad-anon-y-profiles_sigoprueba/03_lectura_auditoria-seguridad.sql` | No | 1 sola fila, con `conocido = true`: `unidades_operativas.auth_all_uo` | Si hay alguna con `false`: todas |
| 4 | En la app de producción: un analista guarda un log de avance en su UO; tú abres un Checklist (sin enviarlo) y un Plan semanal | No (el log sí escribe, es trabajo real) | Todo funciona como siempre | Solo si algo falla |
| 5 | Anotar fechas en los encabezados y en CLAUDE.md; commit con las fechas | — | — | Confirmación |

Antes del paso 2, la auditoría (paso 3) da 8 filas con `conocido = false`: son las 8 políticas que cierra el 01. Es lo esperado.

## Si algo sale mal

- **Paso 1 con `false`:** producción no está como SIGOprueba. No corras el 01; mándame la fila.
- **Paso 2 con error:** el archivo va dentro de `begin … commit` y el editor deshace todo. Mándame el error.
- **Paso 4, alguien no puede guardar algo que antes sí:** corre `../2026-11-03_politicas-por-rol-fase1_reversa.sql` (no depende del frontend) y mándame qué pantalla, qué usuario y el mensaje.
