Aplicado en producción el 2026-11-02: pasos 1 a 3 con el resultado esperado (19 actividades renombradas).

# Renombrar el paso 4: aplicación en PRODUCCIÓN (rtwjwfpaturmbmegwtys)

Solo datos: el paso 4 pasa de **"Revisión y pulido en Vetro"** a **"Ajustes y autorrevisión en Vetro"**, en la plantilla y en todas las actividades ya creadas (el nombre se copia al crear cada actividad). No cambia funciones, fechas, carga, eventos ni estados.

Antes, el mismo cambio se aplica en SIGOprueba con los archivos de `../2026-11-02_renombrar-paso-4_sigoprueba/` (00, 01, 02 y 03, en ese orden).

Cada archivo es una corrida en el SQL Editor de Supabase. Antes de cada una:

- Confirma en la URL del editor que estás en **rtwjwfpaturmbmegwtys** (producción).
- Quita cualquier texto seleccionado: si hay selección, solo se ejecuta la selección.
- El editor solo muestra el resultado de la última consulta; por eso cada archivo de lectura tiene una sola.

El cambio **no está copiado aquí**. Se corre tal cual, sin editar:

- Cambio: `db-changes/2026-11-02_renombrar-paso-4_sigoprueba/01_escribe_cambio.sql`
- Reversa (solo si hace falta): `db-changes/2026-11-02_renombrar-paso-4_reversa.sql`

No se corre en producción la prueba `02_pruebas_rollback.sql` de la carpeta `_sigoprueba`.

## Orden

| Paso | Archivo | Escribe | Qué esperar | Qué me mandas |
|---|---|---|---|---|
| 1 | `00_lectura_previa.sql` | No | 1 fila, `todo_listo = true` | La fila (quiero ver `actividades_viejo`). Si `todo_listo = false`: **detente** |
| 2 | **`../2026-11-02_renombrar-paso-4_sigoprueba/01_escribe_cambio.sql`** (tal cual) | **Sí** | Sin filas y sin error; NOTICE "Renombrado: 1 plantilla y N actividades" | El NOTICE, o el error completo |
| 3 | `03_lectura_verificacion.sql` | No | 1 fila, `ok = true` y `actividades_nuevo` igual al `actividades_viejo` del paso 1 | La fila |

## Si algo sale mal

- **Paso 1 con `todo_listo = false`:** la plantilla no tiene el nombre esperado o alguien cambió nombres a mano. Mándame la fila y decidimos.
- **Paso 2 con error:** va dentro de `begin … commit`; el editor deshace todo si falla. Mándame el error.
- **Revertir:** primero se revierte el frontend (leyenda del PDF) y después se corre la reversa tal cual.

## Después

- Con los 3 pasos en verde: actualizar el encabezado de `../2026-11-02_renombrar-paso-4_sigoprueba/01_escribe_cambio.sql` (marca `APLICADO EN SIGOPRUEBA Y PRODUCCIÓN` y fechas) y anotar arriba de este README la fecha de aplicación. Luego el commit con las fechas.
- El PR del frontend (leyenda del PDF) se fusiona solo después de aplicar en producción.
