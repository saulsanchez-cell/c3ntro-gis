-- Que hace: verifica la ronda 2 (04): cuenta cuantas de las 29 UOs ya tienen su entidad nueva (solo lectura).
-- Proyecto: PRODUCCIÓN (rtwjwfpaturmbmegwtys). Correr despues de 04.
-- Resultado esperado: 1 fila con corregidas = 29, pendientes = 0 y ok = true. Si no, mandar la fila.

select count(*) filter (where u.entidad_federativa = v.nueva)                  as corregidas,
       count(*) filter (where u.entidad_federativa is distinct from v.nueva)   as pendientes,
       string_agg(v.referencia_operativa, ', ') filter (where u.entidad_federativa is distinct from v.nueva) as cuales,
       count(*) filter (where u.entidad_federativa = v.nueva) = 29             as ok
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
  left join public.unidades_operativas u on u.referencia_operativa = v.referencia_operativa;
