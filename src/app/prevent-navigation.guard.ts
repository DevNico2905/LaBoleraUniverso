import { CanDeactivateFn } from '@angular/router';
// Import SOLO de tipo: si fuera un import de valor, el guard arrastraría BowlingScorerComponent
// al chunk inicial y anularía el loadComponent() de la ruta /game.
import type { BowlingScorerComponent } from './bowling-scorer/bowling-scorer';

export const preventNavigationGuard: CanDeactivateFn<BowlingScorerComponent> = (component) => {
  if (component.canDeactivate) {
    return component.canDeactivate();
  }
  return true;
};
