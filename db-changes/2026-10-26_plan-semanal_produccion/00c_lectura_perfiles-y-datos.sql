-- Que hace: lista analistas_gis activos, comprueba que no hay perfiles "Seed%" ni UOs SEED-/PRUEBA- y que los 3 integrantes existen una vez cada uno (solo lectura).
-- Proyecto: PRODUCCIÓN (rtwjwfpaturmbmegwtys).
-- Resultado esperado: 1 fila; analistas_gis con nombres; perfiles_seed = 0; uos_seed_prueba = 0; integrantes_encontrados = 3 (si no, el 03 abortara).

select (select string_agg(p.nombre, ', ' order by p.nombre)
          from public.profiles p
         where p.rol = 'analista_gis' and p.activo is true)                    as analistas_gis,
       (select count(*) from public.profiles p where p.nombre ilike 'Seed%')   as perfiles_seed,
       (select count(*) from public.unidades_operativas u
         where u.referencia_operativa like 'SEED-%'
            or u.referencia_operativa like 'PRUEBA-%')                         as uos_seed_prueba,
       (select count(*) from (values ('Ademir Marquez'), ('Miguel Angel Sanchez'), ('Uziel Alarcon')) as n(nombre)
         where (select count(*) from public.profiles p
                 where p.nombre = n.nombre and p.activo is true) = 1)          as integrantes_encontrados;
