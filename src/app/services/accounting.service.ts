import { Injectable } from '@angular/core';
import { GameSession, DailySummary } from '../models/accounting.models';
import * as XLSX from 'xlsx';

@Injectable({
    providedIn: 'root'
})
export class AccountingService {
    private readonly STORAGE_KEY = 'bowling_daily_sessions';
    private readonly STATE_KEY_REMOVED = ''; // Removed

    private currentSessions: GameSession[] = [];
    public isDayOpen = false;

    constructor() {
        this.loadSessions();
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
                console.error('Error loading sessions', e);
                this.currentSessions = [];
            }
        }
    }

    private saveSessions() {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.currentSessions));
    }

    startGame(playerCount: number, laneId: number = 1): string {
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
        return id;
    }

    endGame(sessionId: string, billedDurationMinutes?: number, status: 'completed' | 'cancelled' = 'completed', initialTimeMinutes: number = 0, addedTimeMinutes: number = 0): GameSession | null {
        const index = this.currentSessions.findIndex(s => s.id === sessionId);
        if (index === -1) return null;

        const session = this.currentSessions[index];
        session.endTime = Date.now();
        session.status = status;
        session.initialTimeMinutes = initialTimeMinutes;
        session.addedTimeMinutes = addedTimeMinutes;

        if (billedDurationMinutes !== undefined) {
            session.totalTimeMinutes = billedDurationMinutes;
        } else {
            // Fallback: Calculate duration in minutes from wall clock
            const durationMs = session.endTime - session.startTime;
            session.totalTimeMinutes = Math.ceil(durationMs / 1000 / 60);
        }

        this.currentSessions[index] = session;
        this.saveSessions();
        return session;
    }

    getActiveSession(): GameSession | undefined {
        // Logic for single-session app
        return this.currentSessions.find(s => s.endTime === null);
    }

    getTodaySummary(): DailySummary {
        const today = new Date().toISOString().split('T')[0];
        const finishedSessions = this.currentSessions.filter(s => s.endTime !== null);
        const completedSessions = finishedSessions.filter(s => s.status === 'completed');

        const totalTime = finishedSessions.reduce((acc, curr) => acc + curr.totalTimeMinutes, 0);

        return {
            date: today,
            totalTimeMinutes: totalTime,
            totalGames: completedSessions.length,
            sessions: finishedSessions
        };
    }

    openDay() {
        this.isDayOpen = true;
        // Optional: Archive old sessions if they exist from a previous unclosed day?
        // For now, we keep them as part of the "Current Open Day" bucket.
    }

    closeDayAndExport(laneName: string = ''): void {
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
        const headers = ['ID', 'Inicio', 'Fin', 'Tiempo Inicial (min)', 'Tiempo Extra (min)', 'Duración Total (min)', 'Estado'];
        const detailsData = summary.sessions.map(s => [
            s.id,
            new Date(s.startTime).toLocaleTimeString(),
            s.endTime ? new Date(s.endTime).toLocaleTimeString() : 'N/A',
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

            // Usa un fire-and-forget para no bloquear el cierre en caso de red lenta
            fetch(fetchUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    date: summary.date,
                    totalGames: summary.totalGames,
                    filename: fileName,
                    laneName: laneName, // Pasamos el nombre de la pista a la API
                    excelBase64: excelBase64
                })
            }).then(response => {
                if (response.ok) {
                    console.log('✅ Correo de cierre de caja enviado con éxito');
                } else {
                    response.json().then(err => console.error('❌ Error API al enviar correo:', err));
                }
            }).catch(err => console.error('❌ Error de red enviando correo:', err));
        } catch (e) {
            console.error('Error al generar adjunto para envío:', e);
        }

        // 6. Clear Current Sessions & Close Day
        this.currentSessions = [];
        this.saveSessions();

        this.isDayOpen = false;
    }
}
