# Ausencias en el plan semanal: pasos en producción

**Estado: APLICADO EN PRODUCCIÓN el 2026-11-12.** Pasos 1 a 4 corridos por Saúl: `todo_listo = true`, el `01` sin error, el `03` con las mismas huellas que SIGOprueba y la auditoría con 0 filas.

Producción: `rtwjwfpaturmbmegwtys`. Se corre en el SQL Editor, un archivo a la vez y sin texto seleccionado.

Requisito: el cambio ya está aplicado y probado en SIGOprueba, con `02_pruebas_rollback.sql` en OK (16).

| Paso | Archivo (en `../2026-11-12_plan-ausencias_sigoprueba/`) | Resultado esperado |
|---|---|---|
| 1 | `00_lectura_previa.sql` | 1 fila con `todo_listo = true`. Si sale `false`, no seguir y mandar la fila. |
| 2 | `01_escribe_cambio.sql` | Sin filas y sin error. |
| 3 | `03_lectura_permisos.sql` | 9 filas con `ok = true` y las **mismas huellas** que en SIGOprueba: `plan_carga_persona` = `53007a90297d5d35b9718b1f966d7554` y `plan_ausencia_persona` = `715a3fcc727396b1fbc11f356f9eba7b`. |
| 4 | `../2026-11-02_seguridad-anon-y-profiles_sigoprueba/03_lectura_auditoria-seguridad.sql` | 0 filas. |

No se corre en producción: `02_pruebas_rollback.sql` (crea perfiles y UOs ficticios, aunque termine en `rollback`).

Después:
- Anotar la fecha en el encabezado del `01` (`APLICADO EN SIGOPRUEBA Y PRODUCCIÓN`) y las huellas en CLAUDE.md.
- Hasta entonces no se fusiona el frontend de las ausencias.

Qué cambia para el equipo en cuanto se aplica, aunque el frontend todavía no esté:
- Nada visible: la tabla nace vacía y `plan_carga_persona` da los mismos números mientras no haya ausencias.

Reversa: `../2026-11-12_plan-ausencias_reversa.sql`. Antes se revierte el frontend. La reversa borra las ausencias registradas: guárdalas primero si hace falta.
