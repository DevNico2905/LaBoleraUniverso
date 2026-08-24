# 002 — Detalles del evento `day_opened` en `app_logs`

**Fecha:** 2026-08-24
**Rama de trabajo:** `Antigravity`
**Estado:** ✅ Desarrollado, testeado y auditado — pendiente de commit y prueba manual en producción
**Solicitado por:** Nicolás (interno)

---

## 1. Contexto y motivación

El evento `day_opened` de la categoría `accounting` en `app_logs` se registra sin `details` (`details: null`). Al revisar los logs desde el dashboard de Supabase se puede saber qué operador abrió una caja (via `device_token` en columna dedicada) pero es un UUID poco legible, y la hora `created_at` está en UTC — hay que convertir mentalmente a UTC-5 para saber la hora real de apertura en Colombia.

Objetivo: enriquecer `details` con dos campos que faciliten la auditoría visual desde el dashboard.

---

## 2. Lógica de negocio ACTUAL

### 2.1 Cómo se emite el log hoy

`accounting.service.ts:117-123`:

```typescript
openDay() {
    this.isDayOpen = true;
    localStorage.setItem(this.DAY_OPEN_KEY, 'true');
    this.logging.info('accounting', 'day_opened');
    // Optional: Archive old sessions...
}
```

Se llama a `logging.info()` sin `details`.

### 2.2 Qué guarda `LoggingService` por defecto

`logging.service.ts:15-28` — cada log inserta:

| Campo | Valor | Notas |
|---|---|---|
| `level` | `'info'` | |
| `category` | `'accounting'` | |
| `event` | `'day_opened'` | |
| `details` | `null` | **← este es el hueco a llenar** |
| `device_token` | UUID de `localStorage['bowling_device_token']` | Columna dedicada, siempre presente |
| `created_at` | `now()` en UTC | Default de Postgres |

### 2.3 Consecuencia operativa

Para saber "¿qué dispositivo abrió la caja el martes a las 3 pm?" hay que:
1. Copiar el `device_token` (UUID largo).
2. Ir a la tabla `authorized_devices` y buscar el `device_name`.
3. Convertir mentalmente `created_at` UTC a UTC-5 (o cambiar el setting del dashboard).

Fricción alta para una consulta que debería ser directa.

---

## 3. Lógica de negocio PLANEADA

Enriquecer `details` del evento `day_opened` con:

```json
{
  "deviceName": "Pista 2 - Recepción",
  "openedAt": "2026-08-24 15:32:45"
}
```

- **`deviceName`**: nombre legible obtenido consultando `authorized_devices` con el `device_token` de `localStorage`. Si no se puede obtener (sin token, error de red, dispositivo eliminado), se registra como `null` y el log sigue siendo válido.
- **`openedAt`**: hora local en zona `America/Bogota` (UTC-5 sin DST) en formato `YYYY-MM-DD HH:mm:ss`. Redundante con `created_at` pero explícito en `details` sin depender del setting de TZ del dashboard.

El `device_token` sigue registrándose automáticamente en su columna dedicada (no se toca esa parte).

Alcance **quirúrgico**: solo el evento `day_opened`. `day_closed` y otros eventos no se modifican en esta implementación.

---

## 4. Opciones evaluadas y decisiones tomadas

### Pregunta 1 — ¿Cómo obtenemos el `device_name`?

- **(a) Query a `authorized_devices` al abrir caja** — 1 lookup con `device_token`. Es 1 query extra por día (day_opened se ejecuta una vez al día). Funciona inmediatamente sin re-login.
- (b) Cachear `device_name` en `localStorage` al login — cero queries en runtime pero requiere re-login para operadores con sesión activa.
- (c) Cachear + fallback a query — más código pero cubre ambos casos.

**✅ Decisión: (a)** — query en el momento. El evento es infrecuente (1 vez al día) y evita depender de un cambio en `AuthService`.

### Pregunta 2 — ¿Formato de la hora UTC-5?

- **(a) String legible `"2026-08-24 15:32:45"`** — formato tipo timestamp SQL, legible directo en el dashboard.
- (b) ISO 8601 con offset `"2026-08-24T15:32:45-05:00"` — más formal.

**✅ Decisión: (a)** — string legible tipo SQL, zona `America/Bogota`.

---

## 5. Cambios de código concretos

### 5.1 Archivos a modificar

**Solo 1 archivo**: `src/app/services/accounting.service.ts`.

### 5.2 Cambios

| # | Ubicación aprox. | Cambio |
|---|---|---|
| 1 | Constructor | Inyectar `SupabaseService` para poder consultar `authorized_devices`. |
| 2 | `openDay()` | Sigue siendo sync (no cambia la firma). Después del `logging.info` original, disparar un método `logOpenDay()` async con `void` (fire-and-forget) que hace la query y emite el log enriquecido en lugar del actual. Es decir: **reemplazar** el `logging.info('accounting', 'day_opened')` actual por la llamada al método auxiliar. |
| 3 | `logOpenDay()` (nuevo) | Método privado async: (1) formatea la hora con `Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Bogota', ... })`; (2) lee `device_token` de `localStorage`; (3) hace `select device_name from authorized_devices where device_token = ?`; (4) llama a `logging.info('accounting', 'day_opened', { deviceName, openedAt })`. Manejo silencioso de errores — si algo falla, `deviceName` queda `null` y el log se emite igual. |

### 5.3 Archivos que NO se tocan

- `home.ts` — sigue llamando `accountingService.openDay()` de la misma forma; la firma no cambia.
- `logging.service.ts` — sin cambios; ya inserta `device_token` en su columna dedicada.
- `auth.service.ts`, tablas Supabase, migraciones, resto del sistema — sin cambios.

### 5.4 Formato de hora — implementación

```typescript
const openedAt = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'America/Bogota',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
  hour12: false,
}).format(new Date());
// Resultado: "2026-08-24 15:32:45"
```

Se usa el locale `sv-SE` porque genera el formato ISO-like con espacio en vez de `T`, que es exactamente el formato SQL legible. Combinado con `timeZone: 'America/Bogota'`, la hora refleja UTC-5.

---

## 6. Trazabilidad

```
[UI]  Operador ingresa password admin → Home.processOpenDay() → verifyPassword ok
   └→ accountingService.openDay()
      ├→ this.isDayOpen = true
      ├→ localStorage['bowling_day_open'] = 'true'
      └→ this.logOpenDay() [fire-and-forget]
         ├→ openedAt = Intl.DateTimeFormat('sv-SE', {timeZone:'America/Bogota',...}).format(now)
         ├→ deviceToken = localStorage['bowling_device_token']
         ├→ supabase.from('authorized_devices').select('device_name').eq(...).single()
         └→ logging.info('accounting', 'day_opened', { deviceName, openedAt })
            └→ INSERT INTO app_logs (level, category, event, details, device_token, created_at)
               VALUES ('info', 'accounting', 'day_opened',
                       '{"deviceName":"Pista 2 - Recepción","openedAt":"2026-08-24 15:32:45"}',
                       '<UUID>', now())
```

Cuando se consulta el log desde Supabase Dashboard, el operador ve inmediatamente:
- `event = 'day_opened'`
- `details.deviceName = 'Pista 2 - Recepción'` ← humanamente legible
- `details.openedAt = '2026-08-24 15:32:45'` ← hora local sin conversión mental
- `device_token = '<UUID>'` ← trazabilidad técnica (por si se necesita cross-reference)
- `created_at = '2026-08-24 20:32:45+00'` ← UTC canónica

---

## 7. Riesgos y consideraciones

- **Query fallida**: si la red o RLS falla, `deviceName = null`. El log se emite igual con hora correcta. Sin impacto en la apertura de caja (fire-and-forget).
- **Device eliminado**: si el `device_token` de `localStorage` ya no existe en `authorized_devices`, la query devuelve error `PGRST116` (no rows). Se maneja como `deviceName = null`.
- **Sin `device_token` en `localStorage`**: caso raro (nunca hubo login), pero se cubre con guard: `deviceName = null`, se emite el log de todas formas.
- **Colombia y DST**: Colombia no observa DST, por lo que `America/Bogota` es siempre UTC-5. Sin problemas de cambios estacionales.
- **Fire-and-forget**: si el log falla en insertar (network, RLS), la apertura de caja no se ve afectada. El `console.warn` de `LoggingService` deja rastro para debugging.
- **Retrocompatibilidad**: logs existentes con `details: null` siguen siendo válidos. El cambio solo afecta a nuevas aperturas.

---

## 8. Estado y siguiente paso

**Pendiente de autorización explícita del usuario** para iniciar el desarrollo.

Al recibir el "OK", ejecuto:
1. Inyectar `SupabaseService` en `AccountingService`.
2. Agregar método privado `logOpenDay()` con la query + formateo de hora.
3. Reemplazar la llamada actual `logging.info('accounting', 'day_opened')` en `openDay()` por el nuevo método.
4. Correr `npm run build` para verificar compilación.
5. (Opcional) Agregar test unitario si aplica.

---

## 9. Ejecución del desarrollo

Los 5 pasos del plan se ejecutaron en orden. Resumen técnico:

### 9.1 Archivo modificado (código de producción)

**`src/app/services/accounting.service.ts`** — 4 cambios discretos:

1. **Import** de `SupabaseService` desde `./supabase`.
2. **Constante `DEVICE_TOKEN_KEY = 'bowling_device_token'`** a nivel de módulo — mismo string literal que ya usa `auth.service.ts` para leer el token de `localStorage`. Ver [hallazgo 1](#hallazgo-1) sobre la duplicación intencional.
3. **Constructor** — segundo parámetro `private supabaseService: SupabaseService`.
4. **`openDay()`** — reemplazada la línea `this.logging.info('accounting', 'day_opened')` por `void this.logOpenDay()`, con comentario explicativo del patrón fire-and-forget.
5. **Nuevo método privado `logOpenDay(): Promise<void>`** — 24 líneas. Formatea la hora en `America/Bogota` con `Intl.DateTimeFormat('sv-SE', {...})`, lee el `device_token` de `localStorage`, consulta `authorized_devices.device_name` con `.single()`, y emite `logging.info('accounting', 'day_opened', { deviceName, openedAt })`. Los errores se manejan silenciosamente: si el token falta o la query falla, `deviceName` queda `null` y el log se emite igual con la hora correcta.

### 9.2 Archivos NO tocados (verificado)

- `src/app/services/logging.service.ts` — sin cambios; sigue insertando `device_token` en su columna dedicada automáticamente.
- `src/app/home/home.ts` — sin cambios; sigue llamando `accountingService.openDay()` de forma sync.
- `src/app/services/auth.service.ts`, `admin.ts`, guards, resto del sistema — sin cambios.
- Migraciones Supabase, `app_logs` schema — sin cambios; la columna `details jsonb` acepta cualquier JSON, no requiere migración.
- `environment.ts`, `api/send-email.ts`, `main.js`, `angular.json`, `package.json` — sin cambios.
- No se agregaron dependencias.

### 9.3 Métrica de bundle

| | Antes | Después | Δ |
|---|---|---|---|
| `main-*.js` (raw) | 832.62 kB | 833.16 kB | +560 B |
| Initial transfer | 225.03 kB | 225.10 kB | +70 B |

Aumento mínimo y coherente con el pequeño diff.

### 9.4 Tests

No se agregaron tests unitarios específicos para este cambio (paso 5 era opcional). La suite existente sigue verde:

```
Executed 24 of 24 SUCCESS (0.186 secs / 0.171 secs)
```

Los 18 tests de la feature de 30 min (`bowling-scorer.spec.ts`) usan un stub de `AccountingService` (`jasmine.createSpyObj`), por lo que la nueva dependencia en `SupabaseService` no los afecta. Tampoco cambió la firma pública de `openDay()`.

---

## 10. Auditoría pre-commit

### 10.1 Alcance del diff

```
src/app/services/accounting.service.ts | 43 ++++++++++++++++++++++++++++++++--
1 file changed, 41 insertions(+), 2 deletions(-)
```

**Un solo archivo, ambos cambios en el path de código de producción.** Nada en tests, configuración, ni otras capas.

### 10.2 Auditoría del flujo

**Trazabilidad `day_opened` end-to-end** (verificada):

1. `Home.processOpenDay()` — password OK → llama `accountingService.openDay()` (sync, sin cambios en la firma).
2. `openDay()` — setea `isDayOpen = true`, persiste en `localStorage`, dispara `void logOpenDay()` (fire-and-forget).
3. `logOpenDay()` corre en background:
   - Formatea la hora local: `Intl.DateTimeFormat('sv-SE', {timeZone:'America/Bogota', ...}).format(new Date())` → `"2026-08-24 15:32:45"`.
   - Lee `localStorage['bowling_device_token']`.
   - `supabase.from('authorized_devices').select('device_name').eq('device_token', ?).single()`.
   - Emite `logging.info('accounting', 'day_opened', { deviceName, openedAt })`.
4. `LoggingService.log()` inserta la fila en `app_logs` con `device_token` en columna dedicada y `details` con el JSON enriquecido.

**Regresión**: la firma pública de `openDay()` no cambia (`void → void`, sin `async`). Todos los consumidores actuales siguen funcionando idéntico. `Home.processOpenDay()` no requiere `await`.

### 10.3 Seguridad

| Aspecto | Estado |
|---|---|
| Query a `authorized_devices` | ✅ El operador ya está autenticado (RLS lo permite; sin escalación). |
| `device_token` usado | ✅ El mismo que login validó — sin risk de exposure. |
| Datos filtrados a Supabase | ✅ Solo `deviceName` (un string humano ya autorizado por admin) y `openedAt` (hora — no sensible). Sin PII adicional. |
| Nuevas dependencias | ✅ Ninguna. |
| Cambios en RLS o migraciones | ✅ Ninguno. `app_logs.details jsonb` acepta el nuevo JSON sin cambio de schema. |
| Fire-and-forget safety | ✅ Si la query falla, la apertura de caja no se ve afectada. Solo se pierde `deviceName` (queda `null`); la hora sí se registra. |
| XSS o injection | ✅ El `deviceName` va como valor JSON, no como HTML; Supabase client parametriza la query. |

### 10.4 Verificación de build

- `npm run build`: `Application bundle generation complete. [3.262 seconds]`. Sin errores ni warnings nuevos.
- `npx ng test --watch=false --browsers=ChromeHeadless`: `24 of 24 SUCCESS`.

---

## 11. Hallazgos de la auditoría

### <a id="hallazgo-1"></a> Hallazgo 1 — Duplicación del literal `'bowling_device_token'`

**Contexto:** `auth.service.ts:6` ya define `const DEVICE_TOKEN_KEY = 'bowling_device_token'` a nivel de módulo. Al necesitar leer el mismo token desde `accounting.service.ts`, se duplicó la constante en vez de importarla.

**Alternativas evaluadas:**

- **(a) Duplicar la constante (decidido)** — cada servicio mantiene su propio literal. Sin acoplamiento entre servicios.
- (b) Exportar `DEVICE_TOKEN_KEY` desde `auth.service.ts` e importarla en `accounting.service.ts` — evita duplicación pero acopla `AccountingService` a `AuthService`.
- (c) Crear un `constants.ts` compartido con las claves de `localStorage` — refactor mayor, fuera de scope de esta implementación.

**✅ Decisión: (a) — duplicar.** El literal se repite en dos lugares. Si algún día se hace un cleanup de `localStorage` keys, es fácil de encontrar con grep. No introduce bug; solo es una nota de code smell menor.

### <a id="hallazgo-2"></a> Hallazgo 2 — No hay tests unitarios específicos para este cambio

**Contexto:** el paso 5 del plan mencionaba tests como "opcional". No se agregaron.

**Razón:** para testear `logOpenDay()` habría que mockear `SupabaseService.client.from().select().eq().single()`, que es la cadena fluent de Supabase — verboso. Y el valor real del cambio se ve en producción cuando se abre una caja y aparece el log en el dashboard. Un test unitario aquí verificaría más el mock que la lógica.

**Alternativas evaluadas:**

- (a) Escribir el mock completo de Supabase y testear ambas ramas (con y sin token) — ~40 líneas.
- **(b) No agregar tests (decidido)** — el cambio es acotado, el build compila, la firma pública no cambia y no hay regresión detectable en la suite existente. La prueba real es ver el log enriquecido en Supabase tras la próxima apertura de caja.

**✅ Decisión: (b) — sin tests.** Si en el futuro se toca `logOpenDay()` para otros eventos (`day_closed`, etc.), vale la pena agregar cobertura con un mock reutilizable de Supabase.

---

## 12. Estado final

- ✅ 5 pasos del plan ejecutados.
- ✅ Build de producción limpio.
- ✅ 24/24 tests pasando.
- ✅ Auditoría de trazabilidad completada.
- ✅ Auditoría de seguridad completada — sin vulnerabilidades introducidas.
- ✅ 2 hallazgos documentados con decisión.
- ⏳ **Pendiente:** commit y prueba manual (abrir caja y verificar el `details` en el dashboard de Supabase).
- ⏳ **Pendiente:** push a `origin/Antigravity` (a criterio del usuario tras la prueba manual).
