import { Routes } from '@angular/router';
import { Home } from './home/home';
import { BowlingScorerComponent } from './bowling-scorer/bowling-scorer';
import { Login } from './login/login';
import { Admin } from './admin/admin';
import { preventNavigationGuard } from './prevent-navigation.guard';
import { authGuard } from './guards/auth-guard';
import { adminGuard } from './guards/admin-guard';

export const routes: Routes = [
  { path: 'login', component: Login },
  { path: '', component: Home, canActivate: [authGuard] },
  { path: 'game', component: BowlingScorerComponent, canActivate: [authGuard], canDeactivate: [preventNavigationGuard] },
  { path: 'admin', component: Admin, canActivate: [adminGuard] },
  { path: '**', redirectTo: '' }
];
