# 004 — Optimización de peso (assets + bundle inicial)

**Fecha:** 2026-08-24
**Rama de trabajo:** `Antigravity`
**Estado:** ✅ Desarrollado, testeado y auditado — pendiente de commit y prueba manual en producción
**Solicitado por:** Nicolás
**Origen:** ejecución de la §2 ("peso") de [`003-auditoria-rendimiento.md`](003-auditoria-rendimiento.md)

---

## 1. Contexto y alcance

Al retomar la Impl 003, el usuario decidió **descartar por ahora la vía TTFB / Speed Insights** (§5.1–5.2 de 003) por considerar esos datos relativos a una ventana de medición concreta, y **enfocar la sesión únicamente en los hallazgos de la primera auditoría**: peso y change detection.

Luego acotó más: **solo peso. Nada de CD en esta sesión.**

Por lo tanto este documento cubre:

- ✅ Assets (§2.1, §2.2 de 003)
- ✅ Bundle inicial: lazy loading de rutas (§5.3 de 003)
- ↩️ `xlsx` fuera del bundle (§2.4) — **implementado y luego REVERTIDO por decisión del usuario.** Ver §4.4
- ❌ **NO** change detection (§2.3, §2.6) — explícitamente fuera de alcance, queda pendiente
- ❌ **NO** TTFB / `vercel.json` / región / Speed Insights — descartado por decisión del usuario
- ❌ **NO** `restoreSession` retry de 4.5 s (§2.5) — es UX percibida, no peso

---

## 2. Correcciones a los hallazgos de la 003

Antes de tocar nada se verificó cada hallazgo contra el código actual. Tres correcciones:

| Hallazgo 003 | Corrección verificada |
|---|---|
| `dist/` pesa 7.2 MB | Pesaba **6.2 MB** al momento de retomar |
| `main.js` = 207 KB gzip | Medido con `gzip -c`: **244 KB** |
| `logo.png` (588 KB) es asset muerto | ✅ Confirmado, pero el grep original daba **falso positivo**: `brand-logo.png` contiene el substring `logo.png`. Se re-verificó con búsqueda exacta |
| Fuente TrainOne "no tiene `@font-face`" | ✅ Correcto, **y además** `home.css:1-5` definía `.train-one-regular` con `font-family: "Train One"` — clase que **nunca se aplicaba en ningún template**. O sea: fuente muerta + CSS muerto |

**Hallazgos nuevos** que la 003 no tenía:

- `angular.json` referenciaba `"src/favicon.ico"`, archivo que **no existe** en el repo.
- `src/assets/favicon.ico` (16 KB) no lo referencia nadie — `index.html` usa `assets/icons/icon.ico`.
- `src/assets/.DS_Store` se estaba copiando al deploy.
- `icon.icns` (97 KB) e `icon.png` (37 KB) los usa **solo electron-builder**, pero el glob `"src/assets"` los subía también a la web.
- `default-background` quedaba **duplicado** en el build: Tailwind lo procesa a `/media/` con hash (que es la copia que el CSS realmente usa) y el glob de assets lo copiaba otra vez a `/assets/images/`.
- `prevent-navigation.guard.ts` importaba `BowlingScorerComponent` como **valor** aunque solo lo usa como tipo genérico. Esto habría **anulado en silencio** el lazy loading de `/game`.

---

## 3. Decisiones tomadas

| # | Decisión | Resuelta por |
|---|---|---|
| 1 | Fuente TrainOne: **borrar** (no migrar a WOFF2) | Usuario. Home hoy ya se ve con el fallback `system-ui`, así que borrarla es **cero cambio visual** |
| 2 | Formato de imagen: **WebP**, sin fallback `<picture>` | Claude. Soportado por todo navegador desde 2020 y por el Chromium de Electron 40; el kiosko corre Electron o Chrome |
| 3 | Calidad de cada imagen: verificada **visualmente**, no a ojo de tamaño | Claude. Ver §4.2 |
| 4 | `login` y `home` quedan **eager**; solo `/game` y `/admin` van lazy | Claude. Son las dos primeras pantallas del kiosko; diferirlas agregaría un salto antes de que el operador vea algo |
| 5 | Excluir `images/default-background.webp` por **archivo exacto**, no `images/**` | Claude. Ignorar el directorio entero dejaría una trampa: un `<img src="assets/images/...">` futuro daría 404 sin explicación |

---

## 4. Cambios ejecutados

### 4.1 Assets borrados

| Archivo | Peso | Motivo |
|---|---|---|
| `src/assets/fonts/Train-One/TrainOne-Regular.ttf` | 2,132,280 B | Sin `@font-face`, nunca se descargaba |
| `src/assets/icons/logo.png` | 600,540 B | Sin referencias |
| `src/assets/favicon.ico` | ~16 KB | Sin referencias |
| `src/assets/icons/btn-jugar.png` | 5,486 B | Sin referencias |

También se borró el bloque `.train-one-regular` de `src/app/home/home.css` (CSS muerto asociado a la fuente).

### 4.2 Imágenes convertidas a WebP

Herramienta: `cwebp` (libwebp) + `sips` para el resize. Cada conversión se **decodificó de vuelta a PNG y se inspeccionó visualmente** contra el original antes de aceptarla.

| Imagen | Antes | Después | Δ | Parámetros |
|---|---|---|---|---|
| `logo-2` (1920×1080, con alpha) | 1,257,709 B | **188,268 B** | **−85%** | `-q 85 -sharp_yuv -alpha_q 100 -m 6` |
| `brand-logo` (1024×1024 → **256×256**) | 966,154 B | **19,006 B** | **−98%** | resize + `-q 90 -sharp_yuv -alpha_q 100 -m 6` |
| `default-background` (1920×1080, sin alpha) | 182,311 B | **33,602 B** | **−82%** | `-q 93 -sharp_yuv -m 6` |

**Notas de calidad:**

- `logo-2` conserva el canal alpha, que es funcional: el fondo de `app.html` se ve a través de las zonas transparentes.
- `brand-logo` se renderiza en `login.html` con `class="w-20"`. Como `styles.css` fija `html { font-size: 20px }`, `w-20` = 5rem = **100 px**. Era una imagen de 1024×1024 para mostrarse a 100 px. Se bajó a 256×256 (2.5× para pantallas densas).
- `default-background` es una pared de ladrillo púrpura con degradado suave y oscuro — justo el caso donde WebP lossy mete *banding*. A `q78` (12 KB) se veía banding visible en el viñeteado de las esquinas. Se subió a **`q93` con `-sharp_yuv`** (33.6 KB), donde el degradado queda limpio. Se prefirió el archivo 3× más grande antes que degradar la pantalla principal.

Referencias actualizadas en `home.html:3`, `login.html:5` y `app.html:1`.

### 4.3 `angular.json` — glob de assets

Antes:
```json
"assets": ["src/favicon.ico", "src/assets"]
```

Ahora:
```json
"assets": [
  {
    "glob": "**/*",
    "input": "src/assets",
    "output": "assets",
    "ignore": [
      "**/.DS_Store",
      "icons/icon.icns",
      "icons/icon.png",
      "images/default-background.webp"
    ]
  }
]
```

- Se eliminó `"src/favicon.ico"` (archivo inexistente).
- `icon.icns` / `icon.png` siguen **en el repo** porque electron-builder los lee desde `src/assets/icons/` según `package.json`; solo se excluyen del build web.

### 4.4 `xlsx` fuera del chunk inicial — IMPLEMENTADO Y REVERTIDO ↩️

**Estado final: NO aplicado. `accounting.service.ts` y `home.ts` quedaron byte a byte idénticos al original.**

#### Qué se hizo

Se pasó `import * as XLSX from 'xlsx'` a `import type` + `await import('xlsx')` dentro de `closeDayAndExport`, para sacar los ~432 KB raw de xlsx del chunk inicial. Eso obligó a que el método pasara de `void` a `Promise<>` y a que `home.ts` hiciera `await`.

#### Por qué se revirtió

Al auditar el cambio a pedido del usuario apareció un **defecto introducido por esta Impl**: si el `import()` fallaba, el método hacía `return` sin exportar ni cerrar el día, pero `home.ts` seguía de largo y mostraba `alert('Cierre de caja realizado y exportado correctamente.')`. Es decir, **le reportaba éxito al operador con el día sin cerrar y sin correo enviado.**

Se corrigió (retornando `Promise<boolean>` y manejando el `false` en `home.ts`), pero eso dejó planteado el trade-off de fondo:

| | Con split de xlsx | Sin split (estado final) |
|---|---|---|
| Chunks iniciales (gzip) | 156,928 B | **251,564 B** |
| Ruta de fallo nueva en el cierre de caja | **Sí** — el chunk puede no cargar | **No** |
| Firma de `closeDayAndExport` | `Promise<boolean>` | `void` (original) |

**Decisión del usuario: revertir.** Textual: *"quiero que quede funcionando correcta así sea que implique un poco más en el bundle. No me arriesgaré a un mal funcionamiento por un poco de peso en el bundle."*

El criterio es sólido: el cierre de caja es el único flujo de la app que mueve dinero y es irreversible (borra las sesiones de `localStorage`). Ahorrar ~95 KB gzip no justifica agregarle una forma nueva de fallar.

Se revirtió con `git checkout --` sobre ambos archivos para garantizar equivalencia exacta con el original, no una reescritura a mano.

#### Deuda detectada de paso (preexistente, NO tocada)

Auditando lo anterior se vio que el `catch` de `email_attachment_failed` en `closeDayAndExport` **ya reportaba éxito** aunque fallara el armado del correo: hace `isClosingDay = false` y retorna, y `home.ts` muestra el alert de éxito igual.

Es un falso positivo **anterior a esta Impl**. No se tocó, porque corregirlo cambia comportamiento observable y queda fuera del alcance ("solo rendimiento"). **Candidato a una Impl propia.**

### 4.5 Lazy loading de `/game` y `/admin`

`app.routes.ts` pasa a `loadComponent()` para ambas rutas.

**Fix crítico asociado** en `prevent-navigation.guard.ts`:

```typescript
// antes — import de valor: arrastraba BowlingScorerComponent al chunk inicial
import { BowlingScorerComponent } from './bowling-scorer/bowling-scorer';

// ahora
import type { BowlingScorerComponent } from './bowling-scorer/bowling-scorer';
```

Sin este cambio el `loadComponent()` de `/game` no habría servido de nada: `app.routes.ts` importa el guard, el guard importaba el componente, y el bundler lo habría dejado en el chunk inicial igual.

### 4.6 Tailwind: excluir los docs del escaneo de fuentes

**Hallazgo accidental, pero real y con trampa a futuro.**

Al escribir este mismo documento se rompió el build:

```
✘ [ERROR] Could not resolve "..." [plugin angular-css-resource]
    src/styles.css:819:22:
      819 │     background-image: url(...);
```

Causa: **Tailwind 4 autodetecta fuentes en todo el proyecto, incluidos los `.md`.** La línea de §7 de este doc citaba una utilidad de fondo con valor arbitrario como ejemplo; Tailwind la tomó como clase real, generó `background-image: url(...)` y el resolver de assets de Angular falló al no poder resolver `...`.

No se arregló cambiando la redacción del doc — cualquier Impl futura que documente una clase de Tailwind volvería a romper el build. Se arregló en `src/styles.css`:

```css
@import "tailwindcss";

@source not "../Impls";
@source not "../README.md";
@source not "../CLAUDE.md";
```

> ⚠️ **Para futuras sesiones:** si agregás un `.md` nuevo en la raíz del repo que cite clases de Tailwind, sumalo a esta lista o el build va a fallar con un error que apunta a una línea de `styles.css` que no existe en el archivo fuente (es del CSS generado por Tailwind), lo cual despista bastante.

---

## 5. Verificación

| Verificación | Resultado |
|---|---|
| `npx ng test --watch=false --browsers=ChromeHeadless` | ✅ **24/24 SUCCESS** |
| `npm run build` (producción) | ✅ sin errores ni warnings de budget |
| `npx ng build --configuration development` | ✅ sin errores |
| `npm run build:electron` | ✅ sin errores |
| `npm run pack` (electron-builder) | ✅ `.app` generada |
| Calidad visual de las 3 imágenes | ✅ inspeccionadas una por una decodificando el WebP |
| **Lazy chunks bajo `file://`, dist suelto** | ✅ verificado ejecutando Electron |
| **Lazy chunks dentro del `.asar` empaquetado** | ✅ verificado sobre la `.app` real |
| `accounting.service.ts` / `home.ts` sin cambios | ✅ `git diff` vacío contra HEAD |

### 5.1 Prueba del riesgo de Electron

Lazy loading introduce un riesgo real en la app de escritorio: los chunks se cargan con `import()` dinámico y Electron sirve todo desde `file://`, donde Chromium bloquea módulos ES por CORS en condiciones normales. Si eso fallaba, **la ruta `/game` no abriría en el kiosko** — o sea, la bolera no puede operar.

Se probó en **los dos escenarios**, con un probe temporal (en el scratchpad, fuera del repo) que carga el `index.html` compilado y hace `import()` de los chunks lazy:

**1. Dist suelto** (`npm run build` + `electron`):
```
app-root renderizó (chars): 158
lazy chunk bowling-scorer : OK exports=1
lazy chunk admin          : OK exports=1
RESULTADO: ✅ lazy loading funciona bajo file://
```

**2. Aplicación empaquetada** (`npm run pack`, cargando desde dentro de
`release/mac-arm64/BowlingScorer.app/Contents/Resources/app.asar`):
```
app-root renderizó (chars): 158
lazy chunk bowling-scorer : OK exports=1
lazy chunk admin          : OK exports=1
RESULTADO: ✅ lazy loading funciona bajo file://
```

El segundo caso es el que importa de verdad: es el que corre el operador. Los únicos errores de consola son ruido preexistente (el `Navigator LockManager` de Supabase y el warning de CSP de Electron), sin relación con estos cambios.

---

## 6. Resultados

### 6.1 Peso del deploy — el grueso de la ganancia

| | Antes | Después | Δ |
|---|---|---|---|
| `dist/bolera/browser/` | **6.2 MB** | **1.2 MB** | **−81%** |
| `src/assets/` | 5.1 MB | 452 KB | −91% |

### 6.2 Bundle inicial — ganancia modesta tras revertir el split de xlsx

Medido con `gzip -c` sobre los artefactos, mismo método antes y después:

| | gzip | Δ vs original |
|---|---|---|
| Original | 263,910 B | — |
| **Estado final** | **251,564 B** | **−4.7%** |
| *(Con split de xlsx, revertido)* | *156,928 B* | *−40%* |

El −4.7% viene del lazy loading de `/game` y `/admin` (~12 KB gzip). El grueso del bundle inicial sigue siendo `xlsx`, que por decisión explícita se dejó adentro para no agregarle rutas de fallo al cierre de caja.

Reparto de chunks:

```
INICIAL                              LAZY
chunk-CTSQC4M5.js   462.03 kB        bowling-scorer   47.46 kB
chunk-XNCSFEIV.js   294.60 kB        admin            10.83 kB
styles.css           43.73 kB
polyfills.js         34.59 kB
main.js              17.87 kB
```

---

## 7. Pendiente (NO ejecutado en esta sesión)

Todo esto sigue abierto y documentado en la 003:

1. **Change detection / INP** — fuera de alcance por decisión explícita del usuario. Al retomar, ver §2.3 y §2.6 de la 003, **con estas correcciones de números** levantadas al verificar:
   - No son 2700 llamadas a `isRollEditable` por ciclo de CD. Los 30 del template cuentan las dos ramas del `*ngIf` (solo renderiza una) y los `(click)` (que no corren en CD). El número real con 9 jugadores es **945 por ciclo**.
   - 🆕 **`getFrameScoreForDisplay` es O(n²)**: se llama 90 veces por ciclo y cada una recalcula desde el frame 0. Con `getAccumulatedScore` suman **~765 llamadas a `calculateFrameScore` por ciclo**. Es más caro que `isRollEditable`.
   - 🆕 **`KeyboardNavService.getFocusableElements()` hace `getComputedStyle()` en loop** (`keyboard-nav.service.ts:52`) → *forced reflow* en cada tecla, sobre 100+ elementos en modo edición. La 003 lo despachó como "no es catastrófico"; es probablemente el peor contribuyente al INP.
   - 🆕 Ningún `*ngFor` usa `trackBy`, y `[].constructor(10)` (`bowling-scorer.html:148`) crea un array nuevo por ciclo.
   - Todo esto corre **2 veces por segundo** durante toda la partida: zone.js parchea el `setInterval(500ms)` del timer y dispara CD aunque `timeRemaining` no haya cambiado.
2. **TTFB / `vercel.json` / región / Speed Insights por ruta** — descartado por decisión del usuario, no por falta de mérito.
3. **`restoreSession` retry de 4.5 s** bloqueando los guards (§2.5 de la 003).
4. Nota para quien toque assets: la copia de `default-background` que **realmente sirve el CSS** es la de `/media/` con hash, generada por Tailwind desde el `bg-[url(...)]` de `app.html`. La copia de `assets/images/` quedaba sin usar y por eso se excluye del build en `angular.json`. Si alguna vez se referencia esa imagen directamente desde un `<img>`, hay que sacar esa línea del `ignore`.

---

## 8. Estado final

**✅ Listo para commit.** Falta:

1. Commit en la rama `Antigravity`.
2. **Prueba manual** siguiendo el patrón de 001/002:
   - Login (imagen `brand-logo` ahora en WebP a 256 px).
   - Home (imagen `logo-2` en WebP + fondo `default-background` en WebP).
   - Entrar a una partida — **`/game` ahora es una ruta lazy**; es lo único de esta Impl que cambia cómo se carga la pantalla del marcador.
   - Panel `/admin`, también lazy ahora.
   - Cierre de caja: **no cambió nada de su código**, pero conviene ejercitarlo igual porque el cierre depende del `<img>` y del CSS que sí se tocaron.
3. Prueba en la **app de escritorio empaquetada**. El lazy loading ya se verificó automáticamente dentro del `.asar` (§5.1), pero conviene la pasada manual de siempre.

**Archivos tocados:**

- `src/app/app.routes.ts` — `loadComponent()` para `/game` y `/admin`
- `src/app/prevent-navigation.guard.ts` — `import type` (se borra al compilar, cero efecto en runtime)
- `src/app/home/home.css` — borrado `.train-one-regular`
- `src/app/home/home.html`, `src/app/login/login.html`, `src/app/app.html` — referencias a `.webp`
- `src/styles.css` — `@source not` para excluir docs del escaneo de Tailwind
- `angular.json` — glob de assets con `ignore`
- `src/assets/` — 3 imágenes convertidas, 4 archivos + 1 directorio borrados

**Archivos NO tocados** (se revirtieron a su estado original con `git checkout --`):

- `src/app/services/accounting.service.ts`
- `src/app/home/home.ts`

**Referencias cruzadas a memoria del proyecto:**

- `[[kiosk-operating-model]]` — la app se abre muchas veces al día por operador; el bundle inicial más liviano y las imágenes de Home/Login son exactamente lo que se paga en cada arranque.
- `[[non-obvious-behaviors]]` — el `fire-and-forget` del correo en `closeDayAndExport` se preservó tal cual al volver el método `async`; ver §4.4.
