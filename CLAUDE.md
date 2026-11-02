# SIGO v1 — Contexto para Claude Code

Responde siempre en español.

## Qué es

SIGO v1 es el sistema de gestión operativa GIS de C3ntro Telecom: React + Vite (carpeta `app/`), Supabase, Vercel y GitHub. Está en producción con datos reales de clientes.

La reconstrucción v2 (Laravel, Vue, MySQL, Entra ID, GitLab) se hace aparte con TI. Este repo es v1 y la especificación funcional de v2; este archivo no aplica a v2.

## Entornos (lo más importante)

- **Producción:** `rtwjwfpaturmbmegwtys`. Datos reales. El agente nunca se conecta a este proyecto ni lo modifica.
- **SIGOprueba:** `iadojhaibxpnirzijivf`. Esquema de SIGO sin datos reales. El MCP de Supabase apunta solo aquí, en solo lectura.
- Si se recrea el Codespace, reconectar el MCP solo a SIGOprueba: `claude mcp add --transport http supabase "https://mcp.supabase.com/mcp?project_ref=iadojhaibxpnirzijivf&read_only=true&features=database,docs"`. Nunca con el ID de producción.
- `app/.env.local` apunta a SIGOprueba. Git lo ignora por la regla `*.local`. No lo leas, no lo imprimas y no pidas claves.
- Sin ese archivo, `app/src/lib/supabase.js` usa producción. En desarrollo avisa con `console.warn`.
- Los previews de Vercel usan producción. No hagas pruebas que escriban datos en un preview.
- Excepción a la regla de los previews: se permite **una** prueba de escritura en un preview, hecha por la persona, a propósito, con una sola UO real de baja importancia, después de aplicar el SQL en producción y antes de fusionar.
- El frontend no se mergea hasta que el SQL del que depende esté aplicado en producción.
- Orden obligatorio: SQL primero, frontend después. Para revertir, al revés: primero se revierte el frontend y después se corre la reversa independiente.

## Cambios de base de datos (`db-changes/`)

Un cambio son tres archivos: `AAAA-MM-DD_nombre.sql`, `_reversa.sql` y `_pruebas.sql`. El encabezado indica el estado y la fecha de aplicación en cada proyecto.

Marcas de estado:
- `PROPUESTO, NO APLICADO`
- `APLICADO EN SIGOPRUEBA, PENDIENTE EN PRODUCCIÓN`
- `APLICADO EN SIGOPRUEBA Y PRODUCCIÓN`
- `APLICADO EN PRODUCCIÓN` (cambios de datos que solo existen en producción, como un rescate acotado)

Las reversas, el seed y los rescates no llevan fecha hasta que se apliquen.

Reglas:
- **El agente no aplica cambios en ninguna base.** Escribe los archivos y la persona los aplica. Sí puede hacer consultas de solo lectura sobre SIGOprueba por el MCP (esquema, políticas, permisos, definiciones, conteos). Nunca SQL que escriba, ni consultas contra producción.
- Orden de aplicación: SIGOprueba, pruebas, producción, verificación, y al final el commit con las fechas.
- Cada archivo va dentro de `begin; ... commit;`. El SQL Editor de Supabase deshace todo cuando un script completo falla (comprobado el 2026-10-26).
- Si hay texto seleccionado en el editor, solo se ejecuta la selección. Hay que quitarla antes de ejecutar.
- **Prohibido usar tablas temporales** (`create temp table`, `on commit drop`). Fallaron dos veces en el SQL Editor con `42P01: relation does not exist`. Usa `VALUES`, CTE o un bloque `DO` con variables.
- Los scripts de rescate o de datos se dividen en una parte A (solo lectura, vista previa) y una parte B (la escritura), que se corren por separado.
- El editor solo muestra el resultado de la última consulta. Las verificaciones van cada una en su propia consulta.
- Los scripts de pruebas terminan en `rollback`. Los de seed o rescate guardan datos y nunca se corren en producción sin revisar.
- No se escriben en el repo claves ni los UUID de usuarios de Authentication (seed, pruebas): se reemplazan en el editor al correr el script. Excepción documentada: el UUID fijo del coordinador, que ya existe en el código y en las políticas.
- `schema.sql` en la raíz es un dump local, excluido en `.git/info/exclude`. Puede estar desactualizado y no se sube.
- Los scripts de `db-changes/` van numerados, uno por corrida, y cada uno dice su resultado esperado. Al correrlos solo se edita un marcador `PEGAR_*` (por ejemplo `PEGAR_REFERENCIA`); nada más.

## Plan semanal

- `unidades_operativas.fecha_no_antes_de` (opcional): se guarda en el mismo UPDATE que la asignación. `proponer_fechas_uo` usa `greatest(coalesce(p_inicio, plan_hoy()), fecha_no_antes_de)`. No se recalcula al reasignar; para mover las fechas después se usa REPROGRAMAR. Aplicado en SIGOprueba y producción el 2026-10-29. Huella de `proponer_fechas_uo` tras el cambio: `77bdbd410611bbd0ab7b03c86dc4ebb3`.
- Validación planeada (`db-changes/2026-11-02_plan-validacion_*`), aplicada en SIGOprueba y producción el 2026-11-02:
  - La plantilla "Validación de calidad" (orden 5) está activa. `generar_actividades_uo` la crea al pasar a Asignada con responsable `analista_qa_id`, aunque esté vacío.
  - Su carga va en `plan_carga_actividad`, no en `plan_carga_uo`. `plan_carga_persona` suma las dos tablas, porque el analista también digitaliza.
  - `proponer_validacion_uo` la pone en el primer día desde el paso 4 (o desde hoy) con `jornadas_validacion_uo` (0.5) libres, sin partirla. El trigger `trg_reasignar_validacion_uo` la mueve al cambiar el analista y la propone si no tenía carga.
  - Se cierra sola solo al pasar de `En Validacion` a `Validada` (`trg_cerrar_validacion_uo`). `marcar_actividad` y `desmarcar_actividad` la rechazan.
  - `reprogramar_actividad`: mover la validación solo mueve su carga; mover un paso del digitalizador la arrastra.
  - Reglas V1–V4 en `plan_inconsistencias_validacion()`.
  - "Nadie se autovalida" es un trigger (`validar_analista_distinto_uo`), no un check: solo revisa cuando cambia el digitalizador o el analista, porque en producción hay 8 UOs viejas con la misma persona (7 Cerradas y la 1447 Validada).
  - Huellas en `03_lectura_permisos.sql`. Las pruebas viejas del plan (52 y 19) ya no pasan tal cual: esperan 4 actividades y ahora son 5.
  - Las UOs asignadas antes de que existieran las actividades no tienen validación (15 en producción); van con el rescate pendiente.
  - Frontend (PR #29, 2026-11-02): la vista Carga, "Dónde asignar" y la vista previa de REPROGRAMAR suman `plan_carga_actividad`. La tarjeta punteada tiene estado y REPROGRAMAR. El KPI "VALIDACIONES" va aparte y ATRASADAS cuenta solo los pasos. En FichaUO la validación no tiene botones ("Se completa al validar en el checklist") y el analista no puede ser el digitalizador si cambia alguno de los dos. La validación se identifica por `plantilla.momento_creacion`, no por el orden.
- `plan_dias_inhabiles`: 7 días de descanso de ley cargados el 2026-10-29 (2026-11-16, 2026-12-25, 2027-01-01, 2027-02-01, 2027-03-15, 2027-09-16, 2027-11-15). Los feriados judíos se cargan cuando llegue el calendario, un archivo por año. Lo ya programado en un día que luego se vuelve inhábil no se mueve solo: se corrige con REPROGRAMAR.

## Seguridad en la base

- Toda función `SECURITY DEFINER` lleva `SET search_path = ''`, nombres calificados, `REVOKE ALL` de `public`, `anon` y `authenticated`, y `GRANT EXECUTE` solo a `authenticated` cuando deba llamarse desde la app.
- Toda tabla nueva lleva RLS, `REVOKE ALL` a `anon` y `public`, y políticas para `authenticated`. Nunca políticas abiertas para `public` con `true`.
- Después de aplicar, verifica con `has_table_privilege` y `has_function_privilege`.
- Las políticas de las tablas viejas siguen siendo `USING (true)` para `authenticated`. Se resuelven con políticas por rol, que está pendiente. No las amplíes.
- El registro de eventos (`actividades_uo_eventos`) es de solo inserción, y los cambios sensibles siguen el patrón valor anterior, valor nuevo, usuario, motivo y timestamp.

## Deuda técnica conocida (v2)

- El UUID del coordinador `7063db07-ed16-4ca5-8c98-53b63d128702` está fijo en `proteger_km_teoricos()`, `es_coordinador()`, las políticas de `log_distancia` y `metas_proyecto`, y en el frontend (`USUARIO_AUTORIZADO_DISTANCIA`). En v2 debe ser un permiso guardado en la base.
- `DELETE` sobre `unidades_operativas` está abierto para cualquier sesión y borra el historial y los eventos por cascada. Riesgo aceptado hasta que existan políticas por rol.
- Cualquier sesión puede cambiar su propio `rol` en `profiles`. Pendiente.

## No tocar sin que se pida

`profiles.rol`, el trigger `proteger_km_teoricos`, la máquina de estados, `Checklist.jsx`, `logs_actividad` y los reportes.

## Convenciones de código

- Las fechas de negocio se guardan como `timestamptz`. Hora de México con offset fijo `-06:00` (sin horario de verano desde 2022). Nunca uses `toISOString().split('T')[0]`: da el día en UTC y desfasa después de las 6 pm. Para el día de hoy usa `hoyMexico()` de `app/src/lib/fechas.js`. Las fechas ya guardadas con el día UTC no se corrigieron.
- Los estados en la base no llevan acento (`En Validacion`, `En Correccion`) y `estado` es el enum `estado_uo`.
- Tablas con su nombre real: `log_distancia` (singular) y `catalogo_observaciones_qa`.
- Las secciones nuevas de la interfaz fallan en silencio si la consulta da error: no rompen la pantalla.
- El registro en `historial_estados` se escribe solo después de que el UPDATE de la UO salió bien. Si falla, se avisa con un alert.
- Estilos en línea con las variables del proyecto (`var(--mono)`, etc.) y modales como los existentes.

## Flujo de git

- Cada cambio va en una rama nueva desde `main` actualizado: `git checkout main`, `git pull origin main`, `git checkout -b nombre`.
- Confirma la rama con `git branch` antes de commitear. Agrega los archivos por nombre, nunca con `git add .`.
- Corre `npm --prefix app run build` antes de proponer un commit. No hagas commit ni push sin aprobación.
- Flujo: PR, preview, Squash and merge, limpieza de la rama.
- Usa `git --no-pager` para evitar que la terminal se quede en el paginador.
- Tras un Squash and merge, `git branch -d` puede negarse aunque el contenido esté en `main`. Compara con `git diff main rama` antes de forzar con `-D`.
- Nunca borres ramas pegando una lista: una a la vez y escribiendo el nombre. Nunca `main` (está protegida en GitHub).
- Para decidir si una rama se puede borrar, compárala contra `origin/main` y cuenta solo las líneas únicas de la rama: `git diff origin/main RAMA | grep -c '^+[^+]'`.

## Cómo trabajar

- Primero explora y entrega un PLAN. No escribas código hasta que se apruebe.
- Di claramente qué verificaste y qué no pudiste verificar. No afirmes que algo funciona si no lo ejecutaste.
- Si una instrucción contradice una regla de este archivo, avísalo antes de seguir.

## Pendientes conocidos

- Políticas por rol y protección de `profiles.rol`.
- Fase 2 de actividades: validación por ronda e indicador de avance en Backlog y Overview.
- Rescate de UOs en curso: el script `rescate-opcional` original no se aplica tal cual. Revisado el 2026-11-02 (`db-changes/2026-11-02_rescate-sin-pasos_produccion/00_lectura_uos-sin-pasos.sql`): hay 15 UOs activas sin pasos, y **por ahora no se planea ninguna**:
  - Las 8 En Validacion (57, 202, 314–318, 543) tienen la validación pausada por dependencias.
  - 177 (Asignada), 101, 235, 433 y 8 (En Proceso) están detenidas por dependencias externas. Casi todas tienen la carga completa según su log.
  - 2025-ZAC-XXX-167 no tiene digitalizador, analista ni método.
  - 1297.2 ya se validó y liberó.
  - Razón: el plan reserva las jornadas completas desde hoy (177: 40.58; 433: 75.57) y bloquearía meses a un digitalizador.
  - Cuando se resuelva la dependencia de una UO, se planea con un script acotado a esa referencia. El coordinador puede pasarlas a Bloqueada mientras tanto.
- Migración a v2 con TI.
- Aviso "sin km" en la tarjeta.
- Etiqueta de "Pendientes de hoy" en semanas pasadas.
- Mostrar el motivo del feriado en pantalla y en el PDF.
