# sos

Crea una llamada SOS, notifica a la red de confianza del usuario y (si aplica)
despacha la unidad más cercana.

**Invocación**: `POST /functions/v1/sos`

**Input**:
```json
{
  "latitud": -17.3895,
  "longitud": -66.1568,
  "tipo": "manual" | "fall_detection" | "silent_alarm"
}
```

**Tablas**: `llamadas_sos`, `contactos_confianza`, `notificaciones`,
`reportes_emergencia` (si genera uno).

**Notas**:
- En modo `silent_alarm` no debe emitir sonido en el cliente (depende del
  flag `silentAlarmMode` de `configuracion_usuario`).
- Se combina con `notify` para avisar a contactos.

**Contrato con la app**: reemplaza `TacticalCallModal.tsx` (UI) y la lógica de
inicio de llamada de `HomeScreen.tsx`.