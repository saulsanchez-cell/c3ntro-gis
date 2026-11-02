-- Que hace: parte B (escribe). Renombra el paso 4 de "Revisión y pulido en Vetro" a "Ajustes y autorrevisión en Vetro" en la plantilla y en todas las actividades ya creadas a partir de ella (el nombre se copia al crear cada actividad). No toca fechas, carga, eventos ni estados. Es el mismo archivo para SIGOprueba y produccion.
-- Proyecto: SIGOprueba (iadojhaibxpnirzijivf) y despues PRODUCCIÓN (rtwjwfpaturmbmegwtys). Reversa: db-changes/2026-11-02_renombrar-paso-4_reversa.sql.
-- Resultado esperado: sin filas y sin error. En Mensajes, un NOTICE "Renombrado: 1 plantilla y N actividades" con la N que dio actividades_viejo en el 00.
-- Estado: APLICADO EN SIGOPRUEBA Y PRODUCCIÓN
-- Aplicado en SIGOprueba (iadojhaibxpnirzijivf): 2026-11-02 (14 actividades renombradas)
-- Aplicado en producción (rtwjwfpaturmbmegwtys): 2026-11-02 (19 actividades renombradas)

begin;

do $$
declare
  v_plantilla   uuid;
  v_actividades int;
begin
  select p.id into strict v_plantilla
    from public.plantillas_actividad p
   where p.nombre = 'Revisión y pulido en Vetro'
     and p.orden = 4
     and p.momento_creacion = 'asignacion';

  if exists (select 1 from public.plantillas_actividad where nombre = 'Ajustes y autorrevisión en Vetro') then
    raise exception 'Ya hay una plantilla "Ajustes y autorrevisión en Vetro". Abortado.';
  end if;

  update public.plantillas_actividad
     set nombre = 'Ajustes y autorrevisión en Vetro'
   where id = v_plantilla;

  update public.actividades_uo
     set nombre = 'Ajustes y autorrevisión en Vetro'
   where plantilla_id = v_plantilla
     and nombre = 'Revisión y pulido en Vetro';
  get diagnostics v_actividades = row_count;

  if exists (select 1 from public.actividades_uo
              where plantilla_id = v_plantilla
                and nombre <> 'Ajustes y autorrevisión en Vetro') then
    raise exception 'Quedaron actividades del paso 4 con otro nombre. Abortado.';
  end if;

  raise notice 'Renombrado: 1 plantilla y % actividades', v_actividades;
end $$;

commit;
