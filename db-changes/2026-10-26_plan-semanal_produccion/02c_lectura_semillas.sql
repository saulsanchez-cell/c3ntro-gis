-- Que hace: muestra las semillas de rendimientos, capacidad y parametros (solo lectura).
-- Proyecto: PRODUCCIÓN (rtwjwfpaturmbmegwtys).
-- Resultado esperado: 12 filas: rendimientos Aereo 30, Mixto 5, Subterraneo 17.5; capacidad 1 a 4 = 1.0, 5 = 0.75 (9-15 h), 6 y 7 = 0; jornada_minima_uo 0.5 y jornadas_pasos_1_3_uo_larga 1.0.

select 'rendimiento' as tabla, metodo_constructivo as clave, km_por_jornada as valor, null::text as etiqueta, vigente_desde, vigente_hasta
  from public.plan_rendimientos
union all
select 'capacidad', dia_semana::text, jornadas, etiqueta, vigente_desde, vigente_hasta
  from public.plan_capacidad
union all
select 'parametro', clave, valor, null, vigente_desde, vigente_hasta
  from public.plan_parametros
 order by 1, 2;
