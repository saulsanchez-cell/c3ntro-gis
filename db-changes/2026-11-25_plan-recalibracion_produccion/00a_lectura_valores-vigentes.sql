-- Que hace: muestra los rendimientos y parametros del plan vigentes hoy, con sus fechas (solo lectura).
-- Proyecto: produccion (rtwjwfpaturmbmegwtys). Tambien se puede correr en SIGOprueba.
-- Resultado esperado: una fila por valor vigente. Lo esperado segun el repo (2026-10-26):
--   rendimiento Aereo 30, Mixto 5, Subterraneo 17.5;
--   parametro jornada_minima_uo 0.5, jornadas_pasos_1_3_uo_larga 1.0, jornadas_validacion_uo 0.5.
--   Mandar todas las filas: si algun valor ya se habia cambiado, el 01 se ajusta antes de correrlo.

select 'rendimiento' as tipo,
       r.metodo_constructivo as clave,
       r.km_por_jornada as valor,
       r.vigente_desde,
       r.vigente_hasta
  from public.plan_rendimientos r
 where r.vigente_hasta is null or r.vigente_hasta >= public.plan_hoy()
union all
select 'parametro',
       p.clave,
       p.valor,
       p.vigente_desde,
       p.vigente_hasta
  from public.plan_parametros p
 where p.vigente_hasta is null or p.vigente_hasta >= public.plan_hoy()
order by 1, 2, 4;
