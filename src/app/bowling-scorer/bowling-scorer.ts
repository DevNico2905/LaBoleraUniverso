import { Component, OnInit, OnDestroy, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

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
      <div class="max-w-[95%] m-auto ">
        <div class="bg-white/10 backdrop-blur-lg rounded-2xl shadow-2xl p-8 border border-white/20">
          <div class="flex justify-between items-center mb-8">
            <h1 class="text-4xl font-bold text-white flex items-center gap-3">
              🎳 Sistema de Puntuación - Juego #{{ getCurrentGameNumber() }}
            </h1>
            <div class="flex items-center gap-4">
              <div class="bg-white/20 rounded-xl px-6 py-3">
                <div class="flex items-center gap-2 text-white">
                  <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10"></circle>
                    <polyline points="12 6 12 12 16 14"></polyline>
                  </svg>
                  <span class="text-3xl font-mono font-bold" [class.text-red-400]="timeRemaining <= 300">
                    {{ formatTime(timeRemaining) }}
                  </span>
                  <span *ngIf="stopPending" class="text-xs bg-red-500 px-2 py-1 rounded ml-2 animate-pulse">ÚLTIMO FRAME</span>
                </div>
              </div>
              <div *ngIf="!gameStarted" class="flex gap-2">
                <button
                  (click)="changeTimeLimit(30)"
                  [class]="timeLimit === 30 ? 'bg-green-500 text-white' : 'bg-white/20 text-white hover:bg-white/30'"
                  class="px-4 py-2 rounded-lg font-semibold transition"
                >
                  30 min
                </button>
                <button
                  (click)="changeTimeLimit(60)"
                  [class]="timeLimit === 60 ? 'bg-green-500 text-white' : 'bg-white/20 text-white hover:bg-white/30'"
                  class="px-4 py-2 rounded-lg font-semibold transition"
                >
                  60 min
                </button>
              </div>

              <button
                *ngIf="!gameStarted"
                (click)="resetGame()"
                [disabled]="!gameFinished && timeRemaining > 0"
                class="bg-red-500 hover:bg-red-600 text-white p-3 rounded-lg transition disabled:bg-gray-400 disabled:cursor-not-allowed"
                title="Reiniciar juego"
              >
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <polyline points="1 4 1 10 7 10"></polyline>
                  <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
                </svg>
              </button>
              <button
                *ngIf="gameStarted && !gameFinished"
                (click)="editMode = !editMode"
                [class]="editMode ? 'bg-blue-500 hover:bg-blue-600' : 'bg-green-500 hover:bg-green-600'"
                class="text-white p-3 rounded-lg transition"
                [title]="editMode ? 'Guardar cambios' : 'Editar nombres'"
              >
                <svg *ngIf="!editMode" class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
                </svg>
                <svg *ngIf="editMode" class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path d="M5 13l4 4L19 7"></path>
                </svg>
              </button>
              <button
                *ngIf="gameFinished"
                (click)="resetGame()"
                class="bg-red-500 hover:bg-red-600 text-white p-3 rounded-lg transition"
                title="Reiniciar juego"
              >
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <polyline points="1 4 1 10 7 10"></polyline>
                  <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
                </svg>
              </button>
            </div>
          </div>

          <div *ngIf="!gameStarted" class="mb-6 flex items-center gap-4 bg-white/10 rounded-xl p-4">
            <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
              <circle cx="9" cy="7" r="4"></circle>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
            </svg>
            <span class="text-white font-semibold">Jugadores: {{ players.length }}/9</span>
            <button
              (click)="addPlayer()"
              [disabled]="players.length >= 9"
              class="bg-green-500 hover:bg-green-600 disabled:bg-gray-500 text-white p-2 rounded-lg transition"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
            </button>
            <button
              (click)="removePlayer()"
              [disabled]="players.length <= 1"
              class="bg-red-500 hover:bg-red-600 disabled:bg-gray-500 text-white p-2 rounded-lg transition"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
            </button>
            <button
              (click)="startGame()"
              class="ml-auto bg-green-600 hover:bg-green-700 text-white px-8 py-3 rounded-lg font-bold text-lg transition flex items-center gap-2"
            >
              <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <polygon points="5 3 19 12 5 21 5 3"></polygon>
              </svg>
              INICIAR JUEGO
            </button>
          </div>

          <div class="bg-white rounded-xl overflow-hidden shadow-lg mb-6">
            <div class="overflow-x-auto">
              <table class="w-full">
                <thead class="bg-linear-to-r from-blue-600 to-purple-600 text-white">
                  <tr>
                    <th class="p-4 text-left font-bold">Jugador</th>
                    <th *ngFor="let _ of [].constructor(10); let i = index" 
                        class="p-4 text-center font-bold border-l border-white/30">
                      {{ i + 1 }}
                    </th>
                    <th class="p-4 text-center font-bold border-l-2 border-white">Juego Actual</th>
                    <th *ngIf="hasCompletedGames" class="p-4 text-center font-bold border-l border-white/30 bg-green-700">Total Acumulado</th>
                  </tr>
                </thead>
                <tbody>
                  <tr *ngFor="let player of players; let pIndex = index"
                      [class]="pIndex === currentPlayer ? 'bg-yellow-100 border-b border-gray-200' : 'border-b border-gray-200 hover:bg-gray-50'">
                    <td class="p-4 font-semibold">
                      <span *ngIf="gameStarted && !editMode">{{ player.name }}</span>
                      <input *ngIf="!gameStarted || editMode"
                             type="text"
                             [(ngModel)]="player.name"
                             class="border rounded px-2 py-1 w-full" />
                    </td>
                    <td *ngFor="let frame of player.frames; let i = index" 
                        class="p-2 border-l border-gray-200">
                      <div class="flex flex-col items-center">
                        <div class="flex gap-1 mb-1">
                          <!-- Frame 10 tiene 3 casillas -->
                          <ng-container *ngIf="i === 9">
                            <div class="w-8 h-8 border border-gray-300 rounded flex items-center justify-center text-sm font-bold">
                              {{ displayRoll(frame[0], null, true) }}
                            </div>
                            <div class="w-8 h-8 border border-gray-300 rounded flex items-center justify-center text-sm font-bold">
                              {{ displayRoll(frame[1], frame[0], true) }}
                            </div>
                            <div class="w-8 h-8 border border-gray-300 rounded flex items-center justify-center text-sm font-bold">
                              {{ displayRoll(frame[2], frame[1], true) }}
                            </div>
                          </ng-container>
                          <!-- Frames 1-9 tienen 2 casillas -->
                          <ng-container *ngIf="i !== 9">
                            <div class="w-8 h-8 border border-gray-300 rounded flex items-center justify-center text-sm font-bold">
                              {{ displayRoll(frame[0], null, false) }}
                            </div>
                            <div class="w-8 h-8 border border-gray-300 rounded flex items-center justify-center text-sm font-bold">
                              {{ displayRoll(frame[1], frame[0], false) }}
                            </div>
                          </ng-container>
                        </div>
                        <div class="text-xs font-semibold text-blue-600">
                           {{ getFrameScoreForDisplay(player, i) }}
                        </div>
                      </div>
                    </td>
                    <td class="p-4 text-center font-bold text-lg border-l-2 border-gray-300 bg-blue-50">
                      {{ calculateTotalScore(player.frames) }}
                    </td>
                    <td *ngIf="hasCompletedGames" class="p-4 text-center font-bold text-lg border-l border-gray-300 bg-green-100">
                      {{ getAccumulatedScore(player) }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div *ngIf="gameStarted && !gameFinished" class="bg-linear-to-r from-green-500 to-blue-500 rounded-xl p-4 text-white">
            <div class="text-center mb-2">
              <h2 class="text-xl font-bold">
                {{ players[currentPlayer].name }} - Frame {{ currentFrame + 1 }} - Tiro {{ currentRoll + 1 }}
              </h2>
              <p class="text-xs mt-1 opacity-90">Usa el teclado (0-9) o haz clic en los botones</p>
            </div>
            <div class="grid grid-cols-11 gap-2 max-w-2xl mx-auto">
              <button *ngFor="let num of [].constructor(getAvailablePins() + 1); let i = index"
                      (click)="recordPins(i)"
                      class="bg-white text-gray-900 hover:bg-yellow-400 font-bold py-3 px-1 rounded-lg text-lg transition transform hover:scale-105 shadow-lg">
                {{ i }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div *ngIf="showTimeWarning" class="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div class="bg-gradient-to-brown from-orange-500 to-red-600 rounded-3xl p-8 max-w-md w-full shadow-[0_20px_50px_rgba(0,0,0,0.9)] border-4 border-white/20 transform animate-fadeIn">
          <div class="text-center text-white">
            <div class="text-6xl mb-4 animate-pulse">⏰</div>
            <h2 class="text-3xl font-bold mb-4">¡Atención!</h2>
            <p class="text-xl mb-6">{{ timeWarningMessage }}</p>
            
            <div *ngIf="timeRemaining > 300" class="flex justify-center">
              <button 
                (click)="closeTimeWarning()"
                class="bg-white text-orange-600 hover:bg-orange-50 font-bold text-lg px-8 py-3 rounded-xl transition transform hover:scale-105 shadow-lg">
                Entendido
              </button>
            </div>
            
            <div *ngIf="timeRemaining <= 300" class="flex gap-4 justify-center">
              <button 
                (click)="closeTimeWarning()"
                class="bg-white text-orange-600 hover:bg-orange-50 font-bold text-lg px-6 py-3 rounded-xl transition transform hover:scale-105 shadow-lg">
                Continuar
              </button>
              <button 
                *ngIf="!extraTimeAdded"
                (click)="openPasswordPrompt()"
                class="bg-green-500 text-white hover:bg-green-600 font-bold text-lg px-6 py-3 rounded-xl transition transform hover:scale-105 shadow-lg flex items-center gap-2">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/>
                </svg>
                +30 min
              </button>
            </div>
          </div>
        </div>
      </div>

      <div *ngIf="showPasswordPrompt" class="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-60 p-4">
        <div class="bg-gradient-to-brown from-blue-500 to-purple-600 rounded-3xl p-8 max-w-md w-full shadow-[0_20px_50px_rgba(0,0,0,0.9)] border-4 border-white/20 transform animate-fadeIn">
          <div class="text-center text-white">
            <div class="text-6xl mb-4">🔐</div>
            <h2 class="text-3xl font-bold mb-4">Contraseña del Administrador</h2>
            <p class="text-lg mb-6">Ingrese la contraseña para agregar 30 minutos</p>
            
            <input 
              type="password"
              [(ngModel)]="passwordInput"
              (keyup.enter)="validatePassword()"
              placeholder="Contraseña"
              class="w-full px-4 py-3 rounded-xl text-white text-center text-lg font-semibold mb-2 border-2 border-white/40 focus:outline-none focus:ring-4 focus:ring-white/40 placeholder:text-white/80"
              autofocus
            />
            
            <p *ngIf="passwordError" class="text-red-200 bg-red-500/30 rounded-lg px-4 py-2 mb-4 font-semibold">
              ❌ Contraseña incorrecta
            </p>
            
            <div class="flex gap-4 justify-center mt-6">
              <button 
                (click)="cancelPasswordPrompt()"
                class="bg-white/20 text-white hover:bg-white/30 font-bold text-lg px-6 py-3 rounded-xl transition transform hover:scale-105">
                Cancelar
              </button>
              <button 
                (click)="validatePassword()"
                class="bg-white text-purple-600 hover:bg-purple-50 font-bold text-lg px-8 py-3 rounded-xl transition transform hover:scale-105 shadow-lg">
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
                class="bg-white text-orange-600 hover:bg-orange-50 font-bold text-xl px-8 py-4 rounded-xl transition transform hover:scale-105 shadow-lg flex items-center gap-2">
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
  // Inicializamos con 10 frames (el último con 3 espacios)
  players: Player[] = [{
    name: 'Jugador 1',
    frames: this.createInitialFrames(),
    completedGames: [],
    currentGameNumber: 1
  }];
  
  currentPlayer = 0;
  currentFrame = 0;
  currentRoll = 0;
  
  timeLimit = 6;
  timeRemaining = 6 * 60;
  isTimerRunning = false;
  gameStarted = false;
  gameFinished = false;
  stopPending = false;
  
  showTimeWarning = false;
  timeWarningMessage = '';
  showPasswordPrompt = false;
  passwordInput = '';
  correctPassword = 'admin123';
  passwordError = false;
  extraTimeAdded = false;
  
  editMode = false;
  
  get hasCompletedGames(): boolean {
    return this.players.length > 0 && this.players[0].completedGames.length > 0;
  }
  
  private alertedAt15 = false;
  private alertedAt5 = false;
  
  private timerInterval: any;

  ngOnInit() {
    this.startTimer();
  }

  ngOnDestroy() {
    this.stopTimer();
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

  @HostListener('window:keydown', ['$event'])
  handleKeyPress(event: KeyboardEvent) {
    if (!this.gameStarted || this.gameFinished || this.editMode) return;
    
    const num = parseInt(event.key);
    if (!isNaN(num) && num >= 0 && num <= this.getAvailablePins()) {
      this.recordPins(num);
    }
  }

  startTimer() {
    this.timerInterval = setInterval(() => {
      if (this.isTimerRunning && this.timeRemaining > 0) {
        this.timeRemaining--;
        
        // Alertas de tiempo (sin cambios)
        if (this.timeRemaining === 900 && !this.alertedAt15) {
          this.alertedAt15 = true;
          this.timeWarningMessage = '¡Quedan 15 minutos de juego!';
          this.showTimeWarning = true;
        }
        
        if (this.timeRemaining === 300 && !this.alertedAt5) {
          this.alertedAt5 = true;
          this.timeWarningMessage = '¡Quedan solo 5 minutos de juego!';
          this.showTimeWarning = true;
        }
        
        // Cuando el tiempo llega a 0, NO paramos inmediatamente.
        // Activamos la bandera para terminar al final del frame actual.
        if (this.timeRemaining === 0) {
          this.stopPending = true;
        }
      }
    }, 1000);
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
  closeTimeWarning() { this.showTimeWarning = false; }
  openPasswordPrompt() { this.showPasswordPrompt = true; this.passwordInput = ''; this.passwordError = false; }
  cancelPasswordPrompt() { this.showPasswordPrompt = false; }
  
  validatePassword() {
    if (this.passwordInput === this.correctPassword) {
      this.timeRemaining += 30 * 60;
      this.timeLimit += 30;
      this.alertedAt15 = false;
      this.alertedAt5 = false;
      this.extraTimeAdded = true;
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
        name: `Jugador ${this.players.length + 1}`,
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

  finishGame() {
    this.isTimerRunning = false;
    this.gameFinished = true;
    this.stopTimer();
  }

  resetGame() {
    this.players = [{
      name: 'Jugador 1',
      frames: this.createInitialFrames(),
      completedGames: [],
      currentGameNumber: 1
    }];
    this.currentPlayer = 0;
    this.currentFrame = 0;
    this.currentRoll = 0;
    this.timeRemaining = this.timeLimit * 60;
    this.isTimerRunning = false;
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
    this.editMode = false;
  }

  startGame() {
    this.gameStarted = true;
    this.isTimerRunning = true;
  }

  changeTimeLimit(minutes: number) {
    if (!this.gameStarted) {
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