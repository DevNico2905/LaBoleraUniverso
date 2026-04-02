import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { SupabaseService } from '../services/supabase';
import { AuthService } from '../services/auth.service';
import { LoggingService } from '../services/logging.service';

interface Device {
  id: string;
  device_name: string;
  device_token: string;
  is_active: boolean;
  last_seen: string | null;
  created_at: string;
}

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin.html',
  styleUrl: './admin.css',
})
export class Admin implements OnInit {
  devices: Device[] = [];
  isLoading = true;
  maxDevices = 0;
  editingId: string | null = null;
  editingName = '';
  saveStatus: 'idle' | 'saving' | 'success' | 'error' = 'idle';
  sortColumn: 'device_name' | 'is_active' | 'last_seen' | 'created_at' | null = null;
  sortDirection: 'asc' | 'desc' = 'asc';

  constructor(
    private supabaseService: SupabaseService,
    private authService: AuthService,
    private router: Router,
    private logging: LoggingService
  ) {}

  private get supabase() {
    return this.supabaseService.client;
  }

  async ngOnInit() {
    await this.loadData();
  }

  async loadData() {
    this.isLoading = true;

    const [devicesResult, configResult] = await Promise.all([
      this.supabase
        .from('authorized_devices')
        .select('*')
        .order('created_at', { ascending: true }),
      this.supabase
        .from('app_config')
        .select('value')
        .eq('key', 'max_devices')
        .single(),
    ]);

    this.devices = devicesResult.data ?? [];
    this.maxDevices = parseInt(configResult.data?.value ?? '6', 10);
    this.isLoading = false;
  }

  get activeCount(): number {
    return this.devices.filter(d => d.is_active).length;
  }

  get sortedDevices(): Device[] {
    if (!this.sortColumn) return this.devices;

    const col = this.sortColumn;
    const dir = this.sortDirection === 'asc' ? 1 : -1;

    return [...this.devices].sort((a, b) => {
      let valA: string | number;
      let valB: string | number;

      if (col === 'is_active') {
        valA = a.is_active ? 1 : 0;
        valB = b.is_active ? 1 : 0;
      } else if (col === 'last_seen' || col === 'created_at') {
        valA = a[col] ? new Date(a[col]!).getTime() : 0;
        valB = b[col] ? new Date(b[col]!).getTime() : 0;
      } else {
        valA = a.device_name.toLowerCase();
        valB = b.device_name.toLowerCase();
      }

      if (valA < valB) return -dir;
      if (valA > valB) return dir;
      return 0;
    });
  }

  setSort(column: 'device_name' | 'is_active' | 'last_seen' | 'created_at') {
    if (this.sortColumn === column) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortColumn = column;
      this.sortDirection = 'asc';
    }
  }

  async toggleDevice(device: Device) {
    const newStatus = !device.is_active;
    const { error } = await this.supabase
      .from('authorized_devices')
      .update({ is_active: newStatus })
      .eq('id', device.id);

    if (!error) {
      device.is_active = newStatus;
    }
  }

  async deleteDevice(device: Device) {
    if (!confirm(`¿Eliminar "${device.device_name}"? Esta acción no se puede deshacer.`)) return;

    const { error } = await this.supabase
      .from('authorized_devices')
      .delete()
      .eq('id', device.id);

    if (!error) {
      this.devices = this.devices.filter(d => d.id !== device.id);
    }
  }

  startEditing(device: Device) {
    this.editingId = device.id;
    this.editingName = device.device_name;
  }

  async saveDeviceName(device: Device) {
    if (!this.editingName.trim()) return;

    const { error } = await this.supabase
      .from('authorized_devices')
      .update({ device_name: this.editingName.trim() })
      .eq('id', device.id);

    if (error) {
      this.logging.error('system', 'device_rename_failed', error, { deviceId: device.id });
      alert(`Error al renombrar dispositivo: ${error.message}`);
      return;
    }

    device.device_name = this.editingName.trim();
    this.editingId = null;
  }

  cancelEditing() {
    this.editingId = null;
  }

  async updateMaxDevices() {
    this.saveStatus = 'saving';
    const { error } = await this.supabase
      .from('app_config')
      .update({ value: String(this.maxDevices) })
      .eq('key', 'max_devices');

    this.saveStatus = error ? 'error' : 'success';
    setTimeout(() => this.saveStatus = 'idle', 3000);
  }

  formatDate(dateStr: string | null): string {
    if (!dateStr) return 'Nunca';
    return new Date(dateStr).toLocaleString('es-ES', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  }

  async logout() {
    await this.authService.logout();
    this.router.navigate(['/login']);
  }

  goHome() {
    this.router.navigate(['/']);
  }
}
