-- Que hace: verifica que la 1285 ya no existe y que 1285.1 y 1285.2 siguen igual (solo lectura).
-- Proyecto: PRODUCCIÓN (rtwjwfpaturmbmegwtys). Correr despues de 01.
-- Resultado esperado: 1 fila con existe_1285 = 0, hijas = 2 y ok = true.

select count(*) filter (where referencia_operativa = '1285')                     as existe_1285,
       count(*) filter (where referencia_operativa in ('1285.1', '1285.2'))       as hijas,
       (count(*) filter (where referencia_operativa = '1285') = 0
        and count(*) filter (where referencia_operativa in ('1285.1', '1285.2')) = 2) as ok
  from public.unidades_operativas
 where referencia_operativa in ('1285', '1285.1', '1285.2');
