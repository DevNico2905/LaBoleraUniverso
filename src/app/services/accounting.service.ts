import { Injectable } from '@angular/core';
import { GameSession, DailySummary, PricingConfig } from '../models/accounting.models';
import * as XLSX from 'xlsx';

@Injectable({
    providedIn: 'root'
})
export class AccountingService {
    private readonly STORAGE_KEY = 'bowling_daily_sessions';
    private readonly CONFIG_KEY = 'bowling_pricing_config';
    private readonly STATE_KEY_REMOVED = ''; // Removed

    // Default Config: Adjusted to match reasonable rates.
    // Assuming Colombia due to language, maybe 50,000 COP/hour?
    // Let's use a generic value or allow change. 
    // Code mentions USD/COP mixing in my head but I'll stick to generic units.
    // 60 min = 1 hour.
    private pricingConfig: PricingConfig = {
        halfHourRate: 70000,
        hourRate: 100000,
        currency: 'COP'
    };

    private currentSessions: GameSession[] = [];
    public isDayOpen = false;

    constructor() {
        this.loadSessions();
        this.loadConfig();
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

    private loadConfig() {
        const config = localStorage.getItem(this.CONFIG_KEY);
        if (config) {
            this.pricingConfig = JSON.parse(config);
        }
    }

    saveConfig(config: PricingConfig) {
        this.pricingConfig = config;
        localStorage.setItem(this.CONFIG_KEY, JSON.stringify(config));
    }

    getPricing(): PricingConfig {
        return this.pricingConfig;
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
            amountCollected: 0,
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

        // Standard Game Logic (Block Based) applies to both completed and cancelled games
        // 1 block = 30 minutes
        const blocks = Math.ceil(session.totalTimeMinutes / 30);

        // Every 2 blocks (60 mins) = hourRate
        const hours = Math.floor(blocks / 2);
        // Remainder block = halfHourRate
        const remainder = blocks % 2;

        session.amountCollected = (hours * this.pricingConfig.hourRate) + (remainder * this.pricingConfig.halfHourRate);

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

        const totalRevenue = finishedSessions.reduce((acc, curr) => acc + curr.amountCollected, 0);
        const totalTime = finishedSessions.reduce((acc, curr) => acc + curr.totalTimeMinutes, 0);

        return {
            date: today,
            totalRevenue,
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
            ['Total Recaudado', summary.totalRevenue],
            ['Tiempo Total (min)', summary.totalTimeMinutes],
            ['Juegos Totales', summary.totalGames],
            [],
            ['Detalle de Partidas']
        ];

        // 2. Create Header Row for Details
        const headers = ['ID', 'Inicio', 'Fin', 'Duración (min)', 'Monto', 'Estado'];
        const detailsData = summary.sessions.map(s => [
            s.id,
            new Date(s.startTime).toLocaleTimeString(),
            s.endTime ? new Date(s.endTime).toLocaleTimeString() : 'N/A',
            s.totalTimeMinutes,
            s.amountCollected,
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

        // 4. Save File
        // Using writeFile from xlsx which tries to use browser download or fs in node logic usually
        XLSX.writeFile(wb, `Cierre_Caja_${summary.date}.xlsx`);

        // 5. Clear Current Sessions & Close Day
        this.currentSessions = [];
        this.saveSessions();

        this.isDayOpen = false;
        // saveState removed
    }
}
