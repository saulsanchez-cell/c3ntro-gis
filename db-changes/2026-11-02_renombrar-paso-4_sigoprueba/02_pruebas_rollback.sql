-- Que hace: prueba dentro de begin ... rollback que, despues del 01, no queda nada con el nombre viejo y que una UO nueva que pasa a Asignada recibe el paso 4 con el nombre nuevo (perfil y UO ficticios, no deja datos).
-- Proyecto: SIGOprueba (iadojhaibxpnirzijivf). Solo despues del 01. No se corre en produccion.
-- Resultado esperado: 1 fila "OK: todas las pruebas pasaron (4)...". Si una falla, el script se detiene con "FALLO <n> ..." y no queda nada: mandar el mensaje completo.
-- Corrido en SIGOprueba el 2026-11-02: OK (4). No se corre en producción

begin;

do $$
begin
  if not exists (select 1 from public.plantillas_actividad where nombre = 'Ajustes y autorrevisión en Vetro') then
    raise exception 'Primero corre 01_escribe_cambio.sql';
  end if;
end $$;

create function pg_temp.verificar(p_prueba text, p_ok boolean)
returns void language plpgsql as $$
begin
  if p_ok is distinct from true then
    raise exception 'FALLO %', p_prueba;
  end if;
  raise notice 'OK   %', p_prueba;
end $$;

select pg_temp.verificar('01 plantilla: el paso 4 de asignacion se llama "Ajustes y autorrevisión en Vetro"',
  (select count(*) from public.plantillas_actividad
    where nombre = 'Ajustes y autorrevisión en Vetro'
      and orden = 4 and momento_creacion = 'asignacion') = 1);

select pg_temp.verificar('02 sin nombre viejo en plantillas ni actividades',
  not exists (select 1 from public.plantillas_actividad where nombre = 'Revisión y pulido en Vetro')
  and not exists (select 1 from public.actividades_uo where nombre = 'Revisión y pulido en Vetro'));

insert into public.profiles (id, nombre, iniciales, rol) values
  ('e0000000-0000-4000-8000-000000000041', 'Prueba Renombrar', 'PRR', 'digitalizador');

insert into public.unidades_operativas
  (referencia_operativa, nombre, tipo_proyecto, estado, metodo_constructivo, km_teoricos, digitalizador_id)
values ('PRUEBA-RENOMBRAR-1', 'Proyecto de prueba PRUEBA-RENOMBRAR-1', 'Baseline', 'Pendiente', 'Aereo', 10,
        'e0000000-0000-4000-8000-000000000041');

-- Dispara generar_actividades_uo, como al guardar una asignacion
update public.unidades_operativas
   set estado = 'Asignada'
 where referencia_operativa = 'PRUEBA-RENOMBRAR-1';

select pg_temp.verificar('03 UO nueva: el paso 4 se crea con el nombre nuevo',
  (select a.nombre from public.actividades_uo a
     join public.unidades_operativas u on u.id = a.uo_id
    where u.referencia_operativa = 'PRUEBA-RENOMBRAR-1' and a.orden = 4) = 'Ajustes y autorrevisión en Vetro');

select pg_temp.verificar('04 UO nueva: los pasos 1 a 3 conservan su nombre',
  (select string_agg(a.nombre, ' | ' order by a.orden) from public.actividades_uo a
     join public.unidades_operativas u on u.id = a.uo_id
    where u.referencia_operativa = 'PRUEBA-RENOMBRAR-1' and a.orden < 4)
  = 'Revisión de insumos | Preparación de archivos (Vertex) | Carga en Vetro');

rollback;

select 'OK: todas las pruebas pasaron (4). Se hizo rollback, no quedaron datos.' as resultado;
