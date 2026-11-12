-- Parte B. Que hace: corrige entidad_federativa en las 24 UOs de 00 (escritura).
-- Proyecto: PRODUCCIÓN (rtwjwfpaturmbmegwtys). Correr solo si 00 dio 24 filas con listo = true.
-- Resultado esperado: "Success. No rows returned" y un aviso "Corregidas: 24".
-- Solo cambia la UO si su entidad actual es la esperada. Si no son exactamente 24, falla y no guarda nada.
-- No toca km, estado ni asignacion: ningun trigger de unidades_operativas reacciona a esta columna
-- (revisado en SIGOprueba el 2026-11-12). Reversa: db-changes/2026-11-12_entidad-uos_reversa.sql.
-- Estado: APLICADO EN PRODUCCIÓN el 2026-11-12 (confirmado con el listado completo de UOs de ese dia).

begin;

do $$
declare
  v_corregidas integer;
begin
  update public.unidades_operativas u
     set entidad_federativa = v.nueva
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
     and u.entidad_federativa = v.anterior;

  get diagnostics v_corregidas = row_count;

  if v_corregidas <> 24 then
    raise exception 'Se esperaban 24 UOs y se corregirian %. No se guardo nada: correr 00 y mandar el resultado.', v_corregidas;
  end if;

  raise notice 'Corregidas: %', v_corregidas;
end
$$;

commit;
