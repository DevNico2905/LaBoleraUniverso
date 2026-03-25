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

    endGame(sessionId: string, billedDurationMinutes?: number, status: 'completed' | 'cancelled' = 'completed'): GameSession | null {
        const index = this.currentSessions.findIndex(s => s.id === sessionId);
        if (index === -1) return null;

        const session = this.currentSessions[index];
        session.endTime = Date.now();
        session.status = status;

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

        const totalTime = finishedSessions.reduce((acc, curr) => acc + curr.totalTimeMinutes, 0);

        return {
            date: today,
            totalTimeMinutes: totalTime,
            totalGames: finishedSessions.length,
            sessions: finishedSessions
        };
    }

    openDay() {
        this.isDayOpen = true;
        // Optional: Archive old sessions if they exist from a previous unclosed day?
        // For now, we keep them as part of the "Current Open Day" bucket.
    }

    closeDayAndExport(): void {
        const summary = this.getTodaySummary();

        // 1. Create a Worksheet for Summary
        const summaryData = [
            ['Reporte de Cierre de Caja', summary.date],
            ['Tiempo Total (min)', summary.totalTimeMinutes],
            ['Juegos Totales', summary.totalGames],
            [],
            ['Detalle de Partidas']
        ];

        // 2. Create Header Row for Details
        const headers = ['ID', 'Inicio', 'Fin', 'Duración (min)', 'Estado'];
        const detailsData = summary.sessions.map(s => [
            s.id,
            new Date(s.startTime).toLocaleTimeString(),
            s.endTime ? new Date(s.endTime).toLocaleTimeString() : 'N/A',
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
        XLSX.utils.book_append_sheet(wb, ws, 'Cierre ' + summary.date);

        // 4. Save File Localmente
        const fileName = `Cierre_Caja_${summary.date}.xlsx`;
        XLSX.writeFile(wb, fileName);

        // 5. Enviar por correo vía Vercel API
        try {
            const excelBase64 = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' });

            // Usa un fire-and-forget para no bloquear el cierre en caso de red lenta
            fetch('/api/send-email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    date: summary.date,
                    totalGames: summary.totalGames,
                    filename: fileName,
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
