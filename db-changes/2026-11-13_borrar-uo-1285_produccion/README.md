# Borrar la UO 1285 (producción)

Estado: APLICADO EN PRODUCCIÓN el 2026-11-13 (00, 01 y 02 sin errores).

## Por qué

La 1285 (ATT IRU Tradicional CD Obregon) se dio de alta como una sola UO, pero en la práctica el trabajo se hizo en la 1285.1 y la 1285.2. La 1285 quedó obsoleta.

Revisado en producción el 2026-11-13: está Pendiente, tiene 0 km, no tiene digitalizador y no hay nada que dependa de ella (logs, historial, checklists, borradores, distancia, actividades ni carga del plan).

Las tablas que dependen de una UO se borran en cascada con ella. Por eso el script 01 vuelve a revisar que estén vacías y falla si encuentra algo.

## Orden

1. `00_lectura_vista-previa.sql`: debe dar `dependientes = 0` y `lista = true`. **Copia `fila_json` y guárdala fuera del repo**: es lo que necesita la reversa y puede traer UUIDs de usuarios.
2. `01_escritura_borrar-uo.sql`: aviso "Borrada: 1285".
3. `02_lectura_verificacion.sql`: `existe_1285 = 0`, `hijas = 2` y `ok = true`.

Reversa: `db-changes/2026-11-13_borrar-uo-1285_reversa.sql`. Solo se edita el marcador `PEGAR_FILA_JSON`.

Es un cambio de datos, no de esquema: no hace falta correr la auditoría de seguridad.
