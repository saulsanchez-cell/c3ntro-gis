# Transiciones desde Pendiente: pasos en producción

**Estado: APLICADO EN SIGOPRUEBA Y PRODUCCIÓN el 2026-11-23.** Saúl confirmó el 2026-11-25 que el `00`, el `01`, el `03`, la auditoría y la prueba en la app salieron bien (sin pegar los resultados).

Producción: `rtwjwfpaturmbmegwtys`. Se corre en el SQL Editor, un archivo a la vez y sin texto seleccionado.

Requisito: el cambio ya está aplicado y probado en SIGOprueba, con `02_pruebas_rollback.sql` en OK.

| Paso | Archivo (en `../2026-11-23_transiciones-desde-pendiente_sigoprueba/`) | Resultado esperado |
|---|---|---|
| 1 | `00_lectura_previa.sql` | 1 fila con `todo_listo = true` y `salidas_de_pendiente` = `Pendiente -> Asignada`. Si sale `false`, no seguir y mandar la fila. |
| 2 | `01_escribe_cambio.sql` | Sin filas y sin error. |
| 3 | `03_lectura_resultado.sql` | Las 5 filas que dice su encabezado. |
| 4 | `../2026-11-02_seguridad-anon-y-profiles_sigoprueba/03_lectura_auditoria-seguridad.sql` | Solo filas con `conocido = true` (no cambia permisos). |

No se corre en producción: `02_pruebas_rollback.sql` (mueve una UO real, aunque termine en `rollback`).

Prueba en la app (la única permitida en producción): con una UO Pendiente real de baja importancia, como coordinador, en FichaUO "Cambiar estado..." debe ofrecer Bloqueada (pide motivo) y Cerrada (abre el modal de cierre). Bloquearla y regresarla a Pendiente.

Después:
- Anotar la fecha en el encabezado del `01` (`APLICADO EN SIGOPRUEBA Y PRODUCCIÓN`) y en este README.
- No hay frontend que esperar: la app toma las transiciones de la tabla en cuanto se aplica.

Qué cambia para el equipo en cuanto se aplica:
- Solo el coordinador ve Bloqueada y Cerrada en una UO Pendiente. Los analistas no ven nada nuevo.

Cuidado al usarlo:
- Para desbloquear una UO que se bloqueó desde Pendiente, usar **Pendiente**, no En Proceso. `Bloqueada -> En Proceso` ya existe, y una UO sin asignar quedaría En Proceso sin digitalizador ni pasos.
- Para las UOs sin planta externa, en el modal de cierre elegir **conectividad externa** y poner la referencia.

Reversa: `../2026-11-23_transiciones-desde-pendiente_reversa.sql`. No hay frontend que revertir antes.
