# Recalibración del plan semanal: pasos

**Estado: APLICADO el 2026-11-25.** Valores nuevos en SIGOprueba y producción; liberación de carga en producción (04c: `carga_futura` 0 y 2.0 hasta el 25 en las 3 UOs). En la app, Miguel y Uziel quedaron libres desde el 2026-11-26; Ademir seguía ocupado hasta el viernes (diagnóstico en `05_lectura_carga-ademir.sql`).

Dos cambios independientes:
- **Valores nuevos** desde el 2026-11-26: Mixto 35, Subterráneo 35 y Aéreo 60 km por jornada; jornada mínima por UO 0.33. Van en SIGOprueba y producción.
- **Liberar carga** desde el 2026-11-26 de 3 UOs que ya completaron sus 4 pasos (Miguel, Uziel y Ademir): 22.42 jornadas. Solo en producción.

Se corre en el SQL Editor, un archivo a la vez y sin texto seleccionado.

## 1. Valores nuevos en SIGOprueba (`iadojhaibxpnirzijivf`)

| Paso | Archivo | Resultado esperado |
|---|---|---|
| 1 | `00a_lectura_valores-vigentes.sql` (esta carpeta) | Aereo 30, Mixto 5, Subterraneo 17.5; jornada_minima_uo 0.5. Si no, no seguir. |
| 2 | `../2026-11-25_plan-recalibracion_sigoprueba/01_escribe_valores-nuevos.sql` | Sin filas y sin error. |
| 3 | `../2026-11-25_plan-recalibracion_sigoprueba/02_pruebas_valores-nuevos_rollback.sql` | OK 01 a 04 en mensajes. |

## 2. Valores nuevos en producción (`rtwjwfpaturmbmegwtys`), hoy o mañana antes de asignar

| Paso | Archivo | Resultado esperado |
|---|---|---|
| 4 | `../2026-11-25_plan-recalibracion_sigoprueba/01_escribe_valores-nuevos.sql` | Sin filas y sin error. |
| 5 | `../2026-11-25_plan-recalibracion_sigoprueba/02_pruebas_valores-nuevos_rollback.sql` | OK 01 a 04 (solo lee y termina en `rollback`). |
| 6 | `../2026-11-02_seguridad-anon-y-profiles_sigoprueba/03_lectura_auditoria-seguridad.sql` | Solo filas con `conocido = true`. |

## 3. Liberar carga en producción

| Paso | Archivo | Resultado esperado |
|---|---|---|
| 7 | `04a_lectura_vista-previa-liberar.sql` (parte A) | Filas que suman 12.82, 8.08 y 1.52 (22.42). **Guardar la columna `para_reversa`.** |
| 8 | `04b_escribe_liberar-carga.sql` (parte B) | Sin filas y sin error; en mensajes `OK carga liberada`. |
| 9 | `04c_lectura_resultado-liberar.sql` | 3 filas: `carga_futura` 0 y `carga_hasta_el_25` 2.0. |

Después, en la app: Plan semanal, vista Carga. Miguel, Uziel y Ademir deben verse libres desde el 2026-11-26.

## Después
- Anotar las fechas en los encabezados (`01`, `04b`) y en este README.
- No hay frontend que esperar.

## Reversas
- Valores: `../2026-11-25_plan-recalibracion_valores_reversa.sql`.
- Liberar carga: `../2026-11-25_plan-recalibracion_liberar_reversa.sql`, pegando las filas guardadas del `04a`.
