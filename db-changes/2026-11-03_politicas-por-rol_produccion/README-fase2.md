# Políticas por rol, fase 2 (`unidades_operativas`): aplicación en PRODUCCIÓN (rtwjwfpaturmbmegwtys)

Estado: APLICADO EN SIGOPRUEBA Y PRODUCCIÓN (2026-11-03). Pasos 1 a 4 con el resultado esperado (reportado por Saúl). Requiere la fase 1.

Cada archivo es una corrida en el SQL Editor de Supabase. Antes de cada una:

- Confirma en la URL del editor que estás en **rtwjwfpaturmbmegwtys** (producción).
- Quita cualquier texto seleccionado: si hay selección, solo se ejecuta la selección.
- El editor solo muestra el resultado de la última consulta; por eso cada archivo de lectura tiene una sola.

Los scripts **no están copiados aquí**. Se corren tal cual, sin editar, desde `../2026-11-03_politicas-por-rol-fase2_sigoprueba/`. No se corren en producción las pruebas (`02_pruebas_rollback.sql`).

## Reglas de esta aplicación

1. **El SQL va primero.** El frontend de la fase 2 (en el mismo PR: oculta "+ NUEVA UO" y el cambio de estado a quien no puede) se fusiona después de los pasos 1 a 4.
2. Hasta que se fusione el frontend, quien no puede verá el botón, pero la base rechaza la acción con un alert: "No tienes permiso para cambiar: …" o "new row violates row-level security policy".
3. **Para revertir:** primero el frontend y después `../2026-11-03_politicas-por-rol-fase2_reversa.sql`.

## Orden

| Paso | Archivo | Escribe | Qué esperar | Qué me mandas |
|---|---|---|---|---|
| 0 | Aviso al equipo: 5 minutos sin guardar cambios en UOs | — | — | — |
| 1 | `00_lectura_previa.sql` | No | 1 fila, `todo_listo = true` | La fila |
| 2 | **`01_escribe_cambio.sql`** | **Sí** | Sin filas y sin error | Solo si hay error: el mensaje completo |
| 3 | `../2026-11-02_seguridad-anon-y-profiles_sigoprueba/03_lectura_auditoria-seguridad.sql` | No | **0 filas** | Si hay filas: todas |
| 4 | En la app de producción: un analista registra un log y cambia el estado de su UO; tú guardas una asignación o un cambio en una UO; una cuenta de apoyo (Edgar o Martin) registra un log en una UO ajena | Sí (trabajo real) | Todo se guarda como siempre | Solo si algo falla: pantalla, usuario y mensaje |
| 5 | Squash and merge del PR (frontend incluido); anotar fechas y CLAUDE.md | — | — | Confirmación |

Antes del paso 2, la auditoría da 1 fila con `conocido = false` (`unidades_operativas.auth_all_uo`): es la que cierra el 01. Es lo esperado.

## Si algo sale mal

- **Paso 1 con `false`:** producción no está como SIGOprueba (¿falta la fase 1?). No corras el 01; mándame la fila.
- **Paso 2 con error:** el archivo va dentro de `begin … commit` y el editor deshace todo. Mándame el error.
- **Paso 4, alguien no puede guardar algo que hace siempre:** corre `../2026-11-03_politicas-por-rol-fase2_reversa.sql` y mándame qué pantalla, qué usuario y el mensaje.
