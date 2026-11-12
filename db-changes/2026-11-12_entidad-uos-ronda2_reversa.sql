-- Reversa de 2026-11-12_entidad-uos_produccion/04: devuelve entidad_federativa a su valor anterior en las 29 UOs (escritura).
-- Proyecto: PRODUCCIÓN (rtwjwfpaturmbmegwtys).
-- Resultado esperado: "Success. No rows returned" y un aviso "Revertidas: 29".
-- Solo cambia la UO si su entidad actual es la esperada. Si no son exactamente 29, falla y no guarda nada.
-- Estado: PROPUESTO, NO APLICADO (no lleva fecha hasta que se aplique).

begin;

do $$
declare
  v_filas integer;
begin
  update public.unidades_operativas u
     set entidad_federativa = v.anterior
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
     and u.entidad_federativa = v.nueva;

  get diagnostics v_filas = row_count;

  if v_filas <> 29 then
    raise exception 'Se esperaban 29 UOs y se cambiarian %. No se guardo nada.', v_filas;
  end if;

  raise notice 'Revertidas: %', v_filas;
end
$$;

commit;
