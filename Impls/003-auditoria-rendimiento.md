# 003 — Auditoría de rendimiento (LCP/TTFB/INP)

**Fecha:** 2026-08-24
**Rama de trabajo:** `Antigravity`
**Estado:** 🔍 Auditoría completada — 🟡 PARCIALMENTE EJECUTADA (ver §11)
**Solicitado por:** Nicolás — reportó sensación de lentitud en vistas principales

> **Nota:** a diferencia de las Impls 001 y 002 (features implementadas), este documento es una **investigación de rendimiento**. Contiene todos los hallazgos, comandos pendientes y priorización para poder retomar sin re-descubrir.
>
> **⚠️ Leer §11 antes que nada.** Parte de esta auditoría ya se ejecutó y parte se descartó por decisión del usuario. Además, varios números de este documento fueron **corregidos** al verificarlos contra el código.

---

## 1. Contexto y disparadores

### 1.1 Reporte inicial del usuario

Usuario percibe lentitud navegando las vistas principales de la app. Pidió revisar pesos, tamaños de UI, formatos y velocidad de rendimiento del código.

### 1.2 Datos externos disponibles (Vercel Speed Insights)

Métricas P75 sobre 235 muestras de los últimos 7 días (Desktop, producción, dominio `labolerauniverso.nick-bern.com`, plan Vercel Hobby):

| Métrica | Valor |
|---|---|
| **TTFB** | **6.51 s** ← problema #1 |
| FCP | 7.37 s |
| **LCP** | **9.55 s** ← 68% viene de TTFB |
| **INP** | **672 ms** ← sugiere CD excesivo |
| FID | 18 ms |
| CLS | 0.01 |
| **Real Experience Score** | **33 / 100** |

**Interpretación clave:**
- `FCP − TTFB = 0.86 s` → el arranque de Angular en sí está bien. El problema no es el bundle ejecutándose lento, es el servidor tardando en responder.
- `INP alto con FID bajo` → change detection excesivo, no bundle pesado.
- **68% del LCP es TTFB** → si no bajamos TTFB, ninguna optimización de assets o CD va a mover mucho el RES.

---

## 2. Primera auditoría (enfoque "peso y CD")

Primer pase antes de conocer las métricas de Speed Insights. Enfocado en lo que se ve leyendo el código y el `dist/`. Hallazgos:

### 2.1 Tamaño total desplegado: 7.2 MB

```
3.8 MB — assets/icons (PNG sin optimizar)
2.1 MB — assets/fonts (TrainOne TTF sin usar)
816 KB — main-*.js (con xlsx embebido)
44 KB  — styles-*.css
36 KB  — polyfills-*.js
192 KB — imágenes en /media (default-background.jpg)
```

### 2.2 Detalle de assets

| Archivo | Peso | Uso |
|---|---|---|
| `src/assets/fonts/Train-One/TrainOne-Regular.ttf` | 2.0 MB | ⚠️ **NO tiene `@font-face` — cae al fallback `system-ui`**. Se copia al build pero nadie la descarga en runtime. Puro desperdicio de espacio. |
| `src/assets/icons/logo-2.png` | 1.2 MB | Home (`<img>` full-screen) — probable LCP element |
| `src/assets/icons/brand-logo.png` | 944 KB | Login |
| `src/assets/icons/logo.png` | 588 KB | **NADIE lo usa** — asset muerto |
| `src/assets/images/default-background.jpg` | 180 KB | `app.html` bg |
| `src/assets/icons/btn-jugar.png` | 8 KB | **NADIE lo usa** — asset muerto |

### 2.3 Cálculos costosos en template de `bowling-scorer`

30 llamadas a métodos por fila de frame dentro de `*ngFor`:

```
12 isRollEditable(pIndex, i, 0)
12 isRollEditable(pIndex, i, 1)
 6 isRollEditable(pIndex, i, 2)
 5 displayRoll(...)
```

Con 9 jugadores × 10 frames = **hasta 2700 llamados a `isRollEditable` por ciclo de change detection**. Timer con `setInterval(500ms)` dispara CD cada tick que cambie algo. Más `getRankedPlayers()` con `.sort()` en el modal "juego terminado".

### 2.4 xlsx en bundle inicial

`accounting.service.ts:3` importa `import * as XLSX from 'xlsx'`. `AccountingService` es `providedIn: 'root'` → xlsx (~500 KB) va en el chunk inicial aunque solo se use al cerrar caja (1 vez al día).

### 2.5 `restoreSession` con retry hasta 4.5 s

`auth.service.ts:99-110`: 3 intentos × 1.5 s = **4.5 s en peor caso bloqueando `authGuard`/`adminGuard`**. Si Supabase tarda en responder, el operador ve pantalla blanca hasta 4.5 s antes de ver Home.

### 2.6 `KeyboardNavService.getFocusableElements()`

En cada keydown recorre `document.querySelectorAll('.kb-focusable')`. No es catastrófico pero suma con DOMs grandes.

---

## 3. Prompt de auditoría específico (aportado por el usuario)

El usuario compartió un prompt de auditoría estructurado (basado en las métricas P75 de Speed Insights) que expuso agujeros en la primera auditoría. Reproducido acá para referencia futura:

> **Contexto:** app Angular + Supabase + Tailwind desplegada en Vercel (plan Hobby) en `labolerauniverso.nick-bern.com`. Vercel Speed Insights reporta métricas P75 con TTFB 6.51s, LCP 9.55s, INP 672ms, RES 33/100.
>
> **Hipótesis principal:** 68% del LCP es espera de servidor (TTFB), no ejecución de la app. FCP − TTFB = 0.86 s, o sea el arranque de Angular está bien. INP alto con FID bajo sugiere change detection excesivo, no bundle pesado.
>
> **Tarea:** auditoría de rendimiento en 5 secciones (TTFB/infra, instrumentación, LCP, INP, bundle). Entregable: tabla priorizada + comandos curl/dig + recomendación de por dónde empezar. Busca cambios quirúrgicos y medibles, no refactor grande.

---

## 4. Comparación entre las dos auditorías

| Área | Primera auditoría | Prompt Speed Insights | Overlap |
|---|---|---|---|
| **TTFB (6.51 s)** | ❌ No lo abordé | ✅ Prioridad #1 | 0% |
| **Cache-control / edge caching** | ❌ | ✅ | 0% |
| **Región de despliegue** | ➖ Mencioné `iad1` en otro contexto | ✅ | Marginal |
| **SSR / Angular Universal** | ❌ | ✅ | 0% |
| **Redirecciones encadenadas** | ❌ | ✅ | 0% |
| **Speed Insights integration** | ❌ | ✅ | 0% |
| **Preconnect/dns-prefetch Supabase** | ❌ | ✅ | 0% |
| **`@defer` / lazy loading rutas** | ❌ | ✅ | 0% |
| **`OnPush` inventario** | ➖ Mencioné migrar, no inventarié | ✅ | Parcial |
| **zone.js vs zoneless** | ❌ | ✅ | 0% |
| **INP / CD en marcador** | ✅ 2700 llamadas de `isRollEditable` | ✅ | 100% |
| **Bundle inicial + `xlsx`** | ✅ | ✅ | 100% |
| **Assets sin optimizar** | ✅ | ➖ Ayuda al LCP indirecto | Parcial |
| **Comandos curl/dig** | ❌ | ✅ entregable explícito | 0% |

**Diagnóstico:** la primera auditoría atacó **síntomas visibles** (peso, CD). El prompt orientado a Speed Insights identifica que el **bottleneck real es TTFB (6.5 s = 68% del LCP)**. Aunque baje `logo-2.png` de 1.2 MB a 100 KB, si el servidor tarda 6.5 s en responder el HTML, el usuario vio pantalla en blanco antes de que la imagen empiece a bajar.

---

## 5. Auditoría completa (segunda pasada tras el prompt)

Verificados en vivo con lectura del código:

### 5.1 TTFB / infraestructura

- **`vercel.json`: NO EXISTE** en el repo (verificado con `ls`). Cero control explícito sobre:
  - Cache-control para `index.html`
  - Cache-control para assets con hash (`main-*.js`, `styles-*.css`) — deberían ser `immutable, max-age=31536000`
  - Región (default = `iad1` Washington DC → desde Colombia, latencia física baseline ~90-120 ms round-trip, más TLS handshake)
  - Rewrites SPA explícitas
- **No hay SSR ni Angular Universal**: es SPA pura (`src/main.ts` = `bootstrapApplication(App, appConfig)`). Descarta SSR como causa de TTFB, **pero también descarta el remedio de SSR**.
- `provideZoneChangeDetection({ eventCoalescing: true })` activado en `app.config.ts:10` — coalescing ayuda al CD, no al TTFB.

### 5.2 Instrumentación de Speed Insights — **ROTA**

`src/index.html:12-13`:
```html
<script defer src="/_vercel/insights/script.js"></script>
<script defer src="/_vercel/speed-insights/script.js"></script>
```

**PERO:**
- Paquetes `@vercel/analytics` y `@vercel/speed-insights` en `package.json` **nunca se importan en el código** (grep sobre `src/` retorna 0 resultados).
- Falta llamar a `injectSpeedInsights({ route: ... })` con un observable del `NavigationEnd` del Router. Sin ello, todas las visitas caen en "Unknown" en el dashboard → **no se puede priorizar por ruta real**. Esto explica lo que ve el usuario en el dashboard.

### 5.3 LCP (2.18 s entre FCP y LCP)

- **LCP element probable en Home:** `<img src="assets/icons/logo-2.png">` de **1.2 MB** cubriendo pantalla completa (`w-full h-full object-cover`). Es el elemento visual dominante y el más pesado.
- **Sin `<link rel="preconnect" href="https://hmmlzvmjkhyiunlqwlwv.supabase.co">`** en `index.html`. Cada primer `auth.restoreSession()` paga DNS + TCP + TLS handshake full → probable 200-400 ms extras.
- **NO hay `@defer` ni `loadComponent` lazy** en `app.routes.ts`. Todas las rutas (`login`, `''`, `game`, `admin`) cargan sus componentes eagerly. `bowling-scorer` (1138 líneas TS + 529 HTML) va en `main.js` aunque el usuario recién esté en `/login`.

### 5.4 INP (672 ms)

- **`ChangeDetectionStrategy.OnPush` NO se usa en ningún componente** (grep retorna 0 resultados). Todos son `.Default`.
- `zone.js ~0.15.0` — NO está en modo zoneless (Angular 20 lo permite con `provideExperimentalZonelessChangeDetection`).
- **Listeners de alto tráfico en `bowling-scorer`:**
  - `setInterval(500ms)` del timer
  - `@HostListener('window:keydown')` → dispara CD global en cada tecla
  - `@HostListener('window:beforeunload')`
- `KeyboardNavService`: listener global `keydown` con `querySelectorAll('.kb-focusable')` en cada disparo.
- Sin virtual scroll en `admin` (lista de devices) — bajo impacto porque devices son pocos.

### 5.5 Bundle

- `main.js` **833 KB raw / 207 KB gzip** — bajo el budget definido en `angular.json` (`initial: warning 1MB, error 2MB`). Los budgets están permisivos para una SPA de esta escala.
- Contiene `xlsx` (~500 KB) — no debería estar en el bundle inicial.
- **UN SOLO chunk** (`main-*.js`). Cero code-splitting.

---

## 6. Tabla de hallazgos priorizada por impacto en RES

| # | Hallazgo | Métrica afectada | Esfuerzo | Impacto RES |
|---|---|---|---|---|
| 1 | Sin `vercel.json` → sin cache-control explícito en `index.html` y assets | TTFB, LCP | 20 min | ⭐⭐⭐⭐⭐ |
| 2 | Región `iad1` (Washington) para tráfico desde Colombia | TTFB | 5 min config (o multi-región Pro) | ⭐⭐⭐⭐ |
| 3 | Speed Insights sin integrar con Router → todas las rutas "Unknown" | Instrumentación | 15 min | ⭐⭐⭐⭐ (mide bien) |
| 4 | `bowling-scorer` y `admin` en bundle inicial (sin lazy loading) | LCP, TTI | 30 min | ⭐⭐⭐⭐ |
| 5 | `xlsx` (~500 KB) en `main.js` — solo se usa al cerrar caja | LCP, TTI | 15 min | ⭐⭐⭐⭐ |
| 6 | Sin `preconnect` a Supabase | LCP | 2 min | ⭐⭐⭐ |
| 7 | `logo-2.png` 1.2 MB PNG sin optimizar (probable LCP element) | LCP | 30 min | ⭐⭐⭐⭐ |
| 8 | `brand-logo.png` 944 KB en login | LCP en /login | 15 min | ⭐⭐⭐ |
| 9 | Fuente TrainOne 2 MB sin `@font-face` — desperdicio en CDN | Peso deploy | 5 min | ⭐ (no runtime) |
| 10 | Cero componentes con `OnPush` | INP | 1-2 h por componente | ⭐⭐⭐ |
| 11 | `restoreSession` retry hasta 4.5 s bloqueando `authGuard` | LCP percibido | 20 min | ⭐⭐ |
| 12 | `KeyboardNavService` `querySelectorAll` en cada keydown | INP | 30 min | ⭐ |
| 13 | Assets muertos: `logo.png` (588 KB), `btn-jugar.png` (8 KB) | Peso deploy | 2 min | ⭐ (no runtime) |

---

## 7. Comandos pendientes de ejecutar por el usuario

Estos NO se pueden correr desde el entorno de Claude — el usuario debe ejecutarlos desde su red (Colombia) y traer los resultados. Sin estos datos, decidir "atacar TTFB" es a ciegas.

```bash
# 1. TTFB desglosado por fase — muestra dónde se pierde el tiempo
curl -w "     dns:  %{time_namelookup}s\n     tcp:  %{time_connect}s\n     tls:  %{time_appconnect}s\n    ttfb:  %{time_starttransfer}s\n   total:  %{time_total}s\n  status:  %{http_code}\n" -o /dev/null -s https://labolerauniverso.nick-bern.com/

# 2. Redirecciones encadenadas
curl -sILo /dev/null -w "%{num_redirects} redirects — final: %{url_effective}\n" -L https://labolerauniverso.nick-bern.com/

# 3. Cadena completa de hops HTTP
curl -sIL https://labolerauniverso.nick-bern.com/ | grep -iE "^(location|HTTP/)"

# 4. Cache-control del HTML — CLAVE para saber si se cachea en edge
curl -sI https://labolerauniverso.nick-bern.com/ | grep -iE "cache-control|x-vercel|age|etag|server"

# 5. Cache-control de assets con hash (ajustar nombre real del main-*.js del deploy actual)
curl -sI https://labolerauniverso.nick-bern.com/main-YER3VRPX.js | grep -iE "cache-control|x-vercel|age"

# 6. DNS chain
dig +short labolerauniverso.nick-bern.com
dig +short CNAME labolerauniverso.nick-bern.com

# 7. TTFB de un asset ya en edge cache (baseline de comparación)
curl -w "ttfb: %{time_starttransfer}s\n" -o /dev/null -s https://labolerauniverso.nick-bern.com/main-YER3VRPX.js
```

### Qué buscar en los resultados

- `num_redirects > 0` → cada redirect es un round-trip HTTPS extra (+200-500 ms).
- `x-vercel-cache: MISS` en el HTML → cada visita golpea origen, no hay edge cache real.
- `cache-control: public, max-age=0, must-revalidate` en HTML → forzando revalidación cada vez.
- Diferencia grande entre TTFB del HTML vs. TTFB de un asset .js → confirma que HTML no está edge-cached.
- `age: 0` repetido en visitas → cache miss constante.

---

## 8. Recomendación de secuencia (cuando se retome)

**Paso 0 (bloqueante):** correr los comandos curl/dig de §7 desde la red del cliente y traer los resultados. Sin esto no se puede decidir de forma quirúrgica cuál de los 13 hallazgos ataca la causa raíz.

**Suponiendo TTFB confirmado como problema #1**, secuencia recomendada (todos son cambios quirúrgicos, no refactor):

### Fase 1 — Infraestructura + medición (2-3 h)

1. **Crear `vercel.json`** con:
   - `cache-control: public, max-age=0, must-revalidate` explícito para `/` (HTML)
   - `cache-control: public, max-age=31536000, immutable` para `main-*.js`, `styles-*.css` (los hash-suffixed)
   - Rewrites SPA para que todas las rutas sirvan `index.html`
   - Considerar región `gru1` (São Paulo, más cerca de Colombia) si Vercel Hobby lo permite
2. **Speed Insights bien integrado** en `app.ts`:
   ```typescript
   import { injectSpeedInsights } from '@vercel/speed-insights';
   // ... suscripción a router.events filtrando NavigationEnd → route
   ```
   Sin esto no podemos comparar antes/después con datos.
3. **`<link rel="preconnect" href="https://hmmlzvmjkhyiunlqwlwv.supabase.co">`** en `index.html`.

### Fase 2 — Bundle y assets (1-2 h)

4. **Lazy load** de `/game` y `/admin` en `app.routes.ts` con `loadComponent`.
5. **Dynamic import de `xlsx`** dentro de `closeDayAndExport`.
6. **Optimizar `logo-2.png` a WebP** (probable LCP element).
7. **Optimizar `brand-logo.png` a WebP** y `default-background.jpg`.
8. **Borrar assets muertos**: `logo.png`, `btn-jugar.png`, fuente TrainOne (a menos que se decida usarla, en cuyo caso migrar a WOFF2 subsetted).

### Fase 3 — INP y CD (opcional, mayor esfuerzo)

9. **Migrar `bowling-scorer` a `OnPush`** con Signals para los estados que cambian (timer, jugadores). Memoizar `isRollEditable` en un mapa pre-calculado.
10. **Cachear la lista de `focusable` en `KeyboardNavService`**, invalidar solo en `enterScope`/`exitScope` o cuando el DOM cambie relevantemente.

### Fase 4 — UX percibida (bajo impacto en RES pero visible)

11. **Reducir el retry de `restoreSession`** o mostrar loader UI en vez de bloquear el guard.

**No hacer aún:**
- Migrar a zoneless (Angular 20 lo permite pero es refactor grande, no quirúrgico).
- Instalar Angular Universal / SSR (cambia mucho el pipeline; solo tendría sentido si tras Fase 1 el TTFB sigue alto).

---

## 9. Preguntas / decisiones pendientes

Al retomar, hay que resolver:

1. **¿Los curl confirman `x-vercel-cache: MISS` en HTML?** Determina si crear `vercel.json` es efectivo o si hay que ir por otra vía.
2. **¿Cuántas redirecciones hay?** Si son > 0, ese es un fix rápido y muy alto ROI.
3. **¿La app se puede permitir un plan Vercel Pro?** Para multi-región (más cerca de Colombia) hay que subir de plan. Fase 1 se puede hacer sin eso.
4. **¿La fuente TrainOne se quiere usar o borrar?** Actualmente no funciona (falla al fallback silenciosamente). Decidir: borrar o migrar a WOFF2 con `@font-face`.
5. **¿Se prioriza fase 1 (TTFB) o fase 2 (bundle/assets) primero?** Si los curl confirman TTFB = problema real, fase 1 primero. Si TTFB es outlier de P75 y la mediana es <1s, fase 2 puede tener mejor ROI.

---

## 10. Estado y siguiente paso

**⏸️ PAUSADO** — usuario cansado. Se retoma otro día.

**Al retomar, orden de operación:**

1. **Leer este documento completo** — contiene todo el contexto sin necesidad de re-descubrir.
2. **Correr los 7 comandos curl/dig de §7** desde la red del cliente.
3. **Pegar los resultados** en la conversación para completar el diagnóstico.
4. **Decidir** las 5 preguntas de §9.
5. **Ejecutar la fase 1** (o la que corresponda según los datos).
6. Ir documentando en un nuevo `Impls/004-*.md` cada implementación que se ejecute, siguiendo el patrón de 001/002 (plan → decisiones → ejecución → auditoría → hallazgos → estado final).

**Archivos relevantes ya identificados en la investigación:**

- `src/index.html` — falta preconnect Supabase, scripts de Vercel están pero sin integración.
- `src/main.ts` — `bootstrapApplication`, punto donde se podría llamar `injectSpeedInsights`.
- `src/app/app.config.ts` — providers globales, zone.js con event coalescing.
- `src/app/app.routes.ts` — sin lazy loading, todas las rutas eager.
- `src/app/services/accounting.service.ts:3` — `import * as XLSX from 'xlsx'`.
- `src/app/services/auth.service.ts:99-110` — retry de 4.5 s.
- `src/app/services/keyboard-nav.service.ts:49-56` — `querySelectorAll` por keydown.
- `src/app/bowling-scorer/bowling-scorer.html` — 30 llamadas de método por fila de frame.
- `src/app/bowling-scorer/bowling-scorer.ts:231-269` — `setInterval(500ms)`.
- `src/app/home/home.html:3` — `<img src="assets/icons/logo-2.png">` (probable LCP).
- `src/assets/` — 5.1 MB, ver §2.2 para desglose.
- `angular.json` — budgets `initial: warning 1MB, error 2MB`.
- `package.json` — `@vercel/analytics` y `@vercel/speed-insights` instalados pero no usados en código.
- **`vercel.json`** — NO EXISTE, hay que crearlo en fase 1.

**Referencias cruzadas a memoria del proyecto:**

Este documento cruza con las memorias del proyecto ya guardadas (ver `~/.claude/projects/-Users-nick-bern-dev-LaBoleraUniverso/memory/`):

- `[[kiosk-operating-model]]` — la app es kiosko por pista; usuarios son operadores que la abren muchas veces al día → cada TTFB de 6.5 s es fricción real.
- `[[non-obvious-behaviors]]` — el `stopPending` del timer y otros patrones de CD son relevantes al migrar `bowling-scorer` a `OnPush`.

---

## 11. Actualización — 2026-08-24 (sesión de retoma)

Al retomar, el usuario **descartó la vía TTFB / Speed Insights** (§5.1, §5.2, §6 #1–#3, §7, §8 Fase 1) por considerar esos datos relativos a una ventana de medición concreta, y pidió enfocarse en los hallazgos de la primera auditoría: **peso y CD**. Luego acotó a **solo peso**.

### Qué se ejecutó

**✅ Peso** → implementado y documentado en [`004-optimizacion-peso.md`](004-optimizacion-peso.md).
Resultado: `dist/` **6.2 MB → 1.2 MB** (−81%); chunks iniciales **264 KB → 252 KB gzip** (−4.7%). Cubre los hallazgos #4, #7, #8, #9 y #13 de la tabla de §6.

**↩️ Hallazgo #5 (`xlsx` fuera del bundle): implementado y luego REVERTIDO.** Sacar xlsx del chunk inicial obliga a que `closeDayAndExport` sea asíncrono, lo que agrega una ruta de fallo nueva al cierre de caja — el flujo irreversible que mueve dinero. El usuario decidió que ~95 KB gzip no lo justifican. Ver §4.4 de la 004. **Si se retoma, hay que resolver primero qué hace la UI cuando el chunk no carga.**

### Qué NO se ejecutó

- **CD / INP** (#10, #12) — fuera de alcance por decisión explícita del usuario. **Sigue abierto.**
- **TTFB, `vercel.json`, región, Speed Insights por ruta** (#1, #2, #3) — descartado por el usuario.
- **`preconnect` a Supabase** (#6) — no se hizo; iba junto con la vía descartada, pero es independiente y sigue siendo válido.
- **`restoreSession` retry de 4.5 s** (#11) — sigue abierto.

### Correcciones a este documento

Verificadas contra el código al retomar. **Los números originales de arriba están mal en estos puntos:**

| Dice este doc | Realidad verificada |
|---|---|
| §2.1 `dist/` = 7.2 MB | Eran 6.2 MB |
| §5.5 `main.js` = 207 KB gzip | 244 KB medido con `gzip -c` |
| §2.3 / §6 "hasta 2700 llamadas a `isRollEditable` por ciclo" | **945.** Los 30 del template cuentan las dos ramas del `*ngIf` (solo renderiza una) y los `(click)`, que no corren en CD |
| §2.2 "`logo.png` no lo usa nadie" | Correcto, pero por casualidad: el grep original daba falso positivo porque `brand-logo.png` contiene el substring `logo.png` |
| §2.6 `KeyboardNavService` "no es catastrófico" | **Sí lo es.** Hace `getComputedStyle()` en loop (`keyboard-nav.service.ts:52`) → *forced reflow* por cada tecla sobre 100+ elementos en modo edición. Probablemente el peor contribuyente al INP |

### Hallazgos de CD que este documento no tenía

Al verificar §2.3 aparecieron dos cosas más caras que `isRollEditable`:

- **`getFrameScoreForDisplay` es O(n²)**: 90 llamadas por ciclo, cada una recalculando desde el frame 0. Sumado a `getAccumulatedScore`, dan **~765 llamadas a `calculateFrameScore` por ciclo de CD**.
- **Ningún `*ngFor` usa `trackBy`**, y `[].constructor(10)` (`bowling-scorer.html:148`) crea un array nuevo cada ciclo, forzando el diff completo del header.

Todo esto corre **2 veces por segundo** durante toda la partida, porque zone.js parchea el `setInterval(500ms)` del timer y dispara CD aunque `timeRemaining` no cambie.

### Dato suelto que quedó medido

Se alcanzaron a correr algunos comandos de §7 desde la red del usuario antes de descartar la vía. Para el registro: **TTFB 0.556 s, 0 redirecciones, `x-vercel-cache: HIT`** — o sea, el P75 de 6.51 s de Speed Insights no se reprodujo en esa medición puntual. No es concluyente (una muestra, cache caliente), pero es coherente con la decisión de despriorizar esa vía.
