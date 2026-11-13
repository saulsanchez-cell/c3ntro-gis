-- Que hace: verifica que 2025-SON-FED-028.1 ya no existe y que 2025-SON-FED-028 sigue (solo lectura).
-- Proyecto: PRODUCCIÓN (rtwjwfpaturmbmegwtys). Correr despues de 01.
-- Resultado esperado: 1 fila con existe_repetida = 0, existe_original = 1 y ok = true.

select count(*) filter (where referencia_operativa = '2025-SON-FED-028.1')   as existe_repetida,
       count(*) filter (where referencia_operativa = '2025-SON-FED-028')     as existe_original,
       (count(*) filter (where referencia_operativa = '2025-SON-FED-028.1') = 0
        and count(*) filter (where referencia_operativa = '2025-SON-FED-028') = 1) as ok
  from public.unidades_operativas
 where referencia_operativa in ('2025-SON-FED-028.1', '2025-SON-FED-028');
