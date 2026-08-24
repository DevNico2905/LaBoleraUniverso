import { Injectable } from '@angular/core';
import { GameSession, DailySummary } from '../models/accounting.models';
import * as XLSX from 'xlsx';
import { LoggingService } from './logging.service';
import { SupabaseService } from './supabase';
import { environment } from '../../environments/environment';

const DEVICE_TOKEN_KEY = 'bowling_device_token';

@Injectable({
    providedIn: 'root'
})
export class AccountingService {
    private readonly STORAGE_KEY = 'bowling_daily_sessions';
    private readonly DAY_OPEN_KEY = 'bowling_day_open';

    private currentSessions: GameSession[] = [];
    public isDayOpen = false;
    public isClosingDay = false;

    constructor(private logging: LoggingService, private supabaseService: SupabaseService) {
        this.loadSessions();
        this.isDayOpen = localStorage.getItem(this.DAY_OPEN_KEY) === 'true';
    }

    private loadSessions() {
        const data = localStorage.getItem(this.STORAGE_KEY);
        if (data) {
            try {
                const parsed = JSON.parse(data);
                // Basic check if data is from today, if not, optionally archive or just load.
                // For simplicity, we load everything in the "current bucket" until closed.
                this.currentSessions = parsed;
            } catch (e) {
                this.logging.error('accounting', 'sessions_load_failed', e as Error);
                this.currentSessions = [];
            }
        }
    }

    private saveSessions() {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.currentSessions));
    }

    startGame(playerCount: number, laneId: number = 1): string {
        const existing = this.getActiveSession();
        if (existing) return existing.id;

        const id = Date.now().toString(); // Simple ID
        const session: GameSession = {
            id,
            startTime: Date.now(),
            endTime: null,
            laneId, // For now single lane app, but extensible
            playerCount,
            totalTimeMinutes: 0,
            status: 'active'
        };
        this.currentSessions.push(session);
        this.saveSessions();
        this.logging.info('accounting', 'game_session_started', { sessionId: id, playerCount, laneId });
        return id;
    }

    endGame(sessionId: string, billedDurationMinutes?: number, status: 'completed' | 'cancelled' = 'completed', initialTimeMinutes: number = 0, addedTimeMinutes: number = 0, finalPlayerCount?: number): GameSession | null {
        const index = this.currentSessions.findIndex(s => s.id === sessionId);
        if (index === -1) return null;

        const session = this.currentSessions[index];
        session.endTime = Date.now();
        session.status = status;
        session.initialTimeMinutes = initialTimeMinutes;
        session.addedTimeMinutes = addedTimeMinutes;
        if (finalPlayerCount !== undefined) session.playerCount = finalPlayerCount;

        if (billedDurationMinutes !== undefined) {
            session.totalTimeMinutes = billedDurationMinutes;
        } else {
            // Fallback: Calculate duration in minutes from wall clock
            const durationMs = session.endTime - session.startTime;
            session.totalTimeMinutes = Math.ceil(durationMs / 1000 / 60);
        }

        this.currentSessions[index] = session;
        this.saveSessions();
        this.logging.info('accounting', 'game_session_ended', { sessionId, status, totalTimeMinutes: session.totalTimeMinutes, initialTimeMinutes, addedTimeMinutes });
        return session;
    }

    getActiveSession(): GameSession | undefined {
        // Logic for single-session app
        return this.currentSessions.find(s => s.endTime === null);
    }

    getTodaySummary(): DailySummary {
        const now = new Date();
        // Usamos la hora local en lugar de UTC para que los cierres nocturnos tengan la fecha correcta
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const today = `${year}-${month}-${day}`;
        const finishedSessions = this.currentSessions.filter(s => s.endTime !== null);
        const completedSessions = finishedSessions.filter(s => s.status === 'completed');

        const cancelledSessions = finishedSessions.filter(s => s.status === 'cancelled');
        const completedTime = completedSessions.reduce((acc, curr) => acc + curr.totalTimeMinutes, 0);
        const cancelledTime = cancelledSessions.reduce((acc, curr) => acc + curr.totalTimeMinutes, 0);

        return {
            date: today,
            totalTimeMinutes: completedTime + cancelledTime,
            completedTimeMinutes: completedTime,
            cancelledTimeMinutes: cancelledTime,
            totalGames: completedSessions.length,
            cancelledGames: cancelledSessions.length,
            sessions: finishedSessions
        };
    }

    openDay() {
        this.isDayOpen = true;
        localStorage.setItem(this.DAY_OPEN_KEY, 'true');
        // Log enriquecido con nombre del dispositivo + hora local (UTC-5). Fire-and-forget
        // para no bloquear la UI: la caja se abre inmediatamente y el log llega en background.
        void this.logOpenDay();
        // Optional: Archive old sessions if they exist from a previous unclosed day?
        // For now, we keep them as part of the "Current Open Day" bucket.
    }

    /**
     * Emite el log `day_opened` con detalles útiles para auditoría desde el dashboard de Supabase:
     *   - deviceName: nombre humano del dispositivo (query a authorized_devices).
     *   - openedAt: hora local en zona America/Bogota (UTC-5, sin DST), formato "YYYY-MM-DD HH:mm:ss".
     * Si la query o el token fallan, deviceName queda null y el log se emite igual con la hora.
     */
    private async logOpenDay(): Promise<void> {
        // Formato "2026-08-24 15:32:45" en zona America/Bogota. El locale sv-SE genera el
        // separador con espacio en vez de "T", que es exactamente el formato SQL legible.
        const openedAt = new Intl.DateTimeFormat('sv-SE', {
            timeZone: 'America/Bogota',
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
            hour12: false,
        }).format(new Date());

        let deviceName: string | null = null;
        const deviceToken = localStorage.getItem(DEVICE_TOKEN_KEY);

        if (deviceToken) {
            const { data, error } = await this.supabaseService.client
                .from('authorized_devices')
                .select('device_name')
                .eq('device_token', deviceToken)
                .single();

            if (data && !error) {
                deviceName = data.device_name ?? null;
            }
        }

        this.logging.info('accounting', 'day_opened', { deviceName, openedAt });
    }

    closeDayAndExport(laneName: string = ''): void {
        if (this.isClosingDay) return;
        this.isClosingDay = true;

        const summary = this.getTodaySummary();

        // 1. Create a Worksheet for Summary
        const reportTitle = laneName ? `Informe - Pista ${laneName}` : 'Informe';
        const summaryData = [
            [reportTitle, summary.date],
            ['Tiempo Total (min)', summary.totalTimeMinutes],
            ['Juegos Totales', summary.totalGames],
            ['Pista N°', laneName],
            [],
            ['Detalle de Partidas']
        ];

        // 2. Create Header Row for Details
        const headers = ['ID', 'Inicio', 'Fin', 'Jugadores', 'Tiempo Inicial (min)', 'Tiempo Extra (min)', 'Duración Total (min)', 'Estado'];
        const detailsData = summary.sessions.map(s => [
            s.id,
            new Date(s.startTime).toLocaleTimeString(),
            s.endTime ? new Date(s.endTime).toLocaleTimeString() : 'N/A',
            s.playerCount,
            s.initialTimeMinutes || 0,
            s.addedTimeMinutes || 0,
            s.totalTimeMinutes,
            s.status === 'completed' ? '✅ Juego finalizado con éxito' : '❌ Juego no finalizado / Cancelado'
        ]);

        // Combine
        const ws: XLSX.WorkSheet = XLSX.utils.aoa_to_sheet([
            ...summaryData,
            headers,
            ...detailsData
        ]);

        // 3. Create Workbook
        const wb: XLSX.WorkBook = XLSX.utils.book_new();
        const sheetName = laneName ? `Informe Pista ${laneName}` : `Cierre ${summary.date}`;
        // Limitar nombre de hoja a 31 chars (límite de Excel)
        XLSX.utils.book_append_sheet(wb, ws, sheetName.substring(0, 31));

        // 4. Save File Localmente
        const fileNameNamePart = laneName ? `Pista ${laneName.replace(/[^a-z0-9]/gi, '_')}` : 'Caja';
        const fileName = `Informe ${fileNameNamePart} ${summary.date}.xlsx`;
        XLSX.writeFile(wb, fileName);

        // 5. Enviar por correo vía Vercel API
        try {
            const excelBase64 = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' });

            // Identificar si estamos corriendo en la app de escritorio (file://)
            const isDesktop = window.location.protocol === 'file:';
            // Si es escritorio, usar la URL absoluta; en web, usa la relativa
            const baseUrl = isDesktop ? 'https://labolerauniverso.nick-bern.com' : '';
            const fetchUrl = `${baseUrl}/api/send-email`;

            // Fire-and-forget: no bloqueamos la UI, pero las sesiones solo se borran
            // cuando el request termina (éxito o error) para poder reintentar si falla.
            const clearDay = () => {
                this.logging.info('accounting', 'day_closed', { laneName, totalGames: summary.totalGames, totalTimeMinutes: summary.totalTimeMinutes });
                this.currentSessions = [];
                this.saveSessions();
                localStorage.removeItem(this.DAY_OPEN_KEY);
                this.isDayOpen = false;
                this.isClosingDay = false;
            };

            fetch(fetchUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Api-Secret': environment.apiSecret },
                body: JSON.stringify({
                    date: summary.date,
                    completedTimeMinutes: summary.completedTimeMinutes,
                    cancelledTimeMinutes: summary.cancelledTimeMinutes,
                    totalTimeMinutes: summary.totalTimeMinutes,
                    filename: fileName,
                    laneName: laneName,
                    excelBase64: excelBase64
                })
            }).then(response => {
                if (response.ok) {
                    this.logging.info('accounting', 'email_sent', { laneName, date: summary.date });
                } else {
                    response.json().then(err => this.logging.error('accounting', 'email_failed', undefined, { laneName, apiError: err }));
                }
                clearDay();
            }).catch(err => {
                this.logging.error('accounting', 'email_network_error', err as Error, { laneName });
                clearDay();
            });
        } catch (e) {
            this.logging.error('accounting', 'email_attachment_failed', e as Error);
            this.isClosingDay = false;
        }
    }
}
