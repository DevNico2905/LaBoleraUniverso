import { CanDeactivateFn } from '@angular/router';
import { BowlingScorerComponent } from './bowling-scorer/bowling-scorer';

export const preventNavigationGuard: CanDeactivateFn<BowlingScorerComponent> = (component) => {
  if (component.canDeactivate) {
    return component.canDeactivate();
  }
  return true;
};
