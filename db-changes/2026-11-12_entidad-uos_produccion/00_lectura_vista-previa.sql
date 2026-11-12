-- Parte A. Que hace: muestra las 24 UOs a las que se les corrige entidad_federativa, con su valor actual y el nuevo (solo lectura).
-- Proyecto: PRODUCCIÓN (rtwjwfpaturmbmegwtys).
-- Resultado esperado: 24 filas, todas con listo = true (la UO existe y su entidad actual es la que se espera).
-- Si alguna fila sale con listo = false, NO correr 01: mandar esa fila.
--
-- Origen: revision de Michoacan del 2026-11-12. La 314 (Morelia) se valido y sus km se sumaron a CDMX.
-- Decisiones de Saul: 61 y 66 se quedan en Michoacan (sin informacion exacta); 68 se queda en Michoacan;
-- 1285.9 (Sonora) y 1359 (CDMX) estan bien. El resto, como esta en la lista.

select v.referencia_operativa,
       u.nombre,
       u.entidad_federativa                        as entidad_actual,
       v.anterior                                  as entidad_esperada,
       v.nueva                                     as entidad_nueva,
       u.estado,
       u.km_teoricos,
       (u.id is not null
        and u.entidad_federativa is not distinct from v.anterior) as listo
  from (values
          -- De Michoacan, mal capturadas en otra entidad
          ('314', 'CDMX',       'Michoacán'),
          ('315', 'CDMX',       'Michoacán'),
          ('316', 'CDMX',       'Michoacán'),
          ('317', 'CDMX',       'Michoacán'),
          ('318', 'CDMX',       'Michoacán'),
          ('365', 'CDMX',       'Michoacán'),
          ('488', 'CDMX',       'Michoacán'),
          ('555', 'Querétaro',  'Michoacán'),
          -- De otros estados, mal capturadas en Michoacan
          ('62',  'Michoacán',  'Quintana Roo'),
          ('63',  'Michoacán',  'Quintana Roo'),
          ('71',  'Michoacán',  'Quintana Roo'),
          ('74',  'Michoacán',  'Quintana Roo'),
          ('82',  'Michoacán',  'Nuevo León'),
          ('94',  'Michoacán',  'Nuevo León'),
          ('83',  'Michoacán',  'CDMX'),
          ('85',  'Michoacán',  'CDMX'),
          ('86',  'Michoacán',  'CDMX'),
          ('87',  'Michoacán',  'CDMX'),
          ('89',  'Michoacán',  'CDMX'),
          ('90',  'Michoacán',  'CDMX'),
          ('92',  'Michoacán',  'CDMX'),
          ('88',  'Michoacán',  'Estado de México'),
          ('91',  'Michoacán',  'Estado de México'),
          ('93',  'Michoacán',  'Estado de México')
       ) as v(referencia_operativa, anterior, nueva)
  left join public.unidades_operativas u on u.referencia_operativa = v.referencia_operativa
 order by v.nueva, v.referencia_operativa;
