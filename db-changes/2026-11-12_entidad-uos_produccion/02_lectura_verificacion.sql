-- Que hace: verifica la correccion de 01 con los totales de Michoacan, como los calcula Reporte KM (solo lectura).
-- Proyecto: PRODUCCIÓN (rtwjwfpaturmbmegwtys). Correr despues de 01.
-- Resultado esperado: 1 fila con uos = 15, km_total = 439.54, km_valid = 24.68 (la 314) y ok = true.
-- Antes de 01 daba 23 UOs, 317.97 km y 0 validados.
-- Comparar km_total con el total de Michoacan en Vetro; la diferencia que quede puede ser de UOs historicas o fuera de SIGO.

select count(*)                                                                              as uos,
       round(sum(km_teoricos)::numeric, 2)                                                   as km_total,
       round(coalesce(sum(km_teoricos) filter (where estado in ('Validada', 'Cerrada')), 0)::numeric, 2) as km_valid,
       (count(*) = 15
        and round(sum(km_teoricos)::numeric, 2) = 439.54
        and round(coalesce(sum(km_teoricos) filter (where estado in ('Validada', 'Cerrada')), 0)::numeric, 2) = 24.68) as ok
  from public.unidades_operativas
 where es_historico = false
   and entidad_federativa = 'Michoacán';
