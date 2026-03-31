import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { SupabaseService } from './supabase';
import { LoggingService } from './logging.service';

const DEVICE_TOKEN_KEY = 'bowling_device_token';
const MAX_DEVICES_CONFIG_KEY = 'max_devices';

export type UserRole = 'admin' | 'client' | null;

export interface AuthState {
  isAuthenticated: boolean;
  isDeviceAuthorized: boolean;
  isLoading: boolean;
  role: UserRole;
  error: string | null;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private state = new BehaviorSubject<AuthState>({
    isAuthenticated: false,
    isDeviceAuthorized: false,
    isLoading: false,
    role: null,
    error: null,
  });

  authState$ = this.state.asObservable();

  constructor(private supabaseService: SupabaseService, private logging: LoggingService) {}

  private get supabase() {
    return this.supabaseService.client;
  }

  getRole(): UserRole {
    return this.state.value.role;
  }

  // Genera o recupera el token único de este dispositivo
  private getOrCreateDeviceToken(): string {
    let token = localStorage.getItem(DEVICE_TOKEN_KEY);
    if (!token) {
      token = crypto.randomUUID();
      localStorage.setItem(DEVICE_TOKEN_KEY, token);
    }
    return token;
  }

  // Obtiene el rol del usuario autenticado
  private async fetchRole(): Promise<UserRole> {
    const { data: { user } } = await this.supabase.auth.getUser();
    return (user?.user_metadata?.['role'] as UserRole) ?? 'client';
  }

  // Login: admin → solo sesión, client → sesión + device token
  async login(email: string, password: string, deviceName?: string): Promise<{ success: boolean; role?: UserRole; isNewDevice?: boolean; error?: string }> {
    this.state.next({ ...this.state.value, isLoading: true, error: null });

    const { error: authError } = await this.supabase.auth.signInWithPassword({ email, password });

    if (authError) {
      this.logging.warn('auth', 'login_failed', { reason: 'invalid_credentials' });
      this.state.next({ isAuthenticated: false, isDeviceAuthorized: false, isLoading: false, role: null, error: 'Credenciales incorrectas.' });
      return { success: false, error: 'Credenciales incorrectas.' };
    }

    const role = await this.fetchRole();

    if (role === 'admin') {
      this.logging.info('auth', 'login_success', { role });
      this.state.next({ isAuthenticated: true, isDeviceAuthorized: true, isLoading: false, role, error: null });
      return { success: true, role };
    }

    // Cliente: validar device token
    const deviceResult = await this.validateOrRegisterDevice(deviceName);

    if (!deviceResult.success) {
      this.logging.warn('auth', 'login_failed', { reason: deviceResult.error });
      await this.supabase.auth.signOut();
      this.state.next({ isAuthenticated: false, isDeviceAuthorized: false, isLoading: false, role: null, error: deviceResult.error ?? null });
      return { success: false, error: deviceResult.error };
    }

    this.logging.info('auth', 'login_success', { role, isNewDevice: deviceResult.isNew });
    this.state.next({ isAuthenticated: true, isDeviceAuthorized: true, isLoading: false, role, error: null });
    return { success: true, role, isNewDevice: deviceResult.isNew };
  }

  // Restaura sesión al recargar la página
  async restoreSession(): Promise<boolean> {
    this.state.next({ ...this.state.value, isLoading: true });

    const { data: { session } } = await this.supabase.auth.getSession();

    if (!session) {
      this.state.next({ isAuthenticated: false, isDeviceAuthorized: false, isLoading: false, role: null, error: null });
      return false;
    }

    const role = await this.fetchRole();

    // Admin: solo necesita sesión válida
    if (role === 'admin') {
      this.state.next({ isAuthenticated: true, isDeviceAuthorized: true, isLoading: false, role, error: null });
      return true;
    }

    // Cliente: validar device token
    const deviceToken = localStorage.getItem(DEVICE_TOKEN_KEY);
    if (!deviceToken) {
      this.logging.warn('auth', 'session_restore_failed', { reason: 'no_device_token' });
      await this.supabase.auth.signOut();
      this.state.next({ isAuthenticated: false, isDeviceAuthorized: false, isLoading: false, role: null, error: null });
      return false;
    }

    const { data, error } = await this.supabase
      .from('authorized_devices')
      .select('id, is_active')
      .eq('device_token', deviceToken)
      .single();

    // Error de red o DB inesperado — no borrar el token, fallar sin desregistrar el dispositivo
    if (error && error.code !== 'PGRST116') {
      this.logging.warn('auth', 'session_restore_failed', { reason: 'device_lookup_error', code: error.code });
      this.state.next({ isAuthenticated: false, isDeviceAuthorized: false, isLoading: false, role: null, error: null });
      return false;
    }

    // Dispositivo no encontrado o inactivo — sí borrar el token y cerrar sesión
    if (!data || !data.is_active) {
      this.logging.warn('auth', 'session_restore_failed', { reason: data && !data.is_active ? 'device_inactive' : 'device_not_found' });
      await this.supabase.auth.signOut();
      localStorage.removeItem(DEVICE_TOKEN_KEY);
      this.state.next({ isAuthenticated: false, isDeviceAuthorized: false, isLoading: false, role: null, error: null });
      return false;
    }

    await this.supabase
      .from('authorized_devices')
      .update({ last_seen: new Date().toISOString() })
      .eq('id', data.id);

    this.state.next({ isAuthenticated: true, isDeviceAuthorized: true, isLoading: false, role, error: null });
    return true;
  }

  // Verifica la contraseña del usuario actualmente logueado
  async verifyPassword(password: string): Promise<boolean> {
    const { data: { user } } = await this.supabase.auth.getUser();
    if (!user?.email) return false;

    const { error } = await this.supabase.auth.signInWithPassword({
      email: user.email,
      password,
    });

    return !error;
  }

  async logout(): Promise<void> {
    this.logging.info('auth', 'logout');
    await this.supabase.auth.signOut();
    this.state.next({ isAuthenticated: false, isDeviceAuthorized: false, isLoading: false, role: null, error: null });
  }

  isAuthenticated(): boolean {
    return this.state.value.isAuthenticated && this.state.value.isDeviceAuthorized;
  }

  // --- Lógica interna de registro de dispositivo ---

  private async validateOrRegisterDevice(deviceName?: string): Promise<{ success: boolean; isNew?: boolean; error?: string }> {
    const deviceToken = this.getOrCreateDeviceToken();
    const { data: { user } } = await this.supabase.auth.getUser();

    if (!user) return { success: false, error: 'No se pudo obtener el usuario.' };

    const { data: existingDevice, error: deviceQueryError } = await this.supabase
      .from('authorized_devices')
      .select('id, is_active')
      .eq('device_token', deviceToken)
      .single();

    // PGRST116 = "no rows found" (esperado para dispositivos nuevos). Cualquier otro error es inesperado.
    if (deviceQueryError && deviceQueryError.code !== 'PGRST116') {
      this.logging.error('auth', 'device_lookup_failed', deviceQueryError, { code: deviceQueryError.code });
      return { success: false, error: 'Error al verificar el dispositivo. Intenta de nuevo.' };
    }

    if (existingDevice) {
      if (!existingDevice.is_active) {
        this.logging.warn('auth', 'device_revoked', { deviceToken });
        return { success: false, error: 'Este dispositivo ha sido revocado. Contacta al administrador.' };
      }
      await this.supabase
        .from('authorized_devices')
        .update({ last_seen: new Date().toISOString() })
        .eq('id', existingDevice.id);
      return { success: true, isNew: false };
    }

    // Dispositivo nuevo — si no hay nombre aún, indicarlo para que la UI lo pida
    if (!deviceName) {
      return { success: false, error: '__NEW_DEVICE__' };
    }

    const limitCheck = await this.checkDeviceLimit();
    if (!limitCheck.canRegister) {
      this.logging.warn('auth', 'device_limit_reached', { max: limitCheck.max, current: limitCheck.current });
      return { success: false, error: `Límite de dispositivos alcanzado (${limitCheck.max}). Contacta al administrador.` };
    }

    const { error: insertError } = await this.supabase
      .from('authorized_devices')
      .insert({
        device_token: deviceToken,
        device_name: deviceName.trim(),
        user_id: user.id,
        last_seen: new Date().toISOString(),
      });

    if (insertError) {
      this.logging.error('auth', 'device_registration_failed', insertError);
      return { success: false, error: 'Error al registrar el dispositivo.' };
    }

    this.logging.info('auth', 'device_registered', { deviceName: deviceName.trim() });
    return { success: true, isNew: true };
  }

  private async checkDeviceLimit(): Promise<{ canRegister: boolean; max: number; current: number }> {
    const [configResult, countResult] = await Promise.all([
      this.supabase.from('app_config').select('value').eq('key', MAX_DEVICES_CONFIG_KEY).single(),
      this.supabase.from('authorized_devices').select('id', { count: 'exact' }).eq('is_active', true),
    ]);

    const max = parseInt(configResult.data?.value ?? '6', 10);
    const current = countResult.count ?? 0;

    return { canRegister: current < max, max, current };
  }
}
