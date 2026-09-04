# iot-ingest

Punto de entrada para sensores/dispositivos IoT (ESP32, PIR, humo, botón
pánico). Ingiere eventos y los cruza con reportes abiertos.

**Invocación**: `POST /functions/v1/iot-ingest` (con clave de dispositivo) o
consumo desde broker MQTT.

**Input**:
```json
{
  "dispositivoId": 7,
  "tipoEvento": "movimiento_detectado",
  "valor": "activado"
}
```

**Tablas**: `dispositivos_iot`, `eventos_sensor`, `reportes_emergencia`.

**Seguridad**: la clave del dispositivo NO es RLS de usuario anon; debe validarse
fuera del cliente (secreto compartido por dispositivo).

**Contrato con la app**: no hay UI activa todavía; el frontend lo consumirá
vía Realtime cuando el esquema IoT esté en producción.