import { Component, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AccountingService } from '../services/accounting.service';
import { AuthService } from '../services/auth.service';
import { KeyboardNavService } from '../services/keyboard-nav.service';
import { DailySummary } from '../models/accounting.models';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class Home implements AfterViewInit {
  showDailyClosing = false;
  closingPasswordInput = '';
  closingPasswordError = false;
  dailySummary: DailySummary | null = null;

  showOpenDayModal = false;
  openingPasswordInput = '';
  openingPasswordError = false;
  isVerifyingPassword = false;

  isCheckingConnection = false;
  laneName = '';

  constructor(
    public accountingService: AccountingService,
    private authService: AuthService,
    private keyboardNav: KeyboardNavService
  ) {
    this.laneName = localStorage.getItem('bowling_lane_name') || '';
  }

  ngAfterViewInit() {
    setTimeout(() => this.keyboardNav.navigateNext(), 50);
  }

  openDay() {
    this.showOpenDayModal = true;
    this.openingPasswordInput = '';
    this.openingPasswordError = false;
    this.keyboardNav.enterScope('#modal-open-day');
  }

  closeOpenDayModal() {
    this.showOpenDayModal = false;
    this.keyboardNav.exitScope();
  }

  async processOpenDay() {
    if (!this.openingPasswordInput) return;

    this.isVerifyingPassword = true;
    const isValid = await this.authService.verifyPassword(this.openingPasswordInput);
    this.isVerifyingPassword = false;

    if (isValid) {
      this.accountingService.openDay();
      this.showOpenDayModal = false;
      this.keyboardNav.exitScope();
    } else {
      this.openingPasswordError = true;
    }
  }

  openDayClosing() {
    this.showDailyClosing = true;
    this.closingPasswordInput = '';
    this.dailySummary = this.accountingService.getTodaySummary();
    this.keyboardNav.enterScope('#modal-day-closing');
  }

  closeDayClosing() {
    this.showDailyClosing = false;
    this.keyboardNav.exitScope();
  }

  async checkInternetConnection(): Promise<boolean> {
    if (!navigator.onLine) return false;
    try {
      await fetch('https://1.1.1.1', { mode: 'no-cors', cache: 'no-store' });
      return true;
    } catch (e) {
      return false;
    }
  }

  async processDayClosing() {
    if (!this.closingPasswordInput) return;

    this.isVerifyingPassword = true;
    const isValid = await this.authService.verifyPassword(this.closingPasswordInput);
    this.isVerifyingPassword = false;

    if (isValid) {
      this.isCheckingConnection = true;
      const hasInternet = await this.checkInternetConnection();
      this.isCheckingConnection = false;

      if (!hasInternet) {
        alert('Error: No hay conexión a internet. El cierre de caja requiere internet para enviar el reporte por correo.');
        return;
      }

      localStorage.setItem('bowling_lane_name', this.laneName);
      this.accountingService.closeDayAndExport(this.laneName);
      this.showDailyClosing = false;
      this.keyboardNav.exitScope();
      alert('Cierre de caja realizado y exportado correctamente.');
      this.dailySummary = null;
    } else {
      this.closingPasswordError = true;
    }
  }
}
