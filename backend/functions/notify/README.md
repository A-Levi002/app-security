# notify

Envía notificaciones push (FCM / Expo) a contactos de confianza e instituciones.

**Invocación**: `POST /functions/v1/notify`

**Input**:
```json
{
  "destinatarios": ["userId:...", "personalId:..."],
  "titulo": "ALERTA SOS",
  "cuerpo": "El usuario X activó una alerta",
  "canal": "push" | "sms" | "email"
}
```

**Tablas**: consulta `contactos_confianza`, `sesiones_usuario` (tokens),
`notificaciones` (registro de envío).

**Notas**:
- Los dispositivos registran su `token_dispositivo` en `sesiones_usuario`.
- Usar las credenciales de envío como Secret (`FCM_SERVER_KEY` /
  `EXPO_ACCESS_TOKEN`).

**Contrato con la app**: hoy `PermissionsModal.tsx` solo pide el permiso nativo;
la suscripción/registro del token y el envío real los hace este endpoint.