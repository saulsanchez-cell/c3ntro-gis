-- Que hace: prueba el cambio 01 y deshace todo al final (rollback).
-- Proyecto: solo SIGOprueba (iadojhaibxpnirzijivf). No se corre en produccion: mueve una UO real, aunque termine en rollback.
-- Resultado esperado: mensajes OK 01 a 03 (en la pestana de mensajes) y 04 OK o SALTADA; sin error.
--   04 se salta si SIGOprueba no tiene ninguna UO en Pendiente.
-- Corre sin sesion (SQL Editor): proteger_columnas_uo deja cambiar todas las columnas.

begin;

do $$
declare
  v_uo          uuid;
  v_act_antes   int;
  v_act_despues int;
  v_carga_antes   int;
  v_carga_despues int;
begin
  -- 01 Pendiente -> Bloqueada: solo coordinador y con motivo
  if not exists (select 1 from public.transiciones_permitidas
                  where estado_origen::text = 'Pendiente' and estado_destino::text = 'Bloqueada'
                    and solo_coordinador and requiere_motivo) then
    raise exception 'FALLO 01 falta Pendiente -> Bloqueada [solo coordinador] [motivo]';
  end if;
  raise notice 'OK   01 Pendiente -> Bloqueada, solo coordinador y con motivo';

  -- 02 Pendiente -> Cerrada: solo coordinador, sin motivo (el modal de cierre pide los datos)
  if not exists (select 1 from public.transiciones_permitidas
                  where estado_origen::text = 'Pendiente' and estado_destino::text = 'Cerrada'
                    and solo_coordinador and not requiere_motivo) then
    raise exception 'FALLO 02 falta Pendiente -> Cerrada [solo coordinador]';
  end if;
  raise notice 'OK   02 Pendiente -> Cerrada, solo coordinador';

  -- 03 sin filas repetidas desde Pendiente
  if exists (select 1 from public.transiciones_permitidas
              where estado_origen::text = 'Pendiente'
              group by estado_destino having count(*) > 1) then
    raise exception 'FALLO 03 hay transiciones repetidas desde Pendiente';
  end if;
  raise notice 'OK   03 sin transiciones repetidas desde Pendiente';

  -- 04 bloquear, desbloquear y cerrar una UO Pendiente no crea pasos ni carga
  select u.id into v_uo
    from public.unidades_operativas u
   where u.estado::text = 'Pendiente'
   order by u.id
   limit 1;

  if v_uo is null then
    raise notice 'SALTADA 04 no hay UOs en Pendiente en SIGOprueba';
    return;
  end if;

  select count(*) into v_act_antes   from public.actividades_uo where uo_id = v_uo;
  select count(*) into v_carga_antes from public.plan_carga_uo  where uo_id = v_uo;

  update public.unidades_operativas set estado = 'Bloqueada' where id = v_uo;
  update public.unidades_operativas set estado = 'Pendiente' where id = v_uo;
  update public.unidades_operativas
     set estado = 'Cerrada', tipo_validacion = 'conectividad_externa', referencia_externa = 'PRUEBA'
   where id = v_uo;

  select count(*) into v_act_despues   from public.actividades_uo where uo_id = v_uo;
  select count(*) into v_carga_despues from public.plan_carga_uo  where uo_id = v_uo;

  if v_act_despues <> v_act_antes or v_carga_despues <> v_carga_antes then
    raise exception 'FALLO 04 se crearon pasos (% -> %) o carga (% -> %)',
      v_act_antes, v_act_despues, v_carga_antes, v_carga_despues;
  end if;
  raise notice 'OK   04 Pendiente -> Bloqueada -> Pendiente -> Cerrada sin pasos ni carga nuevos';
end;
$$;

rollback;
