# Corrección de entidad federativa en 24 UOs (producción)

Estado: APLICADO EN PRODUCCIÓN el 2026-11-12. El listado completo de UOs de ese día ya muestra las 24 con su entidad nueva.

## Por qué

La 314 (AT&T Morelia Anillo 1) se validó el 2026-11-12, pero sus 24.682 km no aparecieron en Michoacán en Reporte KM. Tenía la entidad CDMX y sus km se sumaron ahí. Al revisar Michoacán salieron errores en las dos direcciones:

- 8 UOs de Michoacán estaban en otra entidad: 314–318, 365 y 488 en CDMX, y 555 en Querétaro.
- 16 UOs de otros estados estaban en Michoacán. Son las referencias 62–94: Cancún, Monterrey, CDMX y Estado de México.

Decisiones de Saúl: la 61, la 66 y la 68 se quedan en Michoacán. La 1285.9 (Sonora) y la 1359 (CDMX) están bien.

La app no muestra ni deja editar la entidad después de crear la UO, por eso el error no se veía.

## Orden

1. `00_lectura_vista-previa.sql`: debe dar 24 filas con `listo = true`.
2. `01_escritura_corregir-entidad.sql`: aviso "Corregidas: 24". Si no son 24, falla y no guarda nada.
3. `02_lectura_verificacion.sql`: debe dar Michoacán con 15 UOs, 439.54 km, 24.68 validados y `ok = true`.
4. Abrir Reporte KM y comprobar que Michoacán marca 24.68 / 439.54.

Reversa: `db-changes/2026-11-12_entidad-uos_reversa.sql`.

Es un cambio de datos, no de esquema: no hace falta correr la auditoría de seguridad. En SIGOprueba no hay datos reales; ahí solo se comprobó que los scripts de lectura corren.

## Ronda 2 (29 UOs de otras entidades)

Estado: APLICADO EN PRODUCCIÓN el 2026-11-12 (03, 04 y 05 sin errores).

Salió de revisar el listado completo de UOs del 2026-11-12. Solo se tomaron en cuenta las que tienen km, porque las de 0 km no cambian el reporte.

| Nueva entidad | Referencias (entidad anterior) |
|---|---|
| Querétaro | 49, 170, 270, 400, 658, 902 y 1385 (CDMX); 1005 (Nuevo León; la mayor parte está en Querétaro) |
| Jalisco | 101 (CDMX) |
| Nuevo León | 128, 184 y 724 (CDMX) |
| Puebla | 304 y 372 (CDMX); 647 (Querétaro) |
| CDMX | 575, 1206, 1212 y 1442 (Querétaro); 9 (Nuevo León) |
| Estado de México | 586, 603, 1201 y 1210 (Querétaro) |
| Chihuahua | 536 (Querétaro) |
| Sonora | 1198.1, 1198.6, 1198.7 y 1198.9 (Sinaloa) |

Se quedan como están: la 624 (sin información), y la 177, la 188, la 13 y la 120, que cruzan entidades. Las demás las corrige el coordinador desde FichaUO cuando lleguen a revisión.

1. `03_lectura_vista-previa-ronda2.sql`: debe dar 29 filas con `listo = true`.
2. `04_escritura_corregir-entidad-ronda2.sql`: aviso "Corregidas: 29".
3. `05_lectura_verificacion-ronda2.sql`: debe dar `corregidas = 29` y `ok = true`.

Reversa: `db-changes/2026-11-12_entidad-uos-ronda2_reversa.sql`.
