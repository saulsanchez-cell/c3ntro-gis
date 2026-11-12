-- Reversa de 2026-11-12_entidad-uos_produccion/01: devuelve entidad_federativa a su valor anterior en las 24 UOs (escritura).
-- Proyecto: PRODUCCIÓN (rtwjwfpaturmbmegwtys).
-- Resultado esperado: "Success. No rows returned" y un aviso "Revertidas: 24".
-- Solo cambia la UO si su entidad actual es la que dejo 01. Si no son exactamente 24, falla y no guarda nada.
-- Estado: PROPUESTO, NO APLICADO (no lleva fecha hasta que se aplique).

begin;

do $$
declare
  v_revertidas integer;
begin
  update public.unidades_operativas u
     set entidad_federativa = v.anterior
    from (values
            ('314', 'CDMX',       'Michoacán'),
            ('315', 'CDMX',       'Michoacán'),
            ('316', 'CDMX',       'Michoacán'),
            ('317', 'CDMX',       'Michoacán'),
            ('318', 'CDMX',       'Michoacán'),
            ('365', 'CDMX',       'Michoacán'),
            ('488', 'CDMX',       'Michoacán'),
            ('555', 'Querétaro',  'Michoacán'),
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
   where u.referencia_operativa = v.referencia_operativa
     and u.entidad_federativa = v.nueva;

  get diagnostics v_revertidas = row_count;

  if v_revertidas <> 24 then
    raise exception 'Se esperaban 24 UOs y se revertirian %. No se guardo nada.', v_revertidas;
  end if;

  raise notice 'Revertidas: %', v_revertidas;
end
$$;

commit;
