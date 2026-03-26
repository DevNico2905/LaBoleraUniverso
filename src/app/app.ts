import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { KeyboardNavService } from './services/keyboard-nav.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly title = signal('bolera');

  constructor(private keyboardNav: KeyboardNavService) {}
}
