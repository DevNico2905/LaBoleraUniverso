import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AccountingService } from '../services/accounting.service';
import { AuthService } from '../services/auth.service';
import { DailySummary } from '../models/accounting.models';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class Home {
  showDailyClosing = false;
  closingPasswordInput = '';
  closingPasswordError = false;
  dailySummary: DailySummary | null = null;

  private readonly correctPassword = 'admin123'; // Hardcoded as requested default

  constructor(
    private accountingService: AccountingService,
    private authService: AuthService
  ) { }

  openDayClosing() {
    this.showDailyClosing = true;
    this.closingPasswordInput = '';
    this.dailySummary = this.accountingService.getTodaySummary();
  }

  closeDayClosing() {
    this.showDailyClosing = false;
  }

  processDayClosing() {
    if (this.closingPasswordInput === this.correctPassword) {
      this.accountingService.closeDayAndExport();
      this.showDailyClosing = false;
      alert('Cierre de caja realizado y exportado correctamente.');
      this.dailySummary = null;
    } else {
      this.closingPasswordError = true;
    }
  }
}
