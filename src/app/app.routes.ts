import { Routes } from '@angular/router';
import { Home } from './home/home';
import { Login } from './login/login';
import { preventNavigationGuard } from './prevent-navigation.guard';
import { authGuard } from './guards/auth-guard';
import { adminGuard } from './guards/admin-guard';

// Login y Home van eager: son las dos primeras pantallas del kiosko y cargarlas
// diferidas solo agregaría un salto extra antes de que el operador vea algo.
// /game y /admin van con loadComponent para sacarlos del chunk inicial:
// bowling-scorer es el componente más grande de la app y admin casi no se usa.
export const routes: Routes = [
  { path: 'login', component: Login },
  { path: '', component: Home, canActivate: [authGuard] },
  {
    path: 'game',
    loadComponent: () => import('./bowling-scorer/bowling-scorer').then(m => m.BowlingScorerComponent),
    canActivate: [authGuard],
    canDeactivate: [preventNavigationGuard]
  },
  {
    path: 'admin',
    loadComponent: () => import('./admin/admin').then(m => m.Admin),
    canActivate: [adminGuard]
  },
  { path: '**', redirectTo: '' }
];
