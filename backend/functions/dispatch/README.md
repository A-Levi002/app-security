# dispatch

Asigna recursos disponibles (patrullas/ambulancias) a un reporte y notifica a la
institución. Transmite los cambios de estado por Realtime para que la app
actualice el timeline en vivo.

**Invocación**: `POST /functions/v1/dispatch`

**Input**:
```json
{
  "reporteId": 123,
  "tipoRecurso": "patrulla"
}
```

**Output**: los `recursos` asignados; side-effects en
`asignaciones_recursos`, `notificaciones` (canal push/dashboard).

**Tablas**: `asignaciones_recursos`, `recursos`, `notificaciones`.

**Notas**:
- Debe respetar las políticas RLS (`fn_institucion_actual()`) — se invoca como
  usuario institucional.
- Los avances (asignado → en_ruta → en_escena) llegan a la app por Realtime:
  `reportes_emergencia.datos_extra.dispatchStep` o `asignaciones_recursos`.

**Contrato con la app**: reemplaza el timeline fijo en `HomeScreen.tsx` y
`AIEmergencyChatModal.tsx` (`dispatchStep`).