-- Evitar registros duplicados de dispositivos con el mismo token
ALTER TABLE authorized_devices
  ADD CONSTRAINT IF NOT EXISTS authorized_devices_device_token_key UNIQUE (device_token);

-- Tabla de logs de observabilidad
CREATE TABLE IF NOT EXISTS app_logs (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  level       text        NOT NULL CHECK (level IN ('info', 'warn', 'error')),
  category    text        NOT NULL CHECK (category IN ('auth', 'game', 'accounting', 'system')),
  event       text        NOT NULL,
  details     jsonb,
  device_token text,
  created_at  timestamptz DEFAULT now()
);

-- Índices para consultas frecuentes
CREATE INDEX IF NOT EXISTS app_logs_created_at_idx ON app_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS app_logs_level_idx       ON app_logs (level);
CREATE INDEX IF NOT EXISTS app_logs_category_idx    ON app_logs (category);

-- Row Level Security
ALTER TABLE app_logs ENABLE ROW LEVEL SECURITY;

-- Usuarios autenticados pueden insertar logs
CREATE POLICY "authenticated_insert_logs"
  ON app_logs FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Solo admins pueden leer logs
CREATE POLICY "admin_read_logs"
  ON app_logs FOR SELECT
  TO authenticated
  USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
  );
