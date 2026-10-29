-- Que hace: lista plan_integrantes en orden, con nombre y rol (solo lectura).
-- Proyecto: PRODUCCIÓN (rtwjwfpaturmbmegwtys).
-- Resultado esperado: 3 filas: 1 Ademir Marquez, 2 Miguel Angel Sanchez, 3 Uziel Alarcon, todas activas.

select i.orden, p.nombre, p.rol, i.activo, i.created_at
  from public.plan_integrantes i
  join public.profiles p on p.id = i.profile_id
 order by i.orden, p.nombre;
