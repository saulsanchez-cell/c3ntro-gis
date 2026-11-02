-- Que hace: despues del 01, cuenta la plantilla y las actividades por nombre del paso 4 (solo lectura).
-- Proyecto: SIGOprueba (iadojhaibxpnirzijivf).
-- Resultado esperado: 1 fila con plantillas_viejo = 0, actividades_viejo = 0, plantillas_nuevo = 1, actividades_nuevo igual a actividades_viejo del 00, y ok = true.
-- Corrido en SIGOprueba el 2026-11-02: resultado esperado (actividades_nuevo = 14)

select (select count(*) from public.plantillas_actividad where nombre = 'Revisión y pulido en Vetro')       as plantillas_viejo,
       (select count(*) from public.actividades_uo       where nombre = 'Revisión y pulido en Vetro')       as actividades_viejo,
       (select count(*) from public.plantillas_actividad where nombre = 'Ajustes y autorrevisión en Vetro') as plantillas_nuevo,
       (select count(*) from public.actividades_uo       where nombre = 'Ajustes y autorrevisión en Vetro') as actividades_nuevo,
       not exists (select 1 from public.plantillas_actividad where nombre = 'Revisión y pulido en Vetro')
       and not exists (select 1 from public.actividades_uo where nombre = 'Revisión y pulido en Vetro')
       and (select count(*) from public.plantillas_actividad where nombre = 'Ajustes y autorrevisión en Vetro') = 1
                                                                                                        as ok;
