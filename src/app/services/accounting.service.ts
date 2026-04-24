import { Injectable } from '@angular/core';
import { GameSession, DailySummary } from '../models/accounting.models';
import * as XLSX from 'xlsx';
import { LoggingService } from './logging.service';
import { environment } from '../../environments/environment';

@Injectable({
    providedIn: 'root'
})
export class AccountingService {
    private readonly STORAGE_KEY = 'bowling_daily_sessions';
    private readonly DAY_OPEN_KEY = 'bowling_day_open';

    private currentSessions: GameSession[] = [];
    public isDayOpen = false;
    public isClosingDay = false;

    constructor(private logging: LoggingService) {
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
        this.logging.info('accounting', 'day_opened');
        // Optional: Archive old sessions if they exist from a previous unclosed day?
        // For now, we keep them as part of the "Current Open Day" bucket.
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
