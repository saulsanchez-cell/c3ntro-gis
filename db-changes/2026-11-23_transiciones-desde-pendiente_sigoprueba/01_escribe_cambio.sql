-- Que hace: agrega dos transiciones desde Pendiente, solo para el coordinador: Pendiente -> Bloqueada (con motivo) y Pendiente -> Cerrada; escribe y hace commit.
-- Proyecto: SIGOprueba (iadojhaibxpnirzijivf), y despues produccion tal cual (ver ../2026-11-23_transiciones-desde-pendiente_produccion/README.md).
-- Reversa: db-changes/2026-11-23_transiciones-desde-pendiente_reversa.sql
-- Resultado esperado: sin filas y sin error. Si aborta porque alguna ya existe, no queda nada escrito: mandar el mensaje completo.
-- Estado: APLICADO EN SIGOPRUEBA Y PRODUCCIÓN
-- Aplicado en SIGOprueba (iadojhaibxpnirzijivf): 2026-11-23 (02: 04 SALTADA, SIGOprueba no tiene UOs en Pendiente)
-- Aplicado en producción (rtwjwfpaturmbmegwtys): 2026-11-23 (00, 01, 03 y auditoria correctos y prueba en la app; confirmado por Saul el 2026-11-25, sin pegar resultados)
--
-- Decisiones de Saul (2026-11-23):
--   - Una UO Pendiente se puede bloquear sin asignarla antes. Para desbloquearla se
--     usa Bloqueada -> Pendiente (ya existe) y despues se asigna normal con
--     "Guardar asignacion".
--   - Las UOs sin planta externa se cierran directo desde Pendiente, sin asignar.
--     En el modal de cierre se elige "conectividad externa" (pide la referencia).
--     Miden 400 m como maximo: no mueven el kilometraje.
--   - Una UO cerrada sin asignar no cuenta en los KPIs de nadie: kpisEvaluacion y
--     Equipo filtran por digitalizador_id o analista_qa_id.
--
-- No cambia el frontend: FichaUO lee las transiciones de esta tabla y ya respeta
-- solo_coordinador y requiere_motivo; Cerrada abre el modal de cierre.
-- No crea actividades ni carga en el plan: trg_generar_actividades_uo solo se
-- dispara al pasar a Asignada.
--
-- Cuidado (no lo cambia este script): ya existe Bloqueada -> En Proceso para
-- cualquiera con permiso sobre la UO. Una UO bloqueada desde Pendiente no tiene
-- digitalizador: si se pasa a En Proceso quedaria sin asignar y sin pasos. Siempre
-- regresarla a Pendiente.

begin;

do $$
begin
  if exists (select 1 from public.transiciones_permitidas t
              where t.estado_origen::text = 'Pendiente'
                and t.estado_destino::text in ('Bloqueada', 'Cerrada')) then
    raise exception 'Ya existe Pendiente -> Bloqueada o Pendiente -> Cerrada. Abortado.';
  end if;
end;
$$;

insert into public.transiciones_permitidas (estado_origen, estado_destino, solo_coordinador, requiere_motivo)
values ('Pendiente', 'Bloqueada', true, true),
       ('Pendiente', 'Cerrada',   true, false);

commit;
