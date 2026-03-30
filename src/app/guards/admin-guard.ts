import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const adminGuard: CanActivateFn = async () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const isValid = await authService.restoreSession();

  if (!isValid) {
    return router.createUrlTree(['/login']);
  }

  if (authService.getRole() !== 'admin') {
    return router.createUrlTree(['/']);
  }

  return true;
};
