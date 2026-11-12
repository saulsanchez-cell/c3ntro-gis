-- Ronda 2, parte B. Que hace: corrige entidad_federativa en las 29 UOs de 03 (escritura).
-- Proyecto: PRODUCCIÓN (rtwjwfpaturmbmegwtys).
-- Correr solo si 03 dio 29 filas con listo = true. Ningun trigger reacciona a esta columna (revisado en SIGOprueba el 2026-11-12).
-- Reversa: db-changes/2026-11-12_entidad-uos-ronda2_reversa.sql.
-- Resultado esperado: "Success. No rows returned" y un aviso "Corregidas: 29".
-- Solo cambia la UO si su entidad actual es la esperada. Si no son exactamente 29, falla y no guarda nada.
-- Estado: APLICADO EN PRODUCCIÓN el 2026-11-12.

begin;

do $$
declare
  v_filas integer;
begin
  update public.unidades_operativas u
     set entidad_federativa = v.nueva
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
   where u.referencia_operativa = v.referencia_operativa
     and u.entidad_federativa = v.anterior;

  get diagnostics v_filas = row_count;

  if v_filas <> 29 then
    raise exception 'Se esperaban 29 UOs y se cambiarian %. No se guardo nada.', v_filas;
  end if;

  raise notice 'Corregidas: %', v_filas;
end
$$;

commit;
