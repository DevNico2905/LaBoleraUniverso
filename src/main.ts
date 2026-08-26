import { bootstrapApplication } from '@angular/platform-browser';
import { NavigationEnd, Router } from '@angular/router';
import { injectSpeedInsights } from '@vercel/speed-insights';
import { filter } from 'rxjs';
import { appConfig } from './app/app.config';
import { App } from './app/app';

// Speed Insights sólo aplica en la web. En Electron el index.html se carga por
// file://, donde la ruta absoluta /_vercel/speed-insights/script.js no existe.
const speedInsights =
  window.location.protocol === 'file:' ? null : injectSpeedInsights();

bootstrapApplication(App, appConfig)
  .then((appRef) => {
    if (!speedInsights) return;

    // Reporta la ruta activa para que las métricas se agrupen por vista
    // (/login, /, /game, /admin) y no por URL suelta.
    const router = appRef.injector.get(Router);
    speedInsights.setRoute(router.url);
    router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => speedInsights.setRoute(event.urlAfterRedirects));
  })
  .catch((err) => console.error(err));
