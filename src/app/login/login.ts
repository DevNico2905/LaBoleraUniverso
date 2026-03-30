import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class Login {
  email = '';
  password = '';
  deviceName = '';
  errorMessage = '';
  isLoading = false;
  isNewDevice = false;

  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  async onSubmit() {
    if (!this.email || !this.password) return;
    if (this.isNewDevice && !this.deviceName.trim()) return;

    this.isLoading = true;
    this.errorMessage = '';

    const result = await this.authService.login(
      this.email,
      this.password,
      this.isNewDevice ? this.deviceName : undefined
    );

    this.isLoading = false;

    if (result.success) {
      this.router.navigate(result.role === 'admin' ? ['/admin'] : ['/']);
    } else if (result.error === '__NEW_DEVICE__') {
      this.isNewDevice = true;
      this.errorMessage = '';
    } else {
      this.errorMessage = result.error ?? 'Error al iniciar sesión.';
    }
  }
}
