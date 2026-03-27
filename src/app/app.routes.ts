import { Routes } from '@angular/router';
import { Home } from './home/home';
import { BowlingScorerComponent } from './bowling-scorer/bowling-scorer';
import { preventNavigationGuard } from './prevent-navigation.guard';

export const routes: Routes = [
    {path: "", component:Home },
    {path: "game", component:BowlingScorerComponent, canDeactivate: [preventNavigationGuard]}
];
