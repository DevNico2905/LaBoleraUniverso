import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase';

export type LogLevel = 'info' | 'warn' | 'error';
export type LogCategory = 'auth' | 'game' | 'accounting' | 'system';

@Injectable({ providedIn: 'root' })
export class LoggingService {
  constructor(private supabaseService: SupabaseService) {}

  private get supabase() {
    return this.supabaseService.client;
  }

  log(level: LogLevel, category: LogCategory, event: string, details?: Record<string, unknown>): void {
    const deviceToken = localStorage.getItem('bowling_device_token');

    if (level === 'error') console.error(`[${category}] ${event}`, details ?? '');
    else if (level === 'warn') console.warn(`[${category}] ${event}`, details ?? '');
    else console.log(`[${category}] ${event}`, details ?? '');

    this.supabase
      .from('app_logs')
      .insert({ level, category, event, details: details ?? null, device_token: deviceToken })
      .then(({ error }) => {
        if (error) console.warn('[logging] No se pudo guardar el log:', error.message);
      });
  }

  info(category: LogCategory, event: string, details?: Record<string, unknown>): void {
    this.log('info', category, event, details);
  }

  warn(category: LogCategory, event: string, details?: Record<string, unknown>): void {
    this.log('warn', category, event, details);
  }

  error(category: LogCategory, event: string, err?: unknown, details?: Record<string, unknown>): void {
    const errInfo = err instanceof Error
      ? { message: err.message, name: err.name }
      : err !== undefined ? { raw: String(err) } : {};
    this.log('error', category, event, { ...details, ...errInfo });
  }
}
