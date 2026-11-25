-- Que hace: reversa de 2026-11-23_transiciones-desde-pendiente: quita Pendiente -> Bloqueada y Pendiente -> Cerrada; escribe y hace commit.
-- Proyecto: el que se este revirtiendo (SIGOprueba o produccion).
-- No hay frontend que revertir antes: el cambio es solo de datos.
-- Resultado esperado: sin filas y sin error.
-- Las UOs que ya se bloquearon o cerraron desde Pendiente se quedan como estan.
--   Las bloqueadas siguen saliendo con Bloqueada -> Pendiente (no se toca).
-- Estado: PROPUESTO, NO APLICADO

begin;

delete from public.transiciones_permitidas
 where estado_origen::text = 'Pendiente'
   and estado_destino::text in ('Bloqueada', 'Cerrada');

commit;
