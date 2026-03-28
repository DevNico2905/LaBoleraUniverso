import { Component, OnInit, OnDestroy, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { AccountingService } from '../services/accounting.service';
import { DailySummary } from '../models/accounting.models';

interface Frame {
  rolls: (number | null)[];
}

interface Player {
  name: string;
  frames: (number | null)[][]; // Siempre 10 frames, el último con 3 casillas
  completedGames: number[]; // Historial de juegos completados
  currentGameNumber: number; // Número de partida actual (1, 2, 3...)
}

interface CompletedGame {
  gameNumber: number;
  playerName: string;
  score: number;
  timestamp: number;
}

@Component({
  selector: 'app-bowling-scorer',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
      <!-- App Lock Screen REMOVED -->
      <div class="max-w-[100%] mx-3 mt-5">
        <div class="bg-white/10 backdrop-blur-lg rounded-2xl shadow-2xl p-4 border border-white/20">

          <!-- Barra única: antes del juego (jugadores + INICIAR + tiempo), durante el juego (solo timer + botones) -->
          <div class="flex items-center gap-3 mb-4">

            <!-- Sección izquierda: Jugadores (solo antes de iniciar) -->
            <ng-container *ngIf="!gameStarted">
              <svg class="w-6 h-6 text-white shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                <circle cx="9" cy="7" r="4"></circle>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
              </svg>
              <span class="text-white font-semibold whitespace-nowrap">Jugadores: {{ players.length }}/9</span>
              <button
                (click)="addPlayer()"
                [disabled]="players.length >= 9"
                class="kb-focusable bg-green-500 hover:bg-green-600 disabled:bg-gray-500 text-white p-2 rounded-lg transition"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
              </button>
              <button
                (click)="removePlayer()"
                [disabled]="players.length <= 1"
                class="kb-focusable bg-red-500 hover:bg-red-600 disabled:bg-gray-500 text-white p-2 rounded-lg transition"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
              </button>
            </ng-container>

            <!-- Centro: Botón INICIAR JUEGO (solo antes de iniciar) -->
            <button
              *ngIf="!gameStarted"
              (click)="startGame()"
              class="kb-focusable mx-auto bg-green-600 hover:bg-green-700 text-white px-8 py-3 rounded-lg font-bold text-lg transition flex items-center gap-2 shrink-0"
            >
              <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <polygon points="5 3 19 12 5 21 5 3"></polygon>
              </svg>
              INICIAR JUEGO
            </button>

            <!-- Sección derecha: Timer (siempre visible) + opciones de tiempo (solo antes de iniciar) -->
            <div class="flex items-center gap-3 ml-auto">

              <!-- Opciones de tiempo (solo antes de iniciar) -->
              <ng-container *ngIf="!gameStarted">
                <!-- Opción de 30 minutos comentada temporalmente -->
                <!-- <button
                  (click)="changeTimeLimit(30)"
                  [class]="timeLimit === 30 ? 'bg-green-500 text-white' : 'bg-white/20 text-white hover:bg-white/30'"
                  class="kb-focusable px-4 py-2 rounded-lg font-semibold transition"
                >
                  30 min
                </button> -->
                <button
                  (click)="changeTimeLimit(60)"
                  [class]="timeLimit === 60 ? 'bg-green-500 text-white' : 'bg-white/20 text-white hover:bg-white/30'"
                  class="kb-focusable px-4 py-2 rounded-lg font-semibold transition"
                >
                  60 min
                </button>
              </ng-container>

              <!-- Timer -->
              <div class="bg-white/20 rounded-xl px-4 py-2">
                <div class="flex items-center gap-2 text-white">
                  <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10"></circle>
                    <polyline points="12 6 12 12 16 14"></polyline>
                  </svg>
                  <span class="text-2xl font-mono font-bold" [class.text-red-400]="timeRemaining <= 300">
                    {{ formatTime(timeRemaining) }}
                  </span>
                  <span *ngIf="stopPending" class="text-xs bg-red-500 px-2 py-1 rounded ml-2 animate-pulse">ÚLTIMO FRAME</span>
                </div>
              </div>

              <!-- Botón reset (solo antes de iniciar) -->
              <button
                *ngIf="!gameStarted"
                (click)="resetGame()"
                [disabled]="!gameFinished && timeRemaining > 0"
                class="kb-focusable bg-red-500 hover:bg-red-600 text-white p-2 rounded-lg transition disabled:bg-gray-400 disabled:cursor-not-allowed"
                title="Reiniciar juego"
              >
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <polyline points="1 4 1 10 7 10"></polyline>
                  <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
                </svg>
              </button>

              <!-- Botón editar nombres (solo durante el juego) -->
              <button
                *ngIf="gameStarted && !gameFinished"
                (click)="editMode = !editMode"
                [class]="editMode ? 'bg-blue-500 hover:bg-blue-600' : 'bg-green-500 hover:bg-green-600'"
                class="kb-focusable text-white p-2 rounded-lg transition"
                [title]="editMode ? 'Guardar cambios' : 'Editar nombres'"
              >
                <svg *ngIf="!editMode" class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
                </svg>
                <svg *ngIf="editMode" class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path d="M5 13l4 4L19 7"></path>
                </svg>
              </button>

              <!-- Botón cancelar partida (solo durante el juego) -->
              <button
                *ngIf="gameStarted && !gameFinished"
                (click)="openCancelPrompt()"
                class="kb-focusable bg-red-600 hover:bg-red-700 text-white p-2 rounded-lg transition"
                title="Cancelar partida"
              >
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>

              <!-- Botón reset (juego terminado) -->
              <button
                *ngIf="gameFinished"
                (click)="resetGame()"
                class="kb-focusable bg-red-500 hover:bg-red-600 text-white p-3 rounded-lg transition"
                title="Reiniciar juego"
              >
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <polyline points="1 4 1 10 7 10"></polyline>
                  <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
                </svg>
              </button>

            </div>
          </div>

          <div class="bg-gray-900 rounded-xl overflow-hidden shadow-lg mb-4">
            <div class="overflow-x-auto">
              <table class="w-full border-collapse">
                <thead class="bg-linear-to-r from-blue-600 to-purple-600 text-white">
                  <tr>
                    <th class="p-2 text-left font-bold text-sm">Jugador</th>
                    <th *ngFor="let _ of [].constructor(10); let i = index"
                        class="p-1 text-center font-bold text-sm border-l border-white/30">
                      {{ i + 1 }}
                    </th>
                    <th class="p-2 text-center font-bold text-sm border-l-2 border-white bg-green-700">Total</th>
                  </tr>
                </thead>
                <tbody>
                  <tr *ngFor="let player of players; let pIndex = index"
                      [class]="pIndex === currentPlayer ? 'bg-yellow-500/15 border-b border-gray-700' : 'border-b border-gray-700 hover:bg-gray-800'">
                    <td class="p-2 font-semibold text-sm text-white">
                      <span *ngIf="gameStarted && !editMode">{{ player.name || ('Jugador ' + (pIndex + 1)) }}</span>
                      <input *ngIf="!gameStarted || editMode"
                             type="text"
                             [(ngModel)]="player.name"
                             [placeholder]="'Jugador ' + (pIndex + 1)"
                             class="kb-focusable border border-gray-600 rounded px-2 py-1 w-full text-sm bg-gray-800 text-white placeholder:font-normal placeholder:text-gray-400" />
                    </td>
                    <td *ngFor="let frame of player.frames; let i = index"
                        class="border-l border-gray-700 p-0 text-center">
                      <div class="flex flex-col">
                        <!-- Fila de tiros -->
                        <div class="flex items-center justify-center gap-0.5 px-1 pt-1 pb-0.5 border-b border-gray-700">
                          <!-- Frame 10: 3 tiros -->
                          <ng-container *ngIf="i === 9">
                            <span class="text-sm font-bold w-5 text-center text-white rounded transition-all leading-5"
                                  [ngClass]="{'kb-focusable cursor-pointer bg-blue-800 ring-1 ring-blue-400 hover:bg-blue-700': editMode && gameStarted && isRollEditable(pIndex, i, 0)}"
                                  (click)="editMode && gameStarted && isRollEditable(pIndex, i, 0) ? openScoreEditor(pIndex, i, 0) : null">
                              {{ displayRoll(frame[0], null, true) }}
                            </span>
                            <span class="text-gray-600 text-xs">|</span>
                            <span class="text-sm font-bold w-5 text-center text-white rounded transition-all leading-5"
                                  [ngClass]="{'kb-focusable cursor-pointer bg-blue-800 ring-1 ring-blue-400 hover:bg-blue-700': editMode && gameStarted && isRollEditable(pIndex, i, 1)}"
                                  (click)="editMode && gameStarted && isRollEditable(pIndex, i, 1) ? openScoreEditor(pIndex, i, 1) : null">
                              {{ displayRoll(frame[1], frame[0], true) }}
                            </span>
                            <span class="text-gray-600 text-xs">|</span>
                            <span class="text-sm font-bold w-5 text-center text-white rounded transition-all leading-5"
                                  [ngClass]="{'kb-focusable cursor-pointer bg-blue-800 ring-1 ring-blue-400 hover:bg-blue-700': editMode && gameStarted && isRollEditable(pIndex, i, 2)}"
                                  (click)="editMode && gameStarted && isRollEditable(pIndex, i, 2) ? openScoreEditor(pIndex, i, 2) : null">
                              {{ displayRoll(frame[2], frame[1], true) }}
                            </span>
                          </ng-container>
                          <!-- Frames 1-9: 2 tiros -->
                          <ng-container *ngIf="i !== 9">
                            <span class="text-sm font-bold w-6 text-center text-white rounded transition-all leading-5"
                                  [ngClass]="{'kb-focusable cursor-pointer bg-blue-800 ring-1 ring-blue-400 hover:bg-blue-700': editMode && gameStarted && isRollEditable(pIndex, i, 0)}"
                                  (click)="editMode && gameStarted && isRollEditable(pIndex, i, 0) ? openScoreEditor(pIndex, i, 0) : null">
                              {{ displayRoll(frame[0], null, false) }}
                            </span>
                            <span class="text-sm font-bold w-6 text-center text-white rounded transition-all leading-5"
                                  [ngClass]="{'kb-focusable cursor-pointer bg-blue-800 ring-1 ring-blue-400 hover:bg-blue-700': editMode && gameStarted && isRollEditable(pIndex, i, 1)}"
                                  (click)="editMode && gameStarted && isRollEditable(pIndex, i, 1) ? openScoreEditor(pIndex, i, 1) : null">
                              {{ displayRoll(frame[1], frame[0], false) }}
                            </span>
                          </ng-container>
                        </div>
                        <!-- Score acumulado del frame -->
                        <div class="text-base font-bold text-white py-1">
                          {{ getFrameScoreForDisplay(player, i) }}
                        </div>
                      </div>
                    </td>
                    <td class="p-2 text-center font-bold text-lg border-l-2 border-gray-600 bg-green-900/50 text-green-300">
                      {{ getAccumulatedScore(player) }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>


          <!-- <div *ngIf="gameStarted && !gameFinished" class="bg-linear-to-r from-green-500 to-blue-500 rounded-xl p-4 text-white">
            <div class="text-center mb-2">
              <h2 class="text-xl font-bold">
                {{ players[currentPlayer].name }} - Frame {{ currentFrame + 1 }} - Tiro {{ currentRoll + 1 }}
              </h2>
              <p class="text-xs mt-1 opacity-90">Usa el teclado (0-9) o haz clic en los botones</p>
            </div>
            <div class="grid grid-cols-11 gap-2 max-w-2xl mx-auto">
              <button *ngFor="let num of [].constructor(getAvailablePins() + 1); let i = index"
                      (click)="recordPins(i)"
                      class="kb-focusable bg-white text-gray-900 hover:bg-yellow-400 font-bold py-3 px-1 rounded-lg text-lg transition transform hover:scale-105 shadow-lg">
                {{ i }}
              </button>
            </div>
          </div> -->
        </div>
      </div>

      <div *ngIf="showTimeWarning" class="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div data-modal="time-warning" class="bg-gradient-to-brown from-orange-500 to-red-600 rounded-3xl p-8 max-w-md w-full shadow-[0_20px_50px_rgba(0,0,0,0.9)] border-4 border-white/20 transform animate-fadeIn">
          <div class="text-center text-white">
            <div class="text-6xl mb-4 animate-pulse">⏰</div>
            <h2 class="text-3xl font-bold mb-4">¡Atención!</h2>
            <p class="text-xl mb-6">{{ timeWarningMessage }}</p>
            
            <div *ngIf="timeRemaining > 300" class="flex flex-col items-center gap-3">
              <div class="relative w-16 h-16">
                <svg class="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
                  <circle cx="32" cy="32" r="28" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="5"/>
                  <circle cx="32" cy="32" r="28" fill="none" stroke="white" stroke-width="5"
                    stroke-dasharray="175.93"
                    [style.stroke-dashoffset]="175.93 * (1 - warningCountdown / 5)"
                    style="transition: stroke-dashoffset 1s linear;"/>
                </svg>
                <span class="absolute inset-0 flex items-center justify-center text-2xl font-bold text-white">{{ warningCountdown }}</span>
              </div>
              <p class="text-sm text-white/80">Cerrando automáticamente...</p>
            </div>
            
            <div *ngIf="timeRemaining <= 300" class="flex gap-4 justify-center">
              <button 
                (click)="closeTimeWarning()"
                class="kb-focusable bg-white text-orange-600 hover:bg-orange-50 font-bold text-lg px-6 py-3 rounded-xl transition transform hover:scale-105 shadow-lg">
                Continuar
              </button>
              <button 
                *ngIf="!compensationTimeAdded"
                (click)="openPasswordPrompt('add5')"
                class="kb-focusable bg-blue-500 text-white hover:bg-blue-600 font-bold text-lg px-6 py-3 rounded-xl transition transform hover:scale-105 shadow-lg flex items-center gap-2"
                title="Compensar tiempo perdido">
                <!-- <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg> -->
                +5 min
              </button>
              <button 
                *ngIf="!extraTimeAdded"
                (click)="openPasswordPrompt('add60')"
                class="kb-focusable bg-green-500 text-white hover:bg-green-600 font-bold text-lg px-6 py-3 rounded-xl transition transform hover:scale-105 shadow-lg flex items-center gap-2">
                <!-- <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/>
                </svg> -->
                +60 min
              </button>
            </div>
          </div>
        </div>
      </div>

      <div *ngIf="showPasswordPrompt" class="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-60 p-4">
        <div data-modal="password-prompt" class="bg-gradient-to-brown from-blue-500 to-purple-600 rounded-3xl p-8 max-w-md w-full shadow-[0_20px_50px_rgba(0,0,0,0.9)] border-4 border-white/20 transform animate-fadeIn">
          <div class="text-center text-white">
            <div class="text-6xl mb-4">🔐</div>
            <h2 class="text-3xl font-bold mb-4">{{ pendingPasswordAction === 'add60' ? 'Contraseña del Administrador' : 'Autorización de Compensación' }}</h2>
            <p class="text-lg mb-6">{{ pendingPasswordAction === 'add60' ? 'Ingrese la contraseña para agregar 60 minutos' : 'Ingrese la contraseña para agregar 5 minutos de compensación' }}</p>
            
            <input 
              type="password"
              [(ngModel)]="passwordInput"
              (keyup.enter)="validatePassword()"
              placeholder="Contraseña"
              class="kb-focusable w-full px-4 py-3 rounded-xl text-white text-center text-lg font-semibold mb-2 border-2 border-white/40 focus:outline-none focus:ring-4 focus:ring-white/40 placeholder:text-white/80"
              autofocus
            />
            
            <p *ngIf="passwordError" class="text-red-200 bg-red-500/30 rounded-lg px-4 py-2 mb-4 font-semibold">
              ❌ Contraseña incorrecta
            </p>
            
            <div class="flex gap-4 justify-center mt-6">
              <button 
                (click)="cancelPasswordPrompt()"
                class="kb-focusable bg-white/20 text-white hover:bg-white/30 font-bold text-lg px-6 py-3 rounded-xl transition transform hover:scale-105">
                Cancelar
              </button>
              <button 
                (click)="validatePassword()"
                class="kb-focusable bg-white text-purple-600 hover:bg-purple-50 font-bold text-lg px-8 py-3 rounded-xl transition transform hover:scale-105 shadow-lg">
                Confirmar
              </button>
            </div>
          </div>
        </div>
      </div>

      <div *ngIf="gameFinished" class="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div class="bg-gradient-to-brown from-yellow-400 via-orange-500 to-red-500 rounded-3xl p-8 max-w-2xl w-full shadow-2xl transform animate-fadeIn">
          <div class="text-center text-white">
            <div class="text-7xl mb-6 animate-bounce">🎉🏆🎊</div>
            <h2 class="text-5xl font-bold mb-6 drop-shadow-lg">¡Tiempo Terminado!</h2>
            
            <div class="bg-white/20 backdrop-blur rounded-2xl p-6 mb-6 border-2 border-white/30">
              <p class="text-3xl font-semibold mb-3">{{ getWinnerMessage() }}</p>
              <p class="text-6xl font-bold drop-shadow-lg">{{ getWinnerScore() }} puntos</p>
              <p class="text-xl mt-4 opacity-90">Juegos jugados: {{ getTotalGamesPlayed() }}</p>
            </div>

            <div *ngIf="players.length > 1" class="bg-white/10 backdrop-blur rounded-2xl p-6 mb-6">
              <h3 class="text-2xl font-semibold mb-4 flex items-center justify-center gap-2">
                📊 Tabla de Posiciones
              </h3>
              <div class="space-y-3 max-h-64 overflow-y-auto">
                <div *ngFor="let player of getRankedPlayers(); let i = index" 
                     [class]="i === 0 ? 'bg-yellow-400/30 border-2 border-yellow-300' : 'bg-white/10'"
                     class="rounded-xl p-4 flex justify-between items-center transition hover:bg-white/20">
                  <div class="flex items-center gap-4">
                    <span class="text-3xl font-bold w-12">{{ i + 1 }}°</span>
                    <span class="text-xl font-semibold">{{ player.name }}</span>
                  </div>
                  <span class="text-2xl font-bold">{{ player.score }} pts</span>
                </div>
              </div>
            </div>

            <div class="flex gap-4 justify-center">
              <button 
                (click)="resetGame()"
                routerLink=""
                class="kb-focusable bg-white text-orange-600 hover:bg-orange-50 font-bold text-xl px-8 py-4 rounded-xl transition transform hover:scale-105 shadow-lg flex items-center gap-2">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <polyline points="1 4 1 10 7 10"></polyline>
                  <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
                </svg>
                Nueva Partida
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Botón flotante de cancelar REMOVIDO - ahora está inline en el header -->

      <!-- Modal de cancelar partida -->
      <div *ngIf="showCancelPrompt" class="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-60 p-4">
        <div data-modal="cancel-prompt" class="bg-gradient-to-brown from-red-500 to-rose-700 rounded-3xl p-8 max-w-md w-full shadow-[0_20px_50px_rgba(0,0,0,0.9)] border-4 border-white/20 transform animate-fadeIn">
          <div class="text-center text-white">
            <div class="text-6xl mb-4">⚠️</div>
            <h2 class="text-3xl font-bold mb-4">Cancelar Partida</h2>
            <p class="text-lg mb-6">Ingrese la contraseña del administrador para confirmar la cancelación</p>

            <input
              type="password"
              [(ngModel)]="cancelPasswordInput"
              (keyup.enter)="validateCancelPassword()"
              placeholder="Contraseña"
              class="kb-focusable w-full px-4 py-3 rounded-xl text-white text-center text-lg font-semibold mb-2 border-2 border-white/40 focus:outline-none focus:ring-4 focus:ring-white/40 placeholder:text-white/80"
              autofocus
            />

            <p *ngIf="cancelPasswordError" class="text-red-200 bg-red-800/40 rounded-lg px-4 py-2 mb-4 font-semibold">
              ❌ Contraseña incorrecta
            </p>

            <p *ngIf="cancelPasswordSuccess" class="text-green-200 bg-green-800/40 rounded-lg px-4 py-2 mb-4 font-semibold animate-pulse">
              ✅ Juego cancelado
            </p>

            <div class="flex gap-4 justify-center mt-6">
              <button
                (click)="closeCancelPrompt()"
                [disabled]="cancelPasswordSuccess"
                class="kb-focusable bg-white/20 text-white hover:bg-white/30 disabled:opacity-40 disabled:cursor-not-allowed font-bold text-lg px-6 py-3 rounded-xl transition transform hover:scale-105">
                Cancelar
              </button>
              <button
                (click)="validateCancelPassword()"
                [disabled]="cancelPasswordSuccess"
                class="kb-focusable bg-white text-red-600 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed font-bold text-lg px-8 py-3 rounded-xl transition transform hover:scale-105 shadow-lg">
                Confirmar
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Modal para editar puntuación -->
      <div *ngIf="editingScore" class="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-60 p-4">
        <div class="bg-gradient-to-br from-blue-600 to-purple-700 rounded-3xl p-8 max-w-sm w-full shadow-[0_20px_50px_rgba(0,0,0,0.9)] border-4 border-white/20 transform animate-fadeIn">
          <div class="text-center text-white">
            <h2 class="text-3xl font-bold mb-2">Editar Tiro</h2>
            <p class="text-lg mb-6 opacity-90 font-semibold text-yellow-300 shadow-md p-2 bg-black/20 rounded-xl">
              {{ players[editingScore.pIndex].name }} • Frame {{ editingScore.fIndex + 1 }} • Tiro {{ editingScore.rIndex + 1 }}
            </p>
            
            <div class="grid grid-cols-4 gap-3 mb-6">
              <button *ngFor="let num of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]"
                      (click)="saveEditedScore(num)"
                      [disabled]="!isValidEditScore(num)"
                      class="kb-focusable score-edit-btn bg-white text-gray-900 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:bg-white hover:bg-yellow-400 font-bold py-4 px-1 rounded-xl text-xl transition transform hover:scale-105 shadow-lg">
                {{ num === 10 ? 'X' : (num === 0 ? '-' : num) }}
              </button>
            </div>
            
            <div class="flex gap-4 justify-center">
              <button 
                (click)="closeScoreEditor()"
                class="kb-focusable bg-white/20 text-white hover:bg-white/30 font-bold text-lg px-6 py-3 rounded-xl transition transform hover:scale-105">
                Cancelar
              </button>
              <button 
                (click)="clearEditedScore()"
                class="kb-focusable bg-red-500 text-white hover:bg-red-600 font-bold text-lg px-6 py-3 rounded-xl transition transform hover:scale-105 shadow-lg">
                Borrar
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Day Closing Modal REMOVED -->
  `,
  styles: [`
    @keyframes fadeIn {
      from {
        opacity: 0;
        transform: scale(0.9);
      }
      to {
        opacity: 1;
        transform: scale(1);
      }
    }
    .animate-fadeIn {
      animation: fadeIn 0.3s ease-out;
    }
  `]
})
export class BowlingScorerComponent implements OnInit, OnDestroy {
  // Security & Accounting
  // App Lock REMOVED - Managed by Home Component

  // Inicializamos con 10 frames (el último con 3 espacios)
  players: Player[] = [{
    name: '',
    frames: this.createInitialFrames(),
    completedGames: [],
    currentGameNumber: 1
  }];

  currentPlayer = 0;
  currentFrame = 0;
  currentRoll = 0;

  initialTimeLimit = 60; // Anteriormente 30
  addedTimeLimit = 0;
  timeLimit = 60; // Anteriormente 30
  timeRemaining = 60 * 60; // Anteriormente 30 * 60
  isTimerRunning = false;
  private targetEndTime: number | null = null;
  gameStarted = false;
  gameFinished = false;
  stopPending = false;

  showTimeWarning = false;
  timeWarningMessage = '';
  warningCountdown = 5;
  private warningCountdownInterval: any = null;
  showPasswordPrompt = false;
  passwordInput = '';
  correctPassword = 'admin123';
  passwordError = false;
  extraTimeAdded = false;
  compensationTimeAdded = false;
  pendingPasswordAction: 'add60' | 'add5' = 'add60';

  editMode = false;
  editingScore: { pIndex: number, fIndex: number, rIndex: number } | null = null;

  showCancelPrompt = false;
  cancelPasswordInput = '';
  cancelPasswordError = false;
  cancelPasswordSuccess = false;

  get hasCompletedGames(): boolean {
    return this.players.length > 0 && this.players[0].completedGames.length > 0;
  }

  private alertedAt15 = false;
  private alertedAt5 = false;

  private timerInterval: any;

  constructor(
    private router: Router,
    private accountingService: AccountingService,
    private authService: AuthService
  ) { }

  ngOnInit() {
    // Security Check: Redirect if day is not open
    if (!this.accountingService.isDayOpen) {
      this.router.navigate(['']);
      return;
    }
    this.startTimer();
  }

  ngOnDestroy() {
    this.stopTimer();
    if (this.warningCountdownInterval) {
      clearInterval(this.warningCountdownInterval);
    }
  }

  // Permite al Router saber si se puede salir de la ruta o no
  canDeactivate(): boolean {
    if (this.gameStarted && !this.gameFinished) {
      return confirm('Hay un juego en curso. ¿Estas seguro de retroceder y salir de la partida? Si lo haces el progreso se perderá.');
    }
    return true;
  }

  // Crea 10 frames: 9 con 2 casillas y el último con 3
  private createInitialFrames(): (number | null)[][] {
    const frames: (number | null)[][] = [];
    // Frames 1-9: 2 casillas
    for (let i = 0; i < 9; i++) {
      frames.push([null, null]);
    }
    // Frame 10: 3 casillas
    frames.push([null, null, null]);
    return frames;
  }

  @HostListener('window:beforeunload', ['$event'])
  unloadNotification(event: BeforeUnloadEvent) {
    if (this.gameStarted && !this.gameFinished) {
      event.preventDefault();
      event.returnValue = 'Hay un juego en curso. ¿Estás seguro de salir?';
      return 'Hay un juego en curso. ¿Estás seguro de salir?';
    }
    return undefined;
  }

  @HostListener('window:keydown', ['$event'])
  handleKeyPress(event: KeyboardEvent) {
    // Si el juego está en curso, bloquear F5, Ctrl+R / Cmd+R y Ctrl+W / Cmd+W
    if (this.gameStarted && !this.gameFinished) {
      const isF5 = event.key === 'F5' || event.code === 'F5' || event.keyCode === 116;
      const isReload = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'r';
      const isClose = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'w';
      
      if (isF5 || isReload || isClose) {
        event.preventDefault();
        event.stopPropagation();
        event.returnValue = false;
        return;
      }
    }

    if (!this.gameStarted || this.gameFinished || this.editMode || this.showPasswordPrompt || this.showCancelPrompt) return;

    // Ignorar comandos con Ctrl, Cmd o Alt (como zoom: ctrl+-, ctrl++)
    if (event.ctrlKey || event.metaKey || event.altKey) return;

    let num = parseInt(event.key);
    
    // Mapear teclas especiales de bolos
    if (event.key.toLowerCase() === 'x') {
      num = 10;
    }

    if (!isNaN(num) && num >= 0 && num <= this.getAvailablePins()) {
      this.recordPins(num);
    }
  }

  startTimer() {
    this.timerInterval = setInterval(() => {
      if (this.isTimerRunning && this.targetEndTime !== null && this.timeRemaining > 0) {
        const now = Date.now();
        const diffSeconds = Math.max(0, Math.ceil((this.targetEndTime - now) / 1000));

        if (this.timeRemaining !== diffSeconds) {
          this.timeRemaining = diffSeconds;

          // Alertas de tiempo (mejoradas para pestañas inactivas)
          if (this.timeRemaining <= 900 && !this.alertedAt15) {
            this.alertedAt15 = true;
            this.timeWarningMessage = '¡Quedan 15 minutos de juego!';
            this.showTimeWarning = true;
            this.startWarningCountdown();
            this.focusModal('[data-modal="time-warning"]');
          }

          if (this.timeRemaining <= 300 && !this.alertedAt5) {
            this.alertedAt5 = true;
            this.timeWarningMessage = '¡Quedan solo 5 minutos de juego!';
            this.showTimeWarning = true;
            this.focusModal('[data-modal="time-warning"]');
          }

          // Cuando el tiempo llega a 0, NO paramos inmediatamente.
          // Activamos la bandera para terminar al final del frame actual.
          if (this.timeRemaining === 0) {
            this.stopPending = true;
          }
        }
      }
    }, 500); // Revisión más rápida para actualizar cuando la pestaña vuelve a ser activa
  }

  stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }
  }

  formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  // Métodos de Modales (sin cambios mayores)
  closeTimeWarning() {
    this.showTimeWarning = false;
    if (this.warningCountdownInterval) {
      clearInterval(this.warningCountdownInterval);
      this.warningCountdownInterval = null;
    }
    this.warningCountdown = 5;
  }

  startWarningCountdown() {
    this.warningCountdown = 5;
    if (this.warningCountdownInterval) {
      clearInterval(this.warningCountdownInterval);
    }
    this.warningCountdownInterval = setInterval(() => {
      this.warningCountdown--;
      if (this.warningCountdown <= 0) {
        this.closeTimeWarning();
      }
    }, 1000);
  }

  /** Mueve el foco al primer elemento kb-focusable dentro del selector del modal dado. */
  private focusModal(modalSelector: string) {
    setTimeout(() => {
      const modal = document.querySelector(modalSelector);
      if (!modal) return;
      const focusable = modal.querySelector<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusable) {
        document.querySelectorAll('.kb-focused').forEach(el => el.classList.remove('kb-focused'));
        focusable.classList.add('kb-focused');
        focusable.focus();
      }
    }, 50);
  }

  openPasswordPrompt(action: 'add60' | 'add5' = 'add60') { 
    this.pendingPasswordAction = action;
    this.showPasswordPrompt = true; 
    this.passwordInput = ''; 
    this.passwordError = false;
    this.focusModal('[data-modal="password-prompt"]');
  }
  cancelPasswordPrompt() { this.showPasswordPrompt = false; }

  openCancelPrompt() {
    this.showCancelPrompt = true;
    this.cancelPasswordInput = '';
    this.cancelPasswordError = false;
    this.focusModal('[data-modal="cancel-prompt"]');
  }
  closeCancelPrompt() { this.showCancelPrompt = false; }

  validateCancelPassword() {
    if (this.cancelPasswordInput === this.correctPassword) {
      this.cancelPasswordSuccess = true;

      // Accounting Hook: Mark as Cancelled
      if (this.currentSessionId) {
        const billedMinutes = this.calculateBilledDuration();
        this.accountingService.endGame(this.currentSessionId, billedMinutes, 'cancelled', this.initialTimeLimit, this.addedTimeLimit);
        this.currentSessionId = null;
      }

      setTimeout(() => {
        this.resetGame();
        this.router.navigate(['']);
      }, 1500);
    } else {
      this.cancelPasswordError = true;
    }
  }

  validatePassword() {
    if (this.passwordInput === this.correctPassword) {
      if (this.pendingPasswordAction === 'add5') {
        this.timeRemaining += 5 * 60;
        this.timeLimit += 5;
        this.addedTimeLimit += 5;
        if (this.targetEndTime !== null) {
          this.targetEndTime += 5 * 60 * 1000;
        }
        this.compensationTimeAdded = true;
      } else {
        this.timeRemaining += 60 * 60;
        this.timeLimit += 60;
        this.addedTimeLimit += 60;
        if (this.targetEndTime !== null) {
          this.targetEndTime += 60 * 60 * 1000;
        }
        this.extraTimeAdded = true;
      }
      this.alertedAt15 = false;
      this.alertedAt5 = false;
      this.stopPending = false; // Si agregaron tiempo, cancelamos el paro pendiente
      this.showPasswordPrompt = false;
      this.showTimeWarning = false;
    } else {
      this.passwordError = true;
    }
  }

  addPlayer() {
    if (this.players.length < 9 && !this.gameStarted) {
      this.players.push({
        name: '',
        frames: this.createInitialFrames(),
        completedGames: [],
        currentGameNumber: 1
      });
    }
  }

  removePlayer() {
    if (this.players.length > 1 && !this.gameStarted) {
      this.players = this.players.slice(0, -1);
    }
  }

  // --- SECURITY & ACCOUNTING METHODS ---

  // Unlock App Method REMOVED

  // Hook into Start Game
  private currentSessionId: string | null = null;

  // Hooks for accounting will be added to existing methods below

  // --- LÓGICA DE PUNTUACIÓN MODIFICADA PARA JUEGO CLÁSICO CON PARTIDAS MÚLTIPLES ---

  calculateFrameScore(playerFrames: (number | null)[][], frameIndex: number): number | null {
    const frame = playerFrames[frameIndex];
    if (!frame) return null;

    // FRAME 10 (índice 9): Lógica especial con 3 tiros
    if (frameIndex === 9) {
      const [roll1, roll2, roll3] = frame;

      if (roll1 === null) return null;

      // Strike en primer tiro
      if (roll1 === 10) {
        if (roll2 === null || roll3 === null) return null;
        return roll1 + roll2 + roll3;
      }

      // Spare en primeros dos tiros
      if (roll2 !== null && roll1 + roll2 === 10) {
        if (roll3 === null) return null;
        return roll1 + roll2 + roll3;
      }

      // Sin strike ni spare
      if (roll2 === null) return null;
      return roll1 + roll2;
    }

    // FRAMES 1-9: Lógica clásica
    const [roll1, roll2] = frame;

    if (roll1 === null) return null;

    // Strike (10 puntos + siguientes 2 tiros)
    if (roll1 === 10) {
      const nextFrame = playerFrames[frameIndex + 1];
      if (!nextFrame || nextFrame[0] === null) return null;

      let score = 10 + nextFrame[0];

      // Si siguiente es strike y no es frame 10
      if (nextFrame[0] === 10 && frameIndex + 1 !== 9) {
        const nextNextFrame = playerFrames[frameIndex + 2];
        if (!nextNextFrame || nextNextFrame[0] === null) return null;
        score += nextNextFrame[0];
      } else {
        // Si siguiente es frame 10 o no es strike
        if (nextFrame[1] === null) return null;
        score += nextFrame[1];
      }
      return score;
    }

    // Spare (10 puntos + siguiente 1 tiro)
    if (roll2 === null) return null;

    if (roll1 + roll2 === 10) {
      const nextFrame = playerFrames[frameIndex + 1];
      if (!nextFrame || nextFrame[0] === null) return null;
      return 10 + nextFrame[0];
    }

    // Frame abierto
    return roll1 + roll2;
  }

  calculateTotalScore(playerFrames: (number | null)[][]): number {
    let total = 0;
    // Calculamos puntuación de los 10 frames (0-9)
    for (let i = 0; i < 10; i++) {
      const frameScore = this.calculateFrameScore(playerFrames, i);
      if (frameScore !== null) {
        total += frameScore;
      }
    }
    return total;
  }

  // Obtiene el score acumulado de todas las partidas completadas + la actual
  getAccumulatedScore(player: Player): number {
    const completedTotal = player.completedGames.reduce((sum, score) => sum + score, 0);
    const currentGameScore = this.calculateTotalScore(player.frames);
    return completedTotal + currentGameScore;
  }

  // Obtiene el número de juego actual
  getCurrentGameNumber(): number {
    return this.players[0]?.currentGameNumber || 1;
  }

  getFrameScoreForDisplay(player: Player, frameIndex: number): number | null {
    // frameIndex debe estar entre 0-9
    if (frameIndex < 0 || frameIndex > 9) return null;

    let cumulative = 0;

    // Recalcular hasta el índice deseado para obtener el acumulado correcto
    for (let i = 0; i <= frameIndex; i++) {
      const frameScore = this.calculateFrameScore(player.frames, i);
      if (frameScore === null) {
        return null; // Si un frame anterior está incompleto, no mostramos totales futuros
      } else {
        cumulative += frameScore;
      }
    }

    // Verificamos si el frame actual ya tiene score calculado
    if (this.calculateFrameScore(player.frames, frameIndex) === null) return null;

    return cumulative;
  }

  recordPins(pins: number) {
    if (!this.gameStarted || this.gameFinished) return;

    // VALIDACIÓN 1: Pinos deben estar entre 0 y 10
    if (pins < 0 || pins > 10) {
      console.error('Error: Los pinos deben estar entre 0 y 10');
      return;
    }

    // Asegurar que el frame existe
    if (!this.players[this.currentPlayer].frames[this.currentFrame]) {
      return;
    }

    const frame = [...this.players[this.currentPlayer].frames[this.currentFrame]];

    // ===== LÓGICA ESPECIAL PARA FRAME 10 =====
    if (this.currentFrame === 9) {
      // Frame 10 tiene hasta 3 tiros
      if (this.currentRoll === 0) {
        // Primer tiro del frame 10
        frame[0] = pins;
        this.players[this.currentPlayer].frames[this.currentFrame] = frame;

        if (pins === 10) {
          // Strike! Continuar al segundo tiro
          this.currentRoll = 1;
        } else {
          // No es strike, continuar al segundo tiro
          this.currentRoll = 1;
        }
      } else if (this.currentRoll === 1) {
        // Segundo tiro del frame 10

        // Validación: si el primer tiro no fue strike, la suma no puede exceder 10
        if (frame[0] !== null && frame[0] !== 10 && frame[0] + pins > 10) {
          console.error(`Error: No puedes derribar ${pins} pinos. Solo quedan ${10 - frame[0]} pinos disponibles.`);
          return;
        }

        frame[1] = pins;
        this.players[this.currentPlayer].frames[this.currentFrame] = frame;

        // Verificar si hay tercer tiro
        const needsThirdRoll = frame[0] === 10 || (frame[0] !== null && frame[0] + pins === 10);

        if (needsThirdRoll) {
          this.currentRoll = 2;
        } else {
          // No hay tercer tiro, pasar al siguiente jugador
          this.moveToNextTurn();
        }
      } else if (this.currentRoll === 2) {
        // Tercer tiro del frame 10

        // Validación: si el segundo tiro no fue strike (y el primero sí), la suma del 2do y 3ro no puede exceder 10
        if (frame[0] === 10 && frame[1] !== null && frame[1] !== 10 && frame[1] + pins > 10) {
          console.error(`Error: No puedes derribar ${pins} pinos. Solo quedan ${10 - frame[1]} pinos disponibles.`);
          return;
        }

        frame[2] = pins;
        this.players[this.currentPlayer].frames[this.currentFrame] = frame;
        this.moveToNextTurn();
      }
      return;
    }

    // ===== LÓGICA PARA FRAMES 1-9 (CLÁSICA) =====

    // VALIDACIÓN 2: En segundo tiro, suma no puede exceder 10 (excepto si primer tiro fue strike)
    if (this.currentRoll === 1 && frame[0] !== null && frame[0] !== 10) {
      if (frame[0] + pins > 10) {
        console.error(`Error: No puedes derribar ${pins} pinos. Solo quedan ${10 - frame[0]} pinos disponibles.`);
        return;
      }
    }

    if (this.currentRoll === 0) {
      frame[0] = pins;
      this.players[this.currentPlayer].frames[this.currentFrame] = frame;

      if (pins === 10) {
        // Strike! Pasar turno (no hay segundo tiro en frames 1-9)
        this.moveToNextTurn();
      } else {
        this.currentRoll = 1;
      }
    } else {
      frame[1] = pins;
      this.players[this.currentPlayer].frames[this.currentFrame] = frame;
      this.moveToNextTurn();
    }
  }

  moveToNextTurn() {
    // 1. Cambiar Jugador
    if (this.currentPlayer < this.players.length - 1) {
      this.currentPlayer++;
      this.currentRoll = 0;
    }
    // 2. Si todos jugaron este frame, avanzar al siguiente frame
    else {
      // Verificar si el tiempo se acabó y estamos al final de la ronda de jugadores
      if (this.stopPending) {
        this.finishGame();
        return;
      }

      this.currentPlayer = 0;
      this.currentFrame++;
      this.currentRoll = 0;

      // 3. Si completamos los 10 frames (currentFrame ahora es 10), iniciar nueva partida
      if (this.currentFrame === 10) {
        this.startNewGame();
      }
    }
  }

  // Inicia una nueva partida al completar los 10 frames
  startNewGame() {
    // Guardar el score de la partida completada para cada jugador
    this.players.forEach(player => {
      const gameScore = this.calculateTotalScore(player.frames);
      player.completedGames.push(gameScore);
      player.currentGameNumber++;
      // Resetear frames para la nueva partida
      player.frames = this.createInitialFrames();
    });

    // Resetear estado del juego
    this.currentFrame = 0;
    this.currentRoll = 0;
    this.currentPlayer = 0;
    // El tiempo continúa corriendo
  }

  // Helper to calculate billed duration based on timer
  private calculateBilledDuration(): number {
    // Se cobra siempre el tiempo total seleccionado originalmente, 
    // sin importar si canceló antes de tiempo o cuánto tiempo real usó.
    return this.timeLimit;
  }

  finishGame() {
    this.isTimerRunning = false;
    this.targetEndTime = null;
    this.gameFinished = true;
    this.stopTimer();

    // Accounting Hook
    if (this.currentSessionId) {
      const billedMinutes = this.calculateBilledDuration();
      this.accountingService.endGame(this.currentSessionId, billedMinutes, 'completed', this.initialTimeLimit, this.addedTimeLimit);
      this.currentSessionId = null;
    }
  }

  resetGame() {
    // Accounting Hook: If resetting an active game (and not already handled by cancel), close as cancelled
    // This is a fallback or for development reset.
    if (this.gameStarted && !this.gameFinished && this.currentSessionId) {
      const billedMinutes = this.calculateBilledDuration();
      this.accountingService.endGame(this.currentSessionId, billedMinutes, 'cancelled', this.initialTimeLimit, this.addedTimeLimit);
      this.currentSessionId = null;
    }

    this.players = [{
      name: '',
      frames: this.createInitialFrames(),
      completedGames: [],
      currentGameNumber: 1
    }];
    this.currentPlayer = 0;
    this.currentFrame = 0;
    this.currentRoll = 0;
    this.timeLimit = this.initialTimeLimit || 30;
    this.addedTimeLimit = 0;
    this.timeRemaining = this.timeLimit * 60;
    this.isTimerRunning = false;
    this.targetEndTime = null;
    this.gameStarted = false;
    this.gameFinished = false;
    this.stopPending = false;
    this.showTimeWarning = false;
    this.timeWarningMessage = '';
    this.alertedAt15 = false;
    this.alertedAt5 = false;
    this.showPasswordPrompt = false;
    this.passwordInput = '';
    this.passwordError = false;
    this.extraTimeAdded = false;
    this.compensationTimeAdded = false;
    this.editMode = false;
    this.showCancelPrompt = false;
    this.cancelPasswordInput = '';
    this.cancelPasswordError = false;
    this.cancelPasswordSuccess = false;
    this.editingScore = null;

    // Ensure timer restarts if needed (though existing logic stops it)
    this.startTimer();
  }

  startGame() {
    this.gameStarted = true;
    this.isTimerRunning = true;
    this.targetEndTime = Date.now() + (this.timeRemaining * 1000);

    // Accounting Hook
    this.currentSessionId = this.accountingService.startGame(this.players.length);
  }

  changeTimeLimit(minutes: number) {
    if (!this.gameStarted) {
      this.initialTimeLimit = minutes;
      this.timeLimit = minutes;
      this.timeRemaining = minutes * 60;
    }
  }

  getAvailablePins(): number {
    const frame = this.players[this.currentPlayer].frames[this.currentFrame];

    // Frame 10: lógica especial
    if (this.currentFrame === 9) {
      if (this.currentRoll === 0) return 10; // Primer tiro: siempre 10
      if (this.currentRoll === 1) {
        // Segundo tiro: si hubo strike, resetea a 10; sino, lo que queda
        return frame[0] === 10 ? 10 : 10 - (frame[0] || 0);
      }
      if (this.currentRoll === 2) {
        // Tercer tiro: si el segundo fue strike, resetea a 10; sino, lo que queda
        return frame[1] === 10 ? 10 : 10 - (frame[1] || 0);
      }
    }

    // Frames 1-9: lógica clásica
    if (this.currentRoll === 0) return 10;
    return 10 - (frame[0] || 0);
  }

  displayRoll(roll: number | null, previousRoll: number | null, isFrame10: boolean = false): string {
    if (roll === null) return '';

    // Frame 10: mostrar siempre el número o X
    if (isFrame10) {
      if (roll === 10) return 'X';
      if (roll === 0) return '-';
      return roll.toString();
    }

    // Frames 1-9: lógica clásica
    const isFirstRoll = (previousRoll === null || previousRoll === 10);

    // Strike (10 pinos en primer tiro)
    if (roll === 10 && isFirstRoll) return 'X';

    // Spare (completa 10 con el primer tiro)
    if (!isFirstRoll && previousRoll !== null && previousRoll + roll === 10) return '/';

    // Número normal (mostrar "-" cuando es 0)
    return roll === 0 ? '-' : roll.toString();
  }

  // --- LÓGICA DE GANADORES (Sin cambios mayores) ---

  getWinnerMessage(): string {
    const winners = this.getWinners();
    if (winners.length === 1) {
      return `🏆 ¡Felicitaciones ${winners[0].name}!`;
    } else {
      const names = winners.map(w => w.name).join(' y ');
      return `🏆 ¡Empate entre ${names}!`;
    }
  }

  getWinnerScore(): number {
    const winners = this.getWinners();
    return winners.length > 0 ? winners[0].score : 0;
  }

  getWinners(): { name: string; score: number }[] {
    const playersWithScores = this.players.map(player => ({
      name: player.name,
      score: this.getAccumulatedScore(player) // Usar score acumulado en lugar del juego actual
    }));

    const maxScore = Math.max(...playersWithScores.map(p => p.score));
    return playersWithScores.filter(p => p.score === maxScore);
  }

  getRankedPlayers(): { name: string; score: number }[] {
    return this.players
      .map(player => ({
        name: player.name,
        score: this.getAccumulatedScore(player) // Usar score acumulado en lugar del juego actual
      }))
      .sort((a, b) => b.score - a.score);
  }

  // --- LÓGICA DE EDICIÓN DE TIROS ---
  isRollEditable(pIndex: number, fIndex: number, rIndex: number): boolean {
    if (this.gameFinished) return true; // (Optional rule, usually editMode is only false when game is finished)
    if (fIndex < this.currentFrame) return true;
    if (fIndex > this.currentFrame) return false;

    // fIndex === this.currentFrame
    if (pIndex < this.currentPlayer) return true;
    if (pIndex > this.currentPlayer) return false;

    // pIndex === this.currentPlayer && fIndex === this.currentFrame
    return rIndex <= this.currentRoll;
  }

  openScoreEditor(pIndex: number, fIndex: number, rIndex: number) {
    this.editingScore = { pIndex, fIndex, rIndex };
    setTimeout(() => {
      document.querySelectorAll('.kb-focused').forEach(el => el.classList.remove('kb-focused'));
      const buttons = Array.from(document.querySelectorAll('.score-edit-btn')) as HTMLButtonElement[];
      const firstEnabled = buttons.find(b => !b.disabled);
      if (firstEnabled) {
        firstEnabled.classList.add('kb-focused');
      }
    }, 50);
  }

  closeScoreEditor() {
    this.editingScore = null;
    setTimeout(() => {
      document.querySelectorAll('.kb-focused').forEach(el => el.classList.remove('kb-focused'));
    }, 10);
  }

  clearEditedScore() {
    if (!this.editingScore) return;
    const { pIndex, fIndex, rIndex } = this.editingScore;
    this.players[pIndex].frames[fIndex][rIndex] = null;
    this.closeScoreEditor();
  }

  isValidEditScore(pins: number): boolean {
    if (!this.editingScore) return false;
    const { pIndex, fIndex, rIndex } = this.editingScore;
    const frame = this.players[pIndex].frames[fIndex];

    if (fIndex === 9) {
      if (rIndex === 0) return true;
      if (rIndex === 1) {
        if (frame[0] === 10) return true; 
        if (frame[0] === null) return pins <= 10;
        return frame[0] + pins <= 10;
      }
      if (rIndex === 2) {
        if (frame[1] === 10) return true;
        if (frame[1] === null) return pins <= 10;
        if (frame[0] === 10 && frame[1] !== 10) return frame[1] + pins <= 10;
        return pins <= 10;
      }
    } else {
      if (rIndex === 0) return true;
      if (rIndex === 1) {
        if (frame[0] === 10) return false; 
        if (frame[0] === null) return pins <= 10;
        return frame[0] + pins <= 10;
      }
    }
    return true;
  }

  saveEditedScore(pins: number) {
    if (!this.editingScore) return;
    const { pIndex, fIndex, rIndex } = this.editingScore;
    let frame = [...this.players[pIndex].frames[fIndex]];
    frame[rIndex] = pins;

    // Ajustes automáticos para frames 1-9
    if (fIndex < 9) {
      // Si pusimos strike en el primer tiro, el segundo se anula
      if (rIndex === 0 && pins === 10) {
        frame[1] = null;
      } else if (rIndex === 0 && frame[1] !== null && pins + frame[1] > 10) {
        // En caso que el nuevo primer tiro + el segundo original supere 10 pines, descartamos el segundo
        frame[1] = null; 
      }
    }

    // Ajustes automáticos para el frame 10
    if (fIndex === 9) {
      if (rIndex === 0 && pins + (frame[1] || 0) > 10 && pins !== 10) {
        frame[1] = null;
        frame[2] = null;
      }
      if (rIndex === 1 && frame[0] === 10 && pins + (frame[2] || 0) > 10 && pins !== 10) {
        frame[2] = null;
      }
    }

    this.players[pIndex].frames[fIndex] = frame;

    // Recalcular currentRoll si la edición afecta al turno actual del jugador activo.
    // Esto evita que el juego quede esperando un tiro que ya no corresponde
    // (p.ej. cuando se corrige un "1" por "X" en el primer tiro del frame actual).
    if (pIndex === this.currentPlayer && fIndex === this.currentFrame) {
      this.recalculateCurrentRoll();
    }

    this.closeScoreEditor();
  }

  /** Recalcula currentRoll basándose en el estado real del frame activo. */
  private recalculateCurrentRoll() {
    const frame = this.players[this.currentPlayer].frames[this.currentFrame];

    if (this.currentFrame === 9) {
      // Frame 10: avanzar hasta el primer null, máximo tiro 2
      if (frame[0] === null) { this.currentRoll = 0; return; }
      if (frame[1] === null) { this.currentRoll = 1; return; }
      if (frame[2] === null) {
        // Solo hay tercer tiro si hubo strike o spare en los dos primeros
        const needsThird = frame[0] === 10 || (frame[0] !== null && frame[1] !== null && frame[0] + frame[1] === 10);
        this.currentRoll = needsThird ? 2 : 2; // en frame 10 si roll2 está lleno y no necesita 3ro, moveToNextTurn ya lo gestionó
      }
      return;
    }

    // Frames 1-9
    if (frame[0] === null) {
      this.currentRoll = 0;
    } else if (frame[0] === 10) {
      // Strike: el frame ya está completo, no hay segundo tiro
      // Esto significa que el turno de este jugador ya terminó.
      // moveToNextTurn no se llamará de nuevo automáticamente, así que
      // simplemente ponemos currentRoll = 0 reflejando que el frame "se completó
      // implícitamente" y el próximo input irá al siguiente jugador/frame.
      // Como la UI no tiene botones de input, el siguiente keydown llamará a
      // recordPins que evalúa currentRoll. Si está en 0 y el frame[0] ya es 10,
      // debería haber avanzado. Para corregir eso, forzamos moveToNextTurn.
      this.currentRoll = 0;
      // El frame ya tiene strike guardado; forzar avance de turno.
      this.moveToNextTurn();
    } else if (frame[1] === null) {
      this.currentRoll = 1;
    } else {
      // Ambos tiros llenos (frame abierto o spare completado), turno terminado.
      this.currentRoll = 0;
      this.moveToNextTurn();
    }
  }

  getTotalGamesPlayed(): number {
    // Retorna el número de juegos completados + si hay un juego en progreso
    if (this.players.length === 0) return 0;

    const completedGames = this.players[0].completedGames.length;
    const hasCurrentGame = this.currentFrame > 0 || this.players.some(p =>
      p.frames.some(f => f.some(roll => roll !== null))
    );

    return completedGames + (hasCurrentGame ? 1 : 0);
  }
}