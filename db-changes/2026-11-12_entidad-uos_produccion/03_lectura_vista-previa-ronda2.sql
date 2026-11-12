-- Ronda 2, parte A. Que hace: muestra las 29 UOs de otras entidades a las que se les corrige entidad_federativa, con su valor actual y el nuevo (solo lectura).
-- Proyecto: PRODUCCIÓN (rtwjwfpaturmbmegwtys).
-- Resultado esperado: 29 filas, todas con listo = true. Si alguna sale con listo = false, NO correr 04: mandar esa fila.
--
-- Origen: revision del listado completo de UOs del 2026-11-12 (solo las que tienen km).
-- Decisiones de Saul: 586 a Estado de Mexico; 1005 a Queretaro (la mayor parte esta ahi); 624 se queda (sin informacion);
-- 177, 188, 13 y 120 cruzan entidades y se quedan como estan.

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
          ('49',      'CDMX',        'Querétaro'),
          ('170',     'CDMX',        'Querétaro'),
          ('270',     'CDMX',        'Querétaro'),
          ('400',     'CDMX',        'Querétaro'),
          ('658',     'CDMX',        'Querétaro'),
          ('902',     'CDMX',        'Querétaro'),
          ('1385',    'CDMX',        'Querétaro'),
          ('1005',    'Nuevo León',  'Querétaro'),
          ('101',     'CDMX',        'Jalisco'),
          ('128',     'CDMX',        'Nuevo León'),
          ('184',     'CDMX',        'Nuevo León'),
          ('724',     'CDMX',        'Nuevo León'),
          ('304',     'CDMX',        'Puebla'),
          ('372',     'CDMX',        'Puebla'),
          ('647',     'Querétaro',   'Puebla'),
          ('575',     'Querétaro',   'CDMX'),
          ('1206',    'Querétaro',   'CDMX'),
          ('1212',    'Querétaro',   'CDMX'),
          ('1442',    'Querétaro',   'CDMX'),
          ('9',       'Nuevo León',  'CDMX'),
          ('586',     'Querétaro',   'Estado de México'),
          ('603',     'Querétaro',   'Estado de México'),
          ('1201',    'Querétaro',   'Estado de México'),
          ('1210',    'Querétaro',   'Estado de México'),
          ('536',     'Querétaro',   'Chihuahua'),
          ('1198.1',  'Sinaloa',     'Sonora'),
          ('1198.6',  'Sinaloa',     'Sonora'),
          ('1198.7',  'Sinaloa',     'Sonora'),
          ('1198.9',  'Sinaloa',     'Sonora')
       ) as v(referencia_operativa, anterior, nueva)
  left join public.unidades_operativas u on u.referencia_operativa = v.referencia_operativa
 order by v.nueva, v.referencia_operativa;
