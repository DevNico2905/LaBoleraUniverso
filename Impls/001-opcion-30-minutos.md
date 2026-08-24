# 001 — Opción de tiempo inicial de 30 minutos + extensión "+30 min"

**Fecha:** 2026-08-24
**Rama de trabajo:** `Antigravity`
**Estado:** ✅ Desarrollado, testeado y auditado — pendiente de commit y prueba manual en producción
**Solicitado por:** Cliente

---

## 1. Contexto y motivación

El cliente pidió agregar una opción para que las partidas puedan iniciarse con **30 minutos** de duración (además de los 60 minutos actuales), y correspondientemente, permitir una extensión de **+30 minutos** al final del juego, alongside las extensiones ya existentes de **+5 min** (compensación) y **+60 min** (extensión completa).

El cambio debe ser **trazable end-to-end**: selector inicial → temporizador → alertas → contabilidad → reporte Excel → correo diario.

---

## 2. Lógica de negocio ACTUAL (antes del cambio)

### 2.1 Selección de tiempo inicial

- El componente `BowlingScorer` arranca con `initialTimeLimit = 60`, `timeLimit = 60`, `timeRemaining = 3600` seg.
- En la barra superior del template (`bowling-scorer.html:51-69`) hay un **único botón "60 min"** visible que llama a `changeTimeLimit(60)`. Un segundo botón de "30 min" existe pero está **comentado** (líneas 56-63) — infraestructura preparada, no funcional.
- El método `changeTimeLimit(minutes)` (`bowling-scorer.ts:816-822`) es **genérico**: acepta cualquier `minutes` y setea `initialTimeLimit`, `timeLimit` y `timeRemaining` de forma consistente. Solo puede invocarse antes de `gameStarted`.

### 2.2 Temporizador

- Al pulsar "Iniciar", `startGame()` fija `targetEndTime = Date.now() + timeRemaining * 1000` y arranca `startTimer()` (`bowling-scorer.ts:231-269`).
- El timer se apoya en reloj absoluto (`Date.now()`) para sobrevivir a pestañas inactivas.

### 2.3 Alertas de tiempo

Umbrales **absolutos** hardcodeados:

| Umbral | Comportamiento | Modal |
|---|---|---|
| `timeRemaining ≤ 900 seg` (15 min) | Modal informativo con countdown de 5 seg y auto-cierre | `showTimeWarning = true`, `alertedAt15 = true` |
| `timeRemaining ≤ 300 seg` (5 min) | Modal persistente con opciones "Continuar", "+5 min", "+60 min" | `showTimeWarning = true`, `alertedAt5 = true` |
| `timeRemaining === 0` | Activa `stopPending = true` — el juego termina **al completar la ronda del frame actual**, no corta a mitad de tiro | `finishGame()` desde `moveToNextTurn()` |

Ambas alertas se disparan a valores fijos, independientemente de la duración inicial.

### 2.4 Extensiones de tiempo (durante y post-juego)

Existen **dos extensiones** disponibles hoy:

| Extensión | Tipo interno | Flag | Trigger UI |
|---|---|---|---|
| **+5 min** | "compensación" | `compensationTimeAdded` | Botón en modal ≤5 min + modal juego terminado |
| **+60 min** | "extensión completa" | `extraTimeAdded` | Mismo |

Ambas:
- Requieren **password de admin** vía `openPasswordPrompt(action)` → `validatePassword()`.
- Suman al `timeLimit`, `addedTimeLimit`, `timeRemaining`.
- Reactivan el timer si `gameFinished === true` (el operador puede extender un juego ya terminado desde el modal).
- Se pueden aplicar **múltiples veces sin restricción** — los flags `extraTimeAdded` y `compensationTimeAdded` se establecen pero **nunca se leen** en template ni lógica (código muerto o preparado para futuro).

Tipo union actual:
```typescript
pendingPasswordAction: 'add60' | 'add5' = 'add60';
openPasswordPrompt(action: 'add60' | 'add5' = 'add60')
```

Ubicaciones UI de los botones de extensión:
- `bowling-scorer.html:319-333` — modal de warning cuando `timeRemaining ≤ 300`.
- `bowling-scorer.html:405-412` — modal de "juego terminado".
- `bowling-scorer.html:345-348` — texto del password prompt cambia con ternario binario (`add60 ? ... : ...`).

### 2.5 Contabilidad

`GameSession` (en `accounting.models.ts`) tiene:

```typescript
initialTimeMinutes?: number;
addedTimeMinutes?: number;
totalTimeMinutes: number;
status: 'completed' | 'cancelled' | 'active';
```

`accountingService.endGame(sessionId, billedMinutes, status, initialTimeMinutes, addedTimeMinutes, playerCount)` recibe los valores desde el componente. **El modelo es paramétrico y ya soporta cualquier duración** — no hay enums ni valores hardcodeados de 60/30.

`calculateBilledDuration()` en el componente devuelve `this.timeLimit` (inicial + acumulado de extensiones). Se cobra siempre el `timeLimit` completo, incluso al cancelar (ver [[billing-rules]]).

### 2.6 Reporte Excel y correo

- **Excel** (`accounting.service.ts:141-171`): columnas incluyen "Tiempo Inicial (min)", "Tiempo Extra (min)", "Duración Total (min)". Todas usan valores numéricos crudos.
- **Correo** (`api/send-email.ts`): muestra 3 métricas — Finalizados, Cancelados, Total — formateadas con `formatMinutes()` (ej. `30 min`, `1h 30min`, `2h`). No distingue por duración inicial.

**Ningún componente del pipeline de contabilidad/reporte requiere cambio** — todo es paramétrico.

---

## 3. Lógica de negocio PLANEADA (después del cambio)

### 3.1 Selección de tiempo inicial

- Botón **"30 min"** visible y funcional en la barra superior, junto al de "60 min".
- Default sigue siendo **60 min** (retrocompatible). El usuario debe hacer clic explícito en "30 min" para cambiar.
- Ambos botones tienen indicador visual de selección (fondo verde vs. blanco/transparente) según coincida con `timeLimit`. Este comportamiento ya está en el CSS del botón comentado.

### 3.2 Temporizador

- Sin cambios estructurales. Con 30 min inicial, `timeRemaining = 1800` seg.
- El mecanismo de `stopPending` (terminar al final de la ronda del frame actual) sigue igual — es agnóstico a la duración.

### 3.3 Alertas de tiempo — **ajuste condicional**

Nueva regla: **cuando el juego inicia con `initialTimeLimit ≤ 30`, la alerta de "15 minutos restantes" se OMITE**. Solo se dispara la de 5 minutos.

Razón: en un juego de 30 min, una alerta a los 15 min restantes salta a la mitad del juego, lo cual es intrusivo y sin valor operativo real. La alerta de 5 min sigue siendo útil como último aviso.

Implementación: en `startTimer()`, chequear `this.initialTimeLimit > 30` antes de disparar la alerta de 15 min. La bandera `alertedAt15` puede pre-establecerse a `true` en `startGame()` para partidas de 30 min o menos.

### 3.4 Extensiones de tiempo — nueva **+30 min**

Se agrega una tercera extensión que se comporta **igual** que las otras dos:

| Extensión | Action key | Color botón sugerido |
|---|---|---|
| +5 min | `add5` | Azul (actual) |
| **+30 min (nueva)** | `add30` | **Púrpura** |
| +60 min | `add60` | Verde (actual) |

- Se puede aplicar **múltiples veces sin restricción** (consistente con las actuales).
- Requiere password de admin.
- Aparece en **ambos** modales (warning ≤5 min y juego terminado).
- Orden visual en los modales: `+5 min | +30 min | +60 min` (creciente).
- Se suma a `timeLimit`, `addedTimeLimit`, `timeRemaining` — se factura como cualquier otra extensión.
- Reactiva el timer si se aplica desde el modal de juego terminado.
- Loguea evento con `action: 'add30', addedMinutes: 30`.

### 3.5 Contabilidad y reportes

**Sin cambios de código.** El modelo es paramétrico:

- Un juego de 30 min terminado natural → `initialTimeMinutes: 30, addedTimeMinutes: 0, totalTimeMinutes: 30`, factura 30 min.
- Un juego de 30 min + extensión 30 min → `initialTimeMinutes: 30, addedTimeMinutes: 30, totalTimeMinutes: 60`, factura 60 min.
- Un juego de 30 min + extensión 5 min → `initialTimeMinutes: 30, addedTimeMinutes: 5, totalTimeMinutes: 35`, factura 35 min.
- Un juego de 30 min cancelado → factura el `timeLimit` acumulado hasta el momento del cancel.

Excel y correo reflejan los valores automáticamente sin cambios.

### 3.6 Trazabilidad end-to-end (ejemplo con juego de 30 min + extensión de 30 min)

```
[UI /game]  Usuario clic botón "30 min"
   └→ changeTimeLimit(30) → initialTimeLimit=30, timeLimit=30, timeRemaining=1800

[UI]  Clic "Iniciar"
   └→ startGame()
      ├→ targetEndTime = now + 1800000
      ├→ alertedAt15 = true (pre-supresión — ver 3.3)
      └→ accountingService.startGame(playerCount) → nueva GameSession activa
         logging.info('game', 'game_started', { timeLimitMinutes: 30 })

[Timer]  timeRemaining ≤ 300 → modal warning con botones +5/+30/+60

[Timer]  timeRemaining === 0 → stopPending = true
   └→ moveToNextTurn() al terminar la ronda actual → finishGame()
      └→ accountingService.endGame(id, 30, 'completed', 30, 0, N)

[UI]  Modal "juego terminado" → clic "+30 min" (nueva)
   └→ openPasswordPrompt('add30') → validatePassword()
      ├→ timeLimit=60, addedTimeLimit=30, timeRemaining=1800
      ├→ gameFinished=false, timer se reactiva con nuevo targetEndTime
      └→ logging.info('game', 'time_extended', { action: 'add30', addedMinutes: 30 })

[Timer]  30 min más transcurren → finishGame()
   └→ accountingService.endGame(id, 60, 'completed', 30, 30, N) — actualiza el mismo registro

[Cierre de caja]  DailySummary suma: completedTimeMinutes += 60
   ├→ Excel: fila con "Tiempo Inicial=30", "Tiempo Extra=30", "Duración Total=60"
   └→ Correo: total del turno refleja los 60 min facturados de esta sesión
```

---

## 4. Opciones evaluadas y decisiones tomadas

Se plantearon 7 preguntas de diseño antes de codear. Aquí quedan todas registradas junto a la opción elegida.

### Pregunta 1 — ¿El "+30 min" se puede aplicar múltiples veces?

Opciones:
- **(a) Mismo comportamiento que los actuales** — sin restricción, sin flag nuevo. [Consistente con +5 y +60]
- (b) Introducir límite (flag que lo deshabilite tras usarlo, extendible a los otros).

**✅ Decisión: (a)** — sin restricción, sin flag nuevo. Mantiene consistencia con la lógica actual de +5 y +60.

### Pregunta 2 — ¿Cuál debe ser el default de tiempo inicial?

Opciones:
- **(a) Mantener 60 min como default**, usuario cambia a 30 si quiere.
- (b) Sin default, forzar al usuario a elegir antes de iniciar.
- (c) Cambiar default a 30 min.

**✅ Decisión: (a)** — 60 min sigue siendo el default. Retrocompatible.

### Pregunta 3 — ¿Las alertas de 15 min y 5 min se ajustan para partidas de 30 min?

Opciones:
- (a) No tocar — mismas alertas absolutas (15 y 5 min). Funciona pero la de 15 min es rara en juego corto.
- (b) Ajustar dinámico — ej. si `initialTimeLimit ≤ 30`, saltar solo la de 5 min o mover la primera a 10 min.
- **(c) Eliminar la de 15 min cuando `initialTimeLimit ≤ 30`**. Solo dispara la de 5 min en partidas cortas.

**✅ Decisión: (c)** — omitir la alerta de 15 min cuando la partida inicial es de 30 min o menos. La de 5 min sigue activa.

### Pregunta 4 — Orden y color del botón "+30 min"

Opciones:
- **(a) Orden creciente**: `+5 | +30 | +60`.
- (b) Otro orden por semántica.

Color del nuevo botón: distinto de +60 (verde) y +5 (azul).

**✅ Decisión: (a) — orden `+5 | +30 | +60`, color PÚRPURA para el +30 min.**

### Pregunta 5 — ¿Se puede cambiar el tiempo inicial DURANTE un juego?

Opciones:
- **(igual) No, solo antes de iniciar** — durante el juego solo se usan botones de extensión.
- (nueva funcionalidad) Sí, con password.

**✅ Decisión: sigue IGUAL** — `changeTimeLimit` solo funciona con `!gameStarted`. Durante juego, únicamente los botones de extensión.

### Pregunta 6 — Reporte Excel: ¿alguna categorización nueva por duración inicial?

Opciones:
- **(no) Sin cambios** — el reporte sigue mostrando los totales sumados; la columna "Tiempo Inicial (min)" ya refleja 30 o 60 según cada sesión.
- (sí) Segmentar totales (ej. "cuántos juegos de 30 min y cuántos de 60 min").

**✅ Decisión: NO** — sin cambios en el Excel. La granularidad ya existe fila por fila.

### Pregunta 7 — Correo diario: ¿algún cambio?

Opciones:
- **(no) Sin cambios** — el correo sigue mostrando Finalizados / Cancelados / Total.
- (sí) Añadir desglose por duración inicial.

**✅ Decisión: NO** — sin cambios en el correo.

---

## 5. Cambios de código concretos

### 5.1 Archivos a modificar

**Solo 2 archivos**:

- `src/app/bowling-scorer/bowling-scorer.html`
- `src/app/bowling-scorer/bowling-scorer.ts`

### 5.2 Cambios en `bowling-scorer.html`

| # | Ubicación aprox. | Cambio |
|---|---|---|
| 1 | Líneas 56-63 (selector pre-juego) | **Descomentar** el botón "30 min" existente. Ya está construido con el binding correcto: `[class]="timeLimit === 30 ? ...` y `(click)="changeTimeLimit(30)"`. |
| 2 | Líneas 314-334 (modal warning ≤5 min) | **Agregar** botón "+30 min" entre `+5 min` y `+60 min`. Color púrpura (ej. `bg-purple-500 hover:bg-purple-600`). Handler: `openPasswordPrompt('add30')`. |
| 3 | Líneas 404-412 (modal "juego terminado") | **Agregar** botón "+30 min" entre `+5 min` y `+60 min`, misma estética que el del modal de warning. |
| 4 | Líneas 345-348 (password prompt) | **Reemplazar** los ternarios binarios `add60 ? ... : ...` por lógica que cubra los 3 casos (`add5`/`add30`/`add60`). Textos sugeridos: título "Contraseña del Administrador" para add60 y add30; "Autorización de Compensación" para add5. Cuerpo: "Ingrese la contraseña para agregar 30 minutos" para add30. |

### 5.3 Cambios en `bowling-scorer.ts`

| # | Línea aprox. | Cambio |
|---|---|---|
| 1 | Línea 71 | Extender union type de `pendingPasswordAction`: `'add60' \| 'add30' \| 'add5'`. |
| 2 | Línea 308 (`openPasswordPrompt`) | Firma actualizada a `action: 'add60' \| 'add30' \| 'add5' = 'add60'`. |
| 3 | Líneas 355-401 (`validatePassword`) | **Agregar rama `add30`** simétrica a la de `add60`: suma 30 min a `timeRemaining`, `timeLimit`, `addedTimeLimit`; loguea `action: 'add30', addedMinutes: 30`; maneja `wasGameFinished` reactivando el timer y ajusta `targetEndTime`. Reset de `alertedAt15/alertedAt5` según `timeRemaining` (misma lógica actual). |
| 4 | Línea 806 (`startGame`) | Agregar pre-supresión de alerta 15 min para partidas ≤30 min: `if (this.initialTimeLimit <= 30) this.alertedAt15 = true;`. |
| 5 | Sin cambios en flags | **No** se introduce `additionalTimeAdded`. Consistente con decisión 1(a) y con el hecho de que los flags actuales son código muerto. |

### 5.4 Verificaciones no-code

- Ejecutar `ng build --configuration production` para confirmar que no hay errores de tipo por el union type extendido.
- Probar manualmente los flujos:
  1. Juego de 30 min, terminación natural → verificar que solo salta la alerta de 5 min.
  2. Juego de 30 min + extensión +30 → verificar cobro 60 min en Excel.
  3. Juego de 60 min sigue funcionando idéntico (no regresión).
  4. Cancelar juego de 30 min → cobra el `timeLimit` acumulado.
  5. Aplicar +30 min múltiples veces → sin restricción.

---

## 6. Componentes que NO se tocan (verificado)

- `src/app/services/accounting.service.ts` — paramétrico, sin cambios.
- `src/app/models/accounting.models.ts` — sin enums de duración.
- `api/send-email.ts` — `formatMinutes()` maneja cualquier valor.
- `src/app/home/*` — flujo de caja intacto.
- `src/app/login/*`, `src/app/admin/*`, guards — sin impacto.
- Migraciones Supabase — no aplica.
- `main.js` de Electron — no aplica.

---

## 7. Riesgos y consideraciones

- **Regresión en juegos de 60 min**: bajo. Los cambios son aditivos; el flujo actual no se altera.
- **Alertas ≤30 min**: la supresión de la alerta de 15 min podría sorprender al operador si venía del flujo de 60 min. Documentar internamente que es intencional.
- **Facturación de extensiones acumuladas**: consistente con [[billing-rules]]. Si el operador aplica múltiples +30 seguidos, se factura toda la suma — es el comportamiento actual, se mantiene.
- **Textos del password prompt**: al pasar de ternario binario a lógica ternaria, hay que asegurar que ningún caso quede sin texto.

---

## 8. Estado y siguiente paso

**Pendiente de autorización explícita del usuario** para iniciar el desarrollo.

Al recibir el "OK", ejecuto los cambios en orden:
1. Descomentar botón "30 min" en HTML.
2. Extender union type + rama `add30` en TS.
3. Pre-supresión de alerta 15 min para partidas ≤30 min.
4. Agregar botones "+30 min" en los dos modales.
5. Actualizar textos del password prompt.
6. Probar manualmente y hacer commit.

---

## 9. Ejecución del desarrollo

Los 6 pasos del plan se ejecutaron en orden. Resumen técnico:

### 9.1 Archivos modificados (código de producción)

**`src/app/bowling-scorer/bowling-scorer.ts`** — 3 cambios:

1. Línea 71: `pendingPasswordAction: 'add60' | 'add30' | 'add5' = 'add60';` — union type extendido.
2. Línea 308: firma de `openPasswordPrompt(action: 'add60' | 'add30' | 'add5' = 'add60')` extendida.
3. Líneas 373-385: nueva rama `else if (this.pendingPasswordAction === 'add30')` en `validatePassword()`, simétrica a las otras dos. Suma 30 min a `timeRemaining`, `timeLimit`, `addedTimeLimit`; loguea `time_extended {action:'add30', addedMinutes:30, totalAddedMinutes:...}`; maneja `wasGameFinished` reactivando el timer y ajustando `targetEndTime`.
4. Líneas 824-828: en `startGame()`, pre-supresión de la alerta de 15 min cuando `initialTimeLimit <= 30` con comentario explicativo.

**`src/app/bowling-scorer/bowling-scorer.html`** — 4 cambios:

1. Líneas 56-60: botón "30 min" descomentado en el selector pre-juego.
2. Líneas 321-324: botón "+30 min" (púrpura, `bg-purple-500`) agregado entre `+5 min` y `+60 min` en el modal de warning ≤5 min.
3. Líneas 407-410: mismo botón "+30 min" agregado en el modal de "juego terminado".
4. Líneas 340-346: textos del password prompt ampliados de ternario binario a ternario triple (`add5` → "Autorización de Compensación" con texto de 5 minutos; `add30` y `add60` → "Contraseña del Administrador" con textos respectivos).

**No se creó ni introdujo ningún flag nuevo.** Consistente con la decisión 1(a): `add30` no toca `compensationTimeAdded` ni `extraTimeAdded`. El flag existe en el patrón preexistente pero es código muerto (ninguna vista ni lógica lo consume).

### 9.2 Cambio cosmético accidental (transparencia)

Al insertar el botón "+30 min" en el modal warning ≤5 min se eliminaron dos comentarios HTML muertos que estaban entre los botones `+5 min` y `+60 min`. Eran iconos SVG desactivados con `<!-- ... -->` que no renderizaban nada. Sin impacto visual ni funcional; se dejó así por decisión explícita del usuario (ver [decisión hallazgo 2](#hallazgo-2)).

### 9.3 Fixes preexistentes a la suite de tests

La suite `.spec.ts` estaba **rota desde el commit inicial del proyecto** por scaffolding auto-generado con nombres de clase incorrectos. Estos archivos **no se incluyen en el bundle de producción** (`tsconfig.app.json` los excluye vía `"exclude": ["src/**/*.spec.ts"]`), por lo cual nunca afectaron a Vercel ni a Electron. Se arreglaron ahora únicamente para poder correr los tests de la feature nueva.

- `supabase.spec.ts`: import corregido de `Supabase` (no existe) → `SupabaseService`.
- `bowling-scorer.spec.ts`: import corregido de `BowlingScorer` → `BowlingScorerComponent` + suite completa reescrita con 18 tests reales de la feature (ver 9.4).
- `app.spec.ts`: eliminada la aserción `expect(compiled.querySelector('h1')?.textContent).toContain('Hello, bolera')` — ese `<h1>` no existía en `app.html` (default de `ng new` nunca implementado). Agregado `provideRouter([])` porque `App` importa `RouterOutlet`.

### 9.4 Cobertura de tests unitarios agregada

Nueva suite `bowling-scorer.spec.ts` con **18 tests reales** organizados en 5 grupos, con stubs de todas las dependencias (`AccountingService`, `AuthService`, `KeyboardNavService`, `LoggingService`, `Router`):

| Grupo | Tests | Qué cubren |
|---|---|---|
| Smoke | 2 | Instanciación + defaults (60 min inicial). |
| `changeTimeLimit` | 3 | Setea 30/60 min coherentemente en las 3 variables; es no-op tras `gameStarted`. |
| Supresión alerta 15 min | 3 | Con `initialTimeLimit=30` pre-setea `alertedAt15=true`; con `=60` la deja en `false`; loguea `game_started` con `timeLimitMinutes` correcto. |
| Ramas de `validatePassword` | 8 | Rama `add5` (suma + flag compensation), rama `add30` (nueva, sin flags), log de trazabilidad `add30`, aislamiento de flags, rama `add60` (regresión), reactivación post-`gameFinished`, aplicación múltiple sin restricción, rechazo con password inválido. |
| Facturación | 2 | 30 + 30 + 5 = 65 min facturados (regresión); `finishGame` pasa `initialTimeMinutes=30` y `addedTimeMinutes=30` correctos a `accounting.endGame`. |

**Resultado:** `Executed 24 of 24 SUCCESS` en Chrome Headless (18 nuevos + 6 preexistentes que ahora compilan).

Ruido benigno observado (no rompe tests): warnings de Supabase LockManager al instanciar el `SupabaseService` real en varios specs sin stub; 404 de `logo-2.png` porque `angular.json:test` no configura assets. Ninguno introducido por esta feature.

---

## 10. Auditoría pre-commit

Antes de commitear se hizo una revisión completa del codebase para verificar que la implementación no rompió nada en producción ni introdujo vulnerabilidades.

### 10.1 Verificación del alcance del diff

Diff total sobre `HEAD` (`37e5e91`):

```
src/app/app.spec.ts                           |   9 +-       (test — excluido del bundle)
src/app/bowling-scorer/bowling-scorer.html    |  38 ++--    (producción)
src/app/bowling-scorer/bowling-scorer.spec.ts | 300 +++++    (test — excluido del bundle)
src/app/bowling-scorer/bowling-scorer.ts      |  23 +-      (producción)
src/app/services/supabase.spec.ts             |   8 +-      (test — excluido del bundle)
```

**Solo 2 archivos llegan al bundle de producción:** `bowling-scorer.ts` (+23 líneas) y `bowling-scorer.html` (+18/−20 líneas). Confirmado en `tsconfig.app.json:12-14`.

### 10.2 Archivos NO tocados (verificado)

- `src/environments/environment.ts` y `environment.development.ts` — secretos intactos.
- `api/send-email.ts` — pipeline de email sin cambios.
- `src/app/services/accounting.service.ts` y `accounting.models.ts` — modelo paramétrico intacto.
- `src/app/services/auth.service.ts`, `admin.ts`, guards, migraciones Supabase — sin cambios.
- `main.js` de Electron, `angular.json`, `package.json`, `package-lock.json` — sin cambios.
- No se agregaron dependencias ni endpoints nuevos.

### 10.3 Auditoría de flujos post-cambio

**Trazabilidad `add30` end-to-end** (verificada):

1. Clic botón "+30 min" → `openPasswordPrompt('add30')` → `pendingPasswordAction='add30'`.
2. Password OK → `validatePassword` rama add30 → `timeLimit+=30`, `addedTimeLimit+=30`, `timeRemaining+=1800`, log `time_extended{action:'add30', totalAddedMinutes:...}`.
3. Password FAIL → log `time_add_password_failed{action:'add30'}`, `passwordError=true`, tiempo sin cambios.
4. `finishGame()` → `accountingService.endGame(id, calculateBilledDuration(), 'completed', initialTimeLimit, addedTimeLimit, players.length)` — los +30 min quedan en `addedTimeMinutes` de la `GameSession`.
5. Excel: columna "Tiempo Extra (min)" refleja los 30. Correo: `totalTimeMinutes` los incluye.

**Intervals del timer** (auditados): `startTimer` en líneas 109, 369, 382, 396; `stopTimer` en 118, 760, 815. El único caso donde `startTimer` corre sin `stopTimer` previo es el flujo post-`gameFinished`, y `finishGame()` línea 760 ya llama `stopTimer` antes. **Sin intervals colgados.**

**Regresión ruta 60 min** (verificada): la rama `else` de `validatePassword` (líneas 386-399) es idéntica al código original; `changeTimeLimit(60)` funciona igual; el condicional de supresión (`initialTimeLimit <= 30`) NO se activa; el botón "60 min" en HTML no cambió.

### 10.4 Auditoría de seguridad

| Aspecto | Estado |
|---|---|
| Password requerido para `+30 min` | ✅ Sí, mismo flujo que `+5` y `+60` (`openPasswordPrompt` → `validatePassword` → `authService.verifyPassword`). Sin bypass. |
| Union type cerrado | ✅ TypeScript garantiza que solo `'add5' \| 'add30' \| 'add60'` pueden llegar a `openPasswordPrompt`. |
| Nuevas llamadas de red | ✅ Ninguna. |
| Nuevas dependencias | ✅ Ninguna. Cero cambios en `package.json`/`package-lock.json`. |
| Cambios en secrets / env / RLS | ✅ Ninguno. |
| XSS en textos del prompt | ✅ Sin riesgo. Los strings son literales, sin interpolación de input del usuario. |
| Impacto en bundle de producción | ✅ Solo TS/HTML del componente. `.spec.ts` excluidos vía `tsconfig.app.json`. |

### 10.5 Verificación de build

- `npm install` corrió limpio (`node_modules` no existía, se instalaron 889 packages).
- `npm run build` (producción): `Application bundle generation complete. Initial total 910.94 kB / 225.03 kB transferencia`. Sin errores ni warnings.
- `npx ng test --watch=false --browsers=ChromeHeadless`: `Executed 24 of 24 SUCCESS`.

---

## 11. Hallazgos de la auditoría

Durante la revisión pre-commit surgieron 3 hallazgos que se plantearon al usuario. Aquí quedan documentados junto con las decisiones tomadas.

### <a id="hallazgo-1"></a> Hallazgo 1 — Interacción entre supresión de alerta 15 min y extensiones

**Contexto:** cuando un juego arranca con `initialTimeLimit ≤ 30`, la implementación pre-setea `alertedAt15 = true` para suprimir la alerta de 15 min. Sin embargo, el código preexistente en `validatePassword()` línea 401 hace:

```typescript
this.alertedAt15 = this.timeRemaining <= 900;
this.alertedAt5 = this.timeRemaining <= 300;
```

Esta línea corre **después** de sumar el tiempo de la extensión (aplicable a `add5`, `add30` y `add60` por igual — no es introducida por esta feature). Consecuencia: si el operador extiende un juego de 30 min y el nuevo `timeRemaining` supera 900 seg (15 min), `alertedAt15` se re-arma a `false`, y la alerta de 15 min volverá a saltar cuando corresponda.

**Escenario concreto:** juego de 30 min → alerta 5 min salta al minuto 25 → operador aplica `+30` → nuevo `timeRemaining = 35 min = 2100 seg` → `alertedAt15 = 2100 <= 900 = false` → cuando queden 15 min de nuevo, la alerta saltará.

**Opciones evaluadas:**

- **(a) Dejar como está** — tras la extensión, el juego efectivamente ya no es "corto"; una alerta a los 15 min tiene sentido en un juego de 35+ min.
- (b) Mantener la supresión permanente para toda la sesión — la regla original ("juegos que INICIAN en ≤30 min no ven la alerta") no cambiaría por una extensión.

**✅ Decisión: (a)** — se acepta el comportamiento actual. La alerta de 15 min se re-arma tras cualquier extensión que deje el `timeRemaining` por encima de 15 min, incluso si el juego arrancó en 30 min.

### <a id="hallazgo-2"></a> Hallazgo 2 — Comentarios HTML muertos eliminados

**Contexto:** al insertar el botón "+30 min" en el modal de warning ≤5 min, se eliminaron dos comentarios HTML muertos que estaban entre los botones `+5 min` y `+60 min`:

```html
<!-- <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
     <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
           d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
</svg> -->
```

Eran iconos SVG desactivados con `<!-- ... -->` que nunca renderizaban. Sin impacto visual ni funcional. La eliminación fue un cambio no planeado inicialmente en el doc.

**Opciones evaluadas:**

- (a) Restaurar los comentarios para minimizar el diff a lo estrictamente planeado.
- **(b) Dejarlos eliminados** — reduce ruido en el archivo; no cambia comportamiento.

**✅ Decisión: (b)** — se dejan eliminados. Los comentarios no importan.

### <a id="hallazgo-3"></a> Hallazgo 3 — `resetGame()` no reinicia `pendingPasswordAction`

**Contexto (preexistente, no introducido por esta feature):** el método `resetGame()` reinicia todos los flags de la sesión (`alertedAt15`, `alertedAt5`, `extraTimeAdded`, `compensationTimeAdded`, etc.) pero **no reinicia `pendingPasswordAction`**. En la práctica no causa bug porque `openPasswordPrompt` siempre sobrescribe el valor antes de que `validatePassword` lo lea.

**Opciones evaluadas:**

- (a) Corregirlo ahora como cleanup adicional del feature.
- **(b) No tocarlo** — no es regresión introducida por esta feature; se aborda en otro momento si se decide hacer un cleanup.

**✅ Decisión: (b)** — no relevante por el momento. Queda como nota para futura consideración.

---

## 12. Estado final

- ✅ 6 pasos del plan ejecutados.
- ✅ Build de producción limpio.
- ✅ 24/24 tests pasando.
- ✅ Auditoría de trazabilidad end-to-end completada.
- ✅ Auditoría de seguridad completada — sin vulnerabilidades introducidas.
- ✅ 3 hallazgos revisados y decididos con el usuario.
- ⏳ **Pendiente:** commit y prueba manual del usuario en producción (mediana escala).
- ⏳ **Pendiente:** push a `origin/Antigravity` (a criterio del usuario tras la prueba manual).
