-- Que hace: verificacion final en produccion despues de 04b y 06 (solo lectura): validaciones creadas y con fecha, carga, plantilla, parametro y triggers "nadie se autovalida".
-- Proyecto: produccion (rtwjwfpaturmbmegwtys).
-- Resultado esperado: 1 fila con validaciones = 15, con_fecha = 15, filas_carga = 15, antes_del_paso4 = 0, responsable_distinto = 0, check_viejo = 0, y plantilla_activa, parametro_ok, triggers_ok y todo_listo en true. Mandar la fila.
-- Corrido en produccion el 2026-11-02: todo_listo = true (15, 15, 15, 0, 0)

with val as (
  select a.id, a.uo_id, a.ronda, a.fecha_programada, a.responsable_id, u.analista_qa_id
    from public.actividades_uo a
    join public.plantillas_actividad p on p.id = a.plantilla_id
    join public.unidades_operativas u on u.id = a.uo_id
   where p.momento_creacion = 'validacion'
),
r as (
  select (select count(*) from val) as validaciones,
         (select count(*) from val where fecha_programada is not null) as con_fecha,
         (select count(*) from public.plan_carga_actividad) as filas_carga,
         (select count(*) from val v
           where v.fecha_programada < (select max(b.fecha_programada) from public.actividades_uo b
                                        join public.plantillas_actividad q on q.id = b.plantilla_id
                                       where b.uo_id = v.uo_id and b.ronda = v.ronda
                                         and q.momento_creacion = 'asignacion')) as antes_del_paso4,
         (select count(*) from val v
           where v.responsable_id is distinct from v.analista_qa_id
              or exists (select 1 from public.plan_carga_actividad c
                          where c.actividad_id = v.id and c.responsable_id is distinct from v.responsable_id)) as responsable_distinto,
         (select activa from public.plantillas_actividad where momento_creacion = 'validacion') as plantilla_activa,
         public.plan_parametro('jornadas_validacion_uo', (now() at time zone 'America/Mexico_City')::date) = 0.5 as parametro_ok,
         (select count(*) = 2 from pg_trigger
           where tgrelid = 'public.unidades_operativas'::regclass and tgenabled = 'O'
             and tgname in ('trg_analista_distinto_insert', 'trg_analista_distinto_update')) as triggers_ok,
         (select count(*) from pg_constraint
           where conname = 'unidades_operativas_analista_distinto_digitalizador_check') as check_viejo
)
select r.*,
       r.validaciones = 15 and r.con_fecha = 15 and r.filas_carga = 15 and r.antes_del_paso4 = 0
         and r.responsable_distinto = 0 and r.plantilla_activa and r.parametro_ok and r.triggers_ok
         and r.check_viejo = 0 as todo_listo
  from r;
