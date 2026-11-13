# Borrar la UO 2025-SON-FED-028.1 (producción)

Estado: APLICADO EN PRODUCCIÓN el 2026-11-13. En 00 estaba Pendiente, con 44.66 km y 0 dependientes; 02 dio ok = true.

## Por qué

La 2025-SON-FED-028.1 está repetida: tiene el mismo nombre que la 2025-SON-FED-028. Saúl revisó el 2026-11-13 que se puede borrar.

En el listado del 2026-11-12, la 2025-SON-FED-028.1 tenía 44.66 km. Al borrarla, esos km dejan de sumar en Sonora en Reporte KM.

Las tablas que dependen de una UO se borran en cascada con ella. Por eso el script 01 vuelve a revisar que estén vacías y falla si encuentra algo. Es el mismo procedimiento que se usó para la 1285 (`2026-11-13_borrar-uo-1285_produccion`).

## Orden

1. `00_lectura_vista-previa.sql`: debe dar `dependientes = 0` y `lista = true`. **Copia `fila_json` y guárdala fuera del repo**: es lo que necesita la reversa y puede traer UUIDs de usuarios.
2. `01_escritura_borrar-uo.sql`: aviso "Borrada: 2025-SON-FED-028.1".
3. `02_lectura_verificacion.sql`: `existe_repetida = 0`, `existe_original = 1` y `ok = true`.

Reversa: `db-changes/2026-11-13_borrar-uo-son-fed-028-1_reversa.sql`. Solo se edita el marcador `PEGAR_FILA_JSON`.

Es un cambio de datos, no de esquema: no hace falta correr la auditoría de seguridad.
