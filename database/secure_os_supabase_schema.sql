-- =========================================================
-- SECURE_OS / Alert.IA — Esquema adaptado para Supabase
-- Integrado con Supabase Auth (auth.users)
-- =========================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------
-- UBICACIONES
-- ---------------------------------------------------------
CREATE TABLE ubicaciones (
    id_ubicacion SERIAL PRIMARY KEY,
    latitud DECIMAL(10,7) NOT NULL,
    longitud DECIMAL(10,7) NOT NULL,
    direccion_referencia VARCHAR(255),
    zona VARCHAR(100),
    ciudad VARCHAR(100) DEFAULT 'Cochabamba'
);

-- ---------------------------------------------------------
-- ROLES
-- ---------------------------------------------------------
CREATE TABLE roles (
    id_rol SERIAL PRIMARY KEY,
    nombre VARCHAR(30) NOT NULL UNIQUE
);

-- ---------------------------------------------------------
-- USUARIOS
-- Ahora es un perfil 1:1 con auth.users. Supabase Auth maneja
-- password, email, intentos fallidos, bloqueos, tokens, etc.
-- ---------------------------------------------------------
CREATE TABLE usuarios (
    id_usuario UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    id_rol INT NOT NULL REFERENCES roles(id_rol),
    nombre VARCHAR(100) NOT NULL,
    apellido VARCHAR(100) NOT NULL,
    telefono VARCHAR(20),
    ci_documento VARCHAR(20),
    ci_documento_cifrado BYTEA,
    fecha_registro TIMESTAMP DEFAULT now(),
    estado VARCHAR(20) DEFAULT 'activo' CHECK (estado IN ('activo','suspendido','inactivo')),
    -- Perfil extendido de la app móvil
    grupo_sanguineo VARCHAR(10),
    alergias VARCHAR(255),
    avatar_url VARCHAR(500),
    banner_url VARCHAR(500)
);

-- Trigger: al registrarse un usuario en Supabase Auth, se crea
-- automáticamente su fila en 'usuarios'. Ajusta el id_rol por
-- defecto (aquí 1 = ciudadano, cámbialo según tus datos en 'roles').
CREATE OR REPLACE FUNCTION fn_handle_new_user() RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.usuarios (id_usuario, id_rol, nombre, apellido)
    VALUES (
        NEW.id,
        1,
        COALESCE(NEW.raw_user_meta_data->>'nombre', ''),
        COALESCE(NEW.raw_user_meta_data->>'apellido', '')
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION fn_handle_new_user();

-- ---------------------------------------------------------
-- INSTITUCIONES Y PERSONAL
-- ---------------------------------------------------------
CREATE TABLE instituciones (
    id_institucion SERIAL PRIMARY KEY,
    nombre VARCHAR(150) NOT NULL,
    tipo VARCHAR(50) NOT NULL CHECK (tipo IN ('policia','bomberos','hospital','defensa_civil','otro')),
    id_ubicacion INT REFERENCES ubicaciones(id_ubicacion),
    telefono VARCHAR(20)
);

CREATE TABLE personal_institucional (
    id_personal SERIAL PRIMARY KEY,
    id_institucion INT NOT NULL REFERENCES instituciones(id_institucion),
    id_usuario UUID UNIQUE REFERENCES usuarios(id_usuario),
    nombre VARCHAR(100) NOT NULL,
    apellido VARCHAR(100) NOT NULL,
    cargo VARCHAR(80),
    telefono VARCHAR(20),
    estado VARCHAR(20) DEFAULT 'activo'
);

-- ---------------------------------------------------------
-- CATÁLOGOS
-- ---------------------------------------------------------
CREATE TABLE tipos_emergencia (
    id_tipo_emergencia SERIAL PRIMARY KEY,
    nombre VARCHAR(60) NOT NULL UNIQUE,
    descripcion VARCHAR(255)
);

CREATE TABLE niveles_gravedad (
    id_nivel_gravedad SERIAL PRIMARY KEY,
    nombre VARCHAR(30) NOT NULL UNIQUE,
    prioridad_numerica INT NOT NULL UNIQUE
);

CREATE TABLE estados_reporte (
    id_estado_reporte SERIAL PRIMARY KEY,
    nombre VARCHAR(30) NOT NULL UNIQUE
);

CREATE TABLE estados_recurso (
    id_estado_recurso SERIAL PRIMARY KEY,
    nombre VARCHAR(30) NOT NULL UNIQUE
);

CREATE TABLE estados_asignacion (
    id_estado_asignacion SERIAL PRIMARY KEY,
    nombre VARCHAR(30) NOT NULL UNIQUE
);

-- ---------------------------------------------------------
-- DATOS SEMILLA (catálogos)
-- El trigger trg_on_auth_user_created usa id_rol = 1, por lo
-- que 'ciudadano' debe existir antes del primer registro.
-- ---------------------------------------------------------
INSERT INTO roles (id_rol, nombre) VALUES
    (1, 'ciudadano'),
    (2, 'personal_institucional'),
    (3, 'administrador')
ON CONFLICT (id_rol) DO NOTHING;

INSERT INTO tipos_emergencia (nombre, descripcion) VALUES
    ('Accidente de Tránsito', 'Colisión o incidente vehicular en vía pública'),
    ('Incendio', 'Conato o incendio activo en estructura o terreno'),
    ('Emergencia Médica', 'Asistencia médica de urgencia para una persona'),
    ('Robo', 'Robo, asalto o hurto en curso'),
    ('Persona Sospechosa', 'Merodeo, acecho o conducta anómala'),
    ('Violencia', 'Conflicto físico o agresión en curso'),
    ('Vandalismo', 'Daños a propiedad o vía pública'),
    ('Otro', 'Situación imprevista de seguridad')
ON CONFLICT (nombre) DO NOTHING;

INSERT INTO niveles_gravedad (nombre, prioridad_numerica) VALUES
    ('baja', 1),
    ('media', 2),
    ('alta', 3),
    ('critica', 4)
ON CONFLICT (prioridad_numerica) DO NOTHING;

INSERT INTO estados_reporte (id_estado_reporte, nombre) VALUES
    (1, 'recibido'),
    (2, 'en_proceso'),
    (3, 'resuelto'),
    (4, 'cerrado')
ON CONFLICT (id_estado_reporte) DO NOTHING;

INSERT INTO estados_recurso (id_estado_recurso, nombre) VALUES
    (1, 'disponible'),
    (2, 'en_uso'),
    (3, 'en_mantenimiento'),
    (4, 'fuera_servicio')
ON CONFLICT (id_estado_recurso) DO NOTHING;

INSERT INTO estados_asignacion (id_estado_asignacion, nombre) VALUES
    (1, 'asignado'),
    (2, 'en_ruta'),
    (3, 'en_escena'),
    (4, 'resuelto'),
    (5, 'cancelado')
ON CONFLICT (id_estado_asignacion) DO NOTHING;

-- Re-sincroniza las secuencias SERIAL tras insertar IDs explícitos
-- (evita colisiones de PK cuando la API inserte nuevos registros)
SELECT setval('roles_id_rol_seq', GREATEST((SELECT COALESCE(MAX(id_rol),1) FROM roles), 1));
SELECT setval('tipos_emergencia_id_tipo_emergencia_seq', GREATEST((SELECT COALESCE(MAX(id_tipo_emergencia),1) FROM tipos_emergencia), 1));
SELECT setval('niveles_gravedad_id_nivel_gravedad_seq', GREATEST((SELECT COALESCE(MAX(id_nivel_gravedad),1) FROM niveles_gravedad), 1));
SELECT setval('estados_reporte_id_estado_reporte_seq', GREATEST((SELECT COALESCE(MAX(id_estado_reporte),1) FROM estados_reporte), 1));
SELECT setval('estados_recurso_id_estado_recurso_seq', GREATEST((SELECT COALESCE(MAX(id_estado_recurso),1) FROM estados_recurso), 1));
SELECT setval('estados_asignacion_id_estado_asignacion_seq', GREATEST((SELECT COALESCE(MAX(id_estado_asignacion),1) FROM estados_asignacion), 1));

-- ---------------------------------------------------------
-- REPORTES DE EMERGENCIA
-- ---------------------------------------------------------
CREATE TABLE reportes_emergencia (
    id_reporte SERIAL PRIMARY KEY,
    id_usuario UUID REFERENCES usuarios(id_usuario),
    id_ubicacion INT NOT NULL REFERENCES ubicaciones(id_ubicacion),
    id_tipo_emergencia INT REFERENCES tipos_emergencia(id_tipo_emergencia),
    id_nivel_gravedad INT REFERENCES niveles_gravedad(id_nivel_gravedad),
    id_estado_reporte INT NOT NULL REFERENCES estados_reporte(id_estado_reporte),
    descripcion TEXT,
    origen VARCHAR(20) NOT NULL CHECK (origen IN ('app_movil','sensor_iot','boton_panico','llamada')),
    fecha_hora_reporte TIMESTAMP DEFAULT now(),
    fecha_hora_resolucion TIMESTAMP,
    datos_extra JSONB
);

CREATE TABLE historial_estados_reporte (
    id_historial SERIAL PRIMARY KEY,
    id_reporte INT NOT NULL REFERENCES reportes_emergencia(id_reporte) ON DELETE CASCADE,
    id_estado_anterior INT REFERENCES estados_reporte(id_estado_reporte),
    id_estado_nuevo INT NOT NULL REFERENCES estados_reporte(id_estado_reporte),
    id_usuario_responsable UUID REFERENCES usuarios(id_usuario),
    fecha_cambio TIMESTAMP DEFAULT now(),
    observacion VARCHAR(255)
);

CREATE TABLE archivos_multimedia (
    id_archivo SERIAL PRIMARY KEY,
    id_reporte INT NOT NULL REFERENCES reportes_emergencia(id_reporte) ON DELETE CASCADE,
    tipo_archivo VARCHAR(20) NOT NULL CHECK (tipo_archivo IN ('foto','video','audio')),
    url_archivo VARCHAR(500) NOT NULL,
    fecha_subida TIMESTAMP DEFAULT now()
);

CREATE TABLE analisis_ia (
    id_analisis SERIAL PRIMARY KEY,
    id_reporte INT NOT NULL REFERENCES reportes_emergencia(id_reporte) ON DELETE CASCADE,
    modelo_usado VARCHAR(100),
    nivel_confianza DECIMAL(5,2),
    resultado_json JSONB,
    aplicado BOOLEAN DEFAULT FALSE,
    fecha_analisis TIMESTAMP DEFAULT now()
);

-- ---------------------------------------------------------
-- IOT
-- ---------------------------------------------------------
CREATE TABLE dispositivos_iot (
    id_dispositivo SERIAL PRIMARY KEY,
    tipo_dispositivo VARCHAR(40) NOT NULL CHECK (tipo_dispositivo IN
        ('esp32','sensor_pir','sensor_humo','boton_panico','camara_ip','gateway_lorawan','baliza_led','sirena')),
    identificador_mac VARCHAR(50) UNIQUE,
    id_ubicacion INT REFERENCES ubicaciones(id_ubicacion),
    estado VARCHAR(20) DEFAULT 'activo' CHECK (estado IN ('activo','inactivo','mantenimiento')),
    fecha_instalacion DATE
);

CREATE TABLE eventos_sensor (
    id_evento SERIAL PRIMARY KEY,
    id_dispositivo INT NOT NULL REFERENCES dispositivos_iot(id_dispositivo),
    tipo_evento VARCHAR(50) NOT NULL,
    valor_medido VARCHAR(50),
    id_reporte INT REFERENCES reportes_emergencia(id_reporte),
    fecha_hora TIMESTAMP DEFAULT now()
);

-- ---------------------------------------------------------
-- RECURSOS
-- ---------------------------------------------------------
CREATE TABLE recursos (
    id_recurso SERIAL PRIMARY KEY,
    id_institucion INT NOT NULL REFERENCES instituciones(id_institucion),
    id_personal_responsable INT REFERENCES personal_institucional(id_personal),
    tipo_recurso VARCHAR(30) NOT NULL CHECK (tipo_recurso IN ('patrulla','ambulancia','camion_bomberos','unidad_rescate')),
    codigo_identificacion VARCHAR(30) UNIQUE,
    id_estado_recurso INT NOT NULL REFERENCES estados_recurso(id_estado_recurso),
    id_ubicacion_actual INT REFERENCES ubicaciones(id_ubicacion)
);

CREATE TABLE historial_ubicaciones_recurso (
    id_registro SERIAL PRIMARY KEY,
    id_recurso INT NOT NULL REFERENCES recursos(id_recurso) ON DELETE CASCADE,
    id_ubicacion INT NOT NULL REFERENCES ubicaciones(id_ubicacion),
    fecha_hora TIMESTAMP DEFAULT now()
);

CREATE TABLE asignaciones_recursos (
    id_asignacion SERIAL PRIMARY KEY,
    id_reporte INT NOT NULL REFERENCES reportes_emergencia(id_reporte) ON DELETE CASCADE,
    id_recurso INT NOT NULL REFERENCES recursos(id_recurso),
    id_estado_asignacion INT NOT NULL REFERENCES estados_asignacion(id_estado_asignacion),
    fecha_asignacion TIMESTAMP DEFAULT now(),
    fecha_llegada TIMESTAMP,
    fecha_liberacion TIMESTAMP
);

-- ---------------------------------------------------------
-- SESIONES Y CONFIGURACIÓN
-- Nota: Supabase Auth ya maneja sesiones/tokens internamente.
-- Esta tabla queda solo si quieres registrar metadatos propios
-- (ej. push tokens por dispositivo). Si no la necesitas, bórrala.
-- ---------------------------------------------------------
CREATE TABLE sesiones_usuario (
    id_sesion SERIAL PRIMARY KEY,
    id_usuario UUID NOT NULL REFERENCES usuarios(id_usuario) ON DELETE CASCADE,
    token_dispositivo VARCHAR(255),
    dispositivo VARCHAR(100),
    ip_origen VARCHAR(45),
    fecha_inicio TIMESTAMP DEFAULT now(),
    fecha_cierre TIMESTAMP
);

CREATE TABLE configuracion_usuario (
    id_usuario UUID PRIMARY KEY REFERENCES usuarios(id_usuario) ON DELETE CASCADE,
    notificaciones_push BOOLEAN DEFAULT TRUE,
    notificaciones_email BOOLEAN DEFAULT TRUE,
    compartir_ubicacion_continua BOOLEAN DEFAULT FALSE,
    idioma VARCHAR(20) DEFAULT 'es',
    datos_extra JSONB
);

CREATE TABLE contactos_confianza (
    id_contacto SERIAL PRIMARY KEY,
    id_usuario UUID NOT NULL REFERENCES usuarios(id_usuario) ON DELETE CASCADE,
    nombre VARCHAR(100) NOT NULL,
    telefono VARCHAR(20) NOT NULL,
    relacion VARCHAR(50),
    notificar_en_sos BOOLEAN DEFAULT TRUE,
    id_externo VARCHAR(50),
    avatar_url VARCHAR(500)
);

-- ---------------------------------------------------------
-- LLAMADAS SOS
-- ---------------------------------------------------------
CREATE TABLE llamadas_sos (
    id_llamada SERIAL PRIMARY KEY,
    id_usuario UUID NOT NULL REFERENCES usuarios(id_usuario),
    id_reporte INT REFERENCES reportes_emergencia(id_reporte),
    fecha_inicio TIMESTAMP DEFAULT now(),
    fecha_fin TIMESTAMP,
    duracion_segundos INT,
    estado VARCHAR(20) DEFAULT 'en_curso' CHECK (estado IN ('en_curso','finalizada','transferida_operador','abandonada'))
);

CREATE TABLE preguntas_triage_llamada (
    id_pregunta SERIAL PRIMARY KEY,
    id_llamada INT NOT NULL REFERENCES llamadas_sos(id_llamada) ON DELETE CASCADE,
    orden INT NOT NULL,
    pregunta TEXT NOT NULL,
    respuesta TEXT,
    fecha_hora TIMESTAMP DEFAULT now()
);

CREATE TABLE lineas_institucion (
    id_linea SERIAL PRIMARY KEY,
    id_institucion INT REFERENCES instituciones(id_institucion),
    nombre_linea VARCHAR(100) NOT NULL,
    numero_telefono VARCHAR(20) NOT NULL,
    tipo_servicio VARCHAR(50),
    descripcion VARCHAR(255),
    activo BOOLEAN DEFAULT TRUE
);

CREATE TABLE notificaciones (
    id_notificacion SERIAL PRIMARY KEY,
    id_reporte INT NOT NULL REFERENCES reportes_emergencia(id_reporte) ON DELETE CASCADE,
    id_institucion INT REFERENCES instituciones(id_institucion),
    id_personal_destinatario INT REFERENCES personal_institucional(id_personal),
    canal VARCHAR(20) CHECK (canal IN ('push','sms','email','dashboard')),
    mensaje VARCHAR(255),
    estado_envio VARCHAR(20) DEFAULT 'enviado' CHECK (estado_envio IN ('enviado','entregado','leido','fallido')),
    fecha_envio TIMESTAMP DEFAULT now()
);

CREATE TABLE auditoria_seguridad (
    id_auditoria BIGSERIAL PRIMARY KEY,
    tabla_afectada VARCHAR(100) NOT NULL,
    operacion VARCHAR(10) NOT NULL,
    usuario_bd VARCHAR(100) NOT NULL DEFAULT current_user,
    datos_anteriores JSONB,
    datos_nuevos JSONB,
    fecha_hora TIMESTAMP DEFAULT now()
);

-- ---------------------------------------------------------
-- ÍNDICES
-- ---------------------------------------------------------
CREATE INDEX idx_reportes_estado ON reportes_emergencia(id_estado_reporte);
CREATE INDEX idx_reportes_fecha ON reportes_emergencia(fecha_hora_reporte);
CREATE INDEX idx_reportes_ubicacion ON reportes_emergencia(id_ubicacion);
CREATE INDEX idx_reportes_usuario ON reportes_emergencia(id_usuario);
CREATE INDEX idx_eventos_dispositivo ON eventos_sensor(id_dispositivo);
CREATE INDEX idx_recursos_estado ON recursos(id_estado_recurso);
CREATE INDEX idx_asignaciones_reporte ON asignaciones_recursos(id_reporte);
CREATE INDEX idx_historial_ubicacion_recurso ON historial_ubicaciones_recurso(id_recurso, fecha_hora);
CREATE INDEX idx_notificaciones_reporte ON notificaciones(id_reporte);
CREATE INDEX idx_llamadas_usuario ON llamadas_sos(id_usuario);
CREATE INDEX idx_triage_llamada ON preguntas_triage_llamada(id_llamada);
CREATE INDEX idx_lineas_institucion ON lineas_institucion(id_institucion);
CREATE INDEX idx_personal_usuario ON personal_institucional(id_usuario);

-- ---------------------------------------------------------
-- VISTAS
-- ---------------------------------------------------------
CREATE VIEW vw_indicadores_kpi
WITH (security_invoker = true) AS
SELECT
    r.id_reporte,
    r.fecha_hora_reporte,
    MIN(a.fecha_asignacion) AS primera_asignacion,
    EXTRACT(EPOCH FROM (MIN(a.fecha_asignacion) - r.fecha_hora_reporte)) AS tiempo_respuesta_seg,
    r.fecha_hora_resolucion,
    EXTRACT(EPOCH FROM (r.fecha_hora_resolucion - r.fecha_hora_reporte)) AS tiempo_resolucion_seg
FROM reportes_emergencia r
LEFT JOIN asignaciones_recursos a ON a.id_reporte = r.id_reporte
GROUP BY r.id_reporte, r.fecha_hora_reporte, r.fecha_hora_resolucion;

CREATE VIEW vw_reportes_publicos
WITH (security_invoker = true) AS
SELECT
    r.id_reporte,
    t.nombre AS tipo_emergencia,
    n.nombre AS nivel_gravedad,
    e.nombre AS estado,
    u.zona,
    u.ciudad,
    r.fecha_hora_reporte
FROM reportes_emergencia r
JOIN tipos_emergencia t ON t.id_tipo_emergencia = r.id_tipo_emergencia
JOIN niveles_gravedad n ON n.id_nivel_gravedad = r.id_nivel_gravedad
JOIN estados_reporte e ON e.id_estado_reporte = r.id_estado_reporte
JOIN ubicaciones u ON u.id_ubicacion = r.id_ubicacion;

-- ---------------------------------------------------------
-- FUNCIÓN AUXILIAR: institución del usuario autenticado
-- (reemplaza el antiguo current_setting('app.institucion_actual'))
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_institucion_actual() RETURNS INT AS $$
    SELECT id_institucion FROM personal_institucional
    WHERE id_usuario = auth.uid()
    LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- ---------------------------------------------------------
-- ROW LEVEL SECURITY
-- Adaptado para usar auth.uid() en vez de current_setting().
-- Regla general: sin política, sin acceso. Solo los catálogos y
-- datos no sensibles son legibles por el rol autenticado; nada
-- del esquema es escribible por anon/authenticated salvo lo
-- estrictamente necesario (reportes propios, config, contactos,
-- ubicaciones, llamadas propias, sesiones del propio usuario).
-- ---------------------------------------------------------

-- Helper de visibilidad: un reporte es visible si es del usuario o
-- pertenece a una institución asignada (mismo criterio que las
-- policies de reportes_emergencia), reutilizado por las tablas hijas.
CREATE OR REPLACE FUNCTION fn_reporte_visible(p_id_reporte INT) RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1
        FROM reportes_emergencia r
        WHERE r.id_reporte = p_id_reporte
          AND (
              r.id_usuario = auth.uid()
              OR r.id_reporte IN (
                  SELECT ar.id_reporte
                  FROM asignaciones_recursos ar
                  JOIN recursos res ON res.id_recurso = ar.id_recurso
                  WHERE res.id_institucion = fn_institucion_actual()
              )
          )
    );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- Catálogos y datos públicos: solo lectura (sin escritura vía API)
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE tipos_emergencia ENABLE ROW LEVEL SECURITY;
ALTER TABLE niveles_gravedad ENABLE ROW LEVEL SECURITY;
ALTER TABLE estados_reporte ENABLE ROW LEVEL SECURITY;
ALTER TABLE estados_recurso ENABLE ROW LEVEL SECURITY;
ALTER TABLE estados_asignacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE instituciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE lineas_institucion ENABLE ROW LEVEL SECURITY;

CREATE POLICY catalogo_leer ON roles FOR SELECT USING (true);
CREATE POLICY catalogo_leer ON tipos_emergencia FOR SELECT USING (true);
CREATE POLICY catalogo_leer ON niveles_gravedad FOR SELECT USING (true);
CREATE POLICY catalogo_leer ON estados_reporte FOR SELECT USING (true);
CREATE POLICY catalogo_leer ON estados_recurso FOR SELECT USING (true);
CREATE POLICY catalogo_leer ON estados_asignacion FOR SELECT USING (true);
CREATE POLICY instituciones_leer ON instituciones FOR SELECT USING (true);
CREATE POLICY lineas_leer ON lineas_institucion FOR SELECT USING (true);

-- Ubicaciones: lectura general, inserción permitida para crear reportes
ALTER TABLE ubicaciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY ubicaciones_leer ON ubicaciones FOR SELECT USING (true);
CREATE POLICY ubicaciones_insertar ON ubicaciones FOR INSERT WITH CHECK (true);

-- Perfil de usuario: cada quien solo sobre su fila
ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY usuarios_ver_propio ON usuarios
    FOR SELECT
    USING (id_usuario = auth.uid());
CREATE POLICY usuarios_actualizar_propio ON usuarios
    FOR UPDATE
    USING (id_usuario = auth.uid())
    WITH CHECK (id_usuario = auth.uid());

-- Personal institucional: cada institución ve solo a su personal
ALTER TABLE personal_institucional ENABLE ROW LEVEL SECURITY;
CREATE POLICY personal_por_institucion ON personal_institucional
    FOR SELECT
    USING (id_institucion = fn_institucion_actual());

-- Recursos y su ubicación/rastreo: por institución
ALTER TABLE recursos ENABLE ROW LEVEL SECURITY;
CREATE POLICY recursos_por_institucion ON recursos
    FOR SELECT
    USING (id_institucion = fn_institucion_actual());
CREATE POLICY recursos_actualizar_institucion ON recursos
    FOR UPDATE
    USING (id_institucion = fn_institucion_actual());

ALTER TABLE historial_ubicaciones_recurso ENABLE ROW LEVEL SECURITY;
CREATE POLICY rastreo_por_institucion ON historial_ubicaciones_recurso
    FOR SELECT
    USING (
        id_recurso IN (
            SELECT id_recurso FROM recursos
            WHERE id_institucion = fn_institucion_actual()
        )
    );

-- Reportes: el ciudadano gestiona los suyos; la institución asignada
-- puede leer y transicionar el estado de los que le corresponden
ALTER TABLE reportes_emergencia ENABLE ROW LEVEL SECURITY;
CREATE POLICY reportes_propio_usuario ON reportes_emergencia
    FOR SELECT
    USING (id_usuario = auth.uid());
CREATE POLICY reportes_insertar_propio ON reportes_emergencia
    FOR INSERT
    WITH CHECK (id_usuario = auth.uid());
CREATE POLICY reportes_actualizar_propio ON reportes_emergencia
    FOR UPDATE
    USING (id_usuario = auth.uid())
    WITH CHECK (id_usuario = auth.uid());
CREATE POLICY reportes_eliminar_propio ON reportes_emergencia
    FOR DELETE
    USING (id_usuario = auth.uid());
CREATE POLICY reportes_por_institucion ON reportes_emergencia
    FOR SELECT
    USING (
        id_reporte IN (
            SELECT ar.id_reporte FROM asignaciones_recursos ar
            JOIN recursos r ON r.id_recurso = ar.id_recurso
            WHERE r.id_institucion = fn_institucion_actual()
        )
    );
CREATE POLICY reportes_estado_por_institucion ON reportes_emergencia
    FOR UPDATE
    USING (
        id_reporte IN (
            SELECT ar.id_reporte FROM asignaciones_recursos ar
            JOIN recursos r ON r.id_recurso = ar.id_recurso
            WHERE r.id_institucion = fn_institucion_actual()
        )
    );

-- Hijas del reporte: archivos, análisis IA e historial de estados
-- siguen la visibilidad del reporte padre
ALTER TABLE archivos_multimedia ENABLE ROW LEVEL SECURITY;
CREATE POLICY multimedia_por_reporte ON archivos_multimedia
    FOR SELECT
    USING (fn_reporte_visible(id_reporte));
CREATE POLICY multimedia_insertar_propio ON archivos_multimedia
    FOR INSERT
    WITH CHECK (fn_reporte_visible(id_reporte));

ALTER TABLE analisis_ia ENABLE ROW LEVEL SECURITY;
CREATE POLICY analisis_por_reporte ON analisis_ia
    FOR SELECT
    USING (fn_reporte_visible(id_reporte));

ALTER TABLE historial_estados_reporte ENABLE ROW LEVEL SECURITY;
CREATE POLICY historial_por_reporte ON historial_estados_reporte
    FOR SELECT
    USING (fn_reporte_visible(id_reporte));
CREATE POLICY historial_estado_por_institucion ON historial_estados_reporte
    FOR INSERT
    WITH CHECK (fn_reporte_visible(id_reporte));

-- Asignaciones de recursos: institución asignada gestiona; el
-- ciudadano ve las de sus reportes
ALTER TABLE asignaciones_recursos ENABLE ROW LEVEL SECURITY;
CREATE POLICY asignaciones_por_institucion ON asignaciones_recursos
    FOR SELECT
    USING (
        id_recurso IN (
            SELECT id_recurso FROM recursos
            WHERE id_institucion = fn_institucion_actual()
        )
    );
CREATE POLICY asignaciones_gestion_institucion ON asignaciones_recursos
    FOR INSERT
    WITH CHECK (id_recurso IN (SELECT id_recurso FROM recursos WHERE id_institucion = fn_institucion_actual()));
CREATE POLICY asignaciones_ver_reporte ON asignaciones_recursos
    FOR SELECT
    USING (fn_reporte_visible(id_reporte));

-- Notificaciones: la institución destinataria las lee
ALTER TABLE notificaciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY notificaciones_por_institucion ON notificaciones
    FOR SELECT
    USING (id_institucion = fn_institucion_actual());

-- Contactos de confianza y configuración: auto-servicio
ALTER TABLE contactos_confianza ENABLE ROW LEVEL SECURITY;
CREATE POLICY contactos_propio_usuario ON contactos_confianza
    FOR ALL
    USING (id_usuario = auth.uid())
    WITH CHECK (id_usuario = auth.uid());
ALTER TABLE configuracion_usuario ENABLE ROW LEVEL SECURITY;
CREATE POLICY configuracion_propio_usuario ON configuracion_usuario
    FOR ALL
    USING (id_usuario = auth.uid())
    WITH CHECK (id_usuario = auth.uid());

-- Sesiones del usuario: solo el titular (push tokens por dispositivo)
ALTER TABLE sesiones_usuario ENABLE ROW LEVEL SECURITY;
CREATE POLICY sesiones_propias ON sesiones_usuario
    FOR ALL
    USING (id_usuario = auth.uid())
    WITH CHECK (id_usuario = auth.uid());

-- Llamadas SOS y triage: el usuario gestiona las propias; las
-- instituciones operadoras pueden leerlas
ALTER TABLE llamadas_sos ENABLE ROW LEVEL SECURITY;
CREATE POLICY llamadas_propias ON llamadas_sos
    FOR ALL
    USING (id_usuario = auth.uid())
    WITH CHECK (id_usuario = auth.uid());
CREATE POLICY llamadas_ver_institucion ON llamadas_sos
    FOR SELECT
    USING (fn_institucion_actual() IS NOT NULL);
ALTER TABLE preguntas_triage_llamada ENABLE ROW LEVEL SECURITY;
CREATE POLICY triage_propio_usuario ON preguntas_triage_llamada
    FOR ALL
    USING (id_llamada IN (SELECT id_llamada FROM llamadas_sos WHERE id_usuario = auth.uid()))
    WITH CHECK (id_llamada IN (SELECT id_llamada FROM llamadas_sos WHERE id_usuario = auth.uid()));

-- IoT: lectura para telemetría, escritura solo por servicio (ESP32/back)
ALTER TABLE dispositivos_iot ENABLE ROW LEVEL SECURITY;
CREATE POLICY iot_leer ON dispositivos_iot FOR SELECT USING (true);
ALTER TABLE eventos_sensor ENABLE ROW LEVEL SECURITY;
CREATE POLICY eventos_leer ON eventos_sensor
    FOR SELECT
    USING (id_reporte IS NULL OR fn_reporte_visible(id_reporte));

-- Auditoría: SIN políticas -> ni anon ni authenticated pueden leer/escribir;
-- los triggers (SECURITY DEFINER, owner) siguen insertando correctamente
ALTER TABLE auditoria_seguridad ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------
-- AUDITORÍA
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_auditoria_generica() RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        INSERT INTO auditoria_seguridad (tabla_afectada, operacion, datos_anteriores)
        VALUES (TG_TABLE_NAME, TG_OP, to_jsonb(OLD));
        RETURN OLD;
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO auditoria_seguridad (tabla_afectada, operacion, datos_anteriores, datos_nuevos)
        VALUES (TG_TABLE_NAME, TG_OP, to_jsonb(OLD), to_jsonb(NEW));
        RETURN NEW;
    ELSE
        INSERT INTO auditoria_seguridad (tabla_afectada, operacion, datos_nuevos)
        VALUES (TG_TABLE_NAME, TG_OP, to_jsonb(NEW));
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_audit_reportes
    AFTER INSERT OR UPDATE OR DELETE ON reportes_emergencia
    FOR EACH ROW EXECUTE FUNCTION fn_auditoria_generica();

CREATE TRIGGER trg_audit_usuarios
    AFTER UPDATE OR DELETE ON usuarios
    FOR EACH ROW EXECUTE FUNCTION fn_auditoria_generica();

CREATE TRIGGER trg_audit_asignaciones
    AFTER INSERT OR UPDATE OR DELETE ON asignaciones_recursos
    FOR EACH ROW EXECUTE FUNCTION fn_auditoria_generica();

CREATE TRIGGER trg_audit_recursos
    AFTER UPDATE ON recursos
    FOR EACH ROW EXECUTE FUNCTION fn_auditoria_generica();

-- ---------------------------------------------------------
-- MANTENIMIENTO
-- En Supabase, esto se programa desde "Database > Cron Jobs"
-- (extensión pg_cron) llamando a select fn_purgar_historial_ubicaciones();
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_purgar_historial_ubicaciones() RETURNS void AS $$
BEGIN
    DELETE FROM historial_ubicaciones_recurso
    WHERE fecha_hora < now() - interval '90 days';
END;
$$ LANGUAGE plpgsql;
