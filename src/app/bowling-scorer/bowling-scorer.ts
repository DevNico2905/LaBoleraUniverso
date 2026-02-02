// bowling-scorer.component.ts
import { Component, OnInit, OnDestroy, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

interface Frame {
  rolls: (number | null)[];
}

interface Player {
  name: string;
  frames: (number | null)[][];
}

@Component({
  selector: 'app-bowling-scorer',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
      <div class="max-w-[95%] mx-auto">
        <div class="bg-white/10 backdrop-blur-lg rounded-2xl shadow-2xl p-8 border border-white/20">
          <div class="flex justify-between items-center mb-8">
            <h1 class="text-4xl font-bold text-white flex items-center gap-3">
              🎳 Sistema de Puntuación
            </h1>
            <div class="flex items-center gap-4">
              <div class="bg-white/20 rounded-xl px-6 py-3">
                <div class="flex items-center gap-2 text-white">
                  <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10"></circle>
                    <polyline points="12 6 12 12 16 14"></polyline>
                  </svg>
                  <span class="text-3xl font-mono font-bold">
                    {{ formatTime(timeRemaining) }}
                  </span>
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
                (click)="resetGame()"
                [disabled]="!gameFinished && timeRemaining > 0"
                class="bg-red-500 hover:bg-red-600 text-white p-3 rounded-lg transition disabled:bg-gray-400 disabled:cursor-not-allowed"
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
                    <th *ngFor="let frame of [].constructor(10); let i = index" 
                        class="p-4 text-center font-bold border-l border-white/30">
                      {{ i + 1 }}
                    </th>
                    <th class="p-4 text-center font-bold border-l-2 border-white">Total</th>
                  </tr>
                </thead>
                <tbody>
                  <tr *ngFor="let player of players; let pIndex = index"
                      [class]="pIndex === currentPlayer ? 'bg-yellow-100 border-b border-gray-200' : 'border-b border-gray-200 hover:bg-gray-50'">
                    <td class="p-4 font-semibold">
                      <span *ngIf="gameStarted">{{ player.name }}</span>
                      <input *ngIf="!gameStarted"
                             type="text"
                             [(ngModel)]="player.name"
                             class="border rounded px-2 py-1 w-full" />
                    </td>
                    <td *ngFor="let frame of player.frames; let fIndex = index" 
                        class="p-2 border-l border-gray-200">
                      <div class="flex flex-col items-center">
                        <div class="flex gap-1 mb-1">
                          <ng-container *ngIf="fIndex < 9">
                            <div class="w-8 h-8 border border-gray-300 rounded flex items-center justify-center text-sm font-bold">
                              {{ displayRoll(frame[0], fIndex, 0, player.frames) }}
                            </div>
                            <div class="w-8 h-8 border border-gray-300 rounded flex items-center justify-center text-sm font-bold">
                              {{ displayRoll(frame[1], fIndex, 1, player.frames) }}
                            </div>
                          </ng-container>
                          <ng-container *ngIf="fIndex === 9">
                            <div class="w-7 h-7 border border-gray-300 rounded flex items-center justify-center text-xs font-bold">
                              {{ displayRoll(frame[0], fIndex, 0, player.frames) }}
                            </div>
                            <div class="w-7 h-7 border border-gray-300 rounded flex items-center justify-center text-xs font-bold">
                              {{ displayRoll(frame[1], fIndex, 1, player.frames) }}
                            </div>
                            <div class="w-7 h-7 border border-gray-300 rounded flex items-center justify-center text-xs font-bold">
                              {{ displayRoll(frame[2], fIndex, 2, player.frames) }}
                            </div>
                          </ng-container>
                        </div>
                        <div class="text-xs font-semibold text-blue-600">
                          {{ getFrameScores(player.frames)[fIndex] !== null ? getFrameScores(player.frames)[fIndex] : '' }}
                        </div>
                      </div>
                    </td>
                    <td class="p-4 text-center font-bold text-lg border-l-2 border-gray-300 bg-blue-50">
                      {{ calculateTotalScore(player.frames) }}
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
  `,
  styles: []
})
export class BowlingScorerComponent implements OnInit, OnDestroy {
  players: Player[] = [{
    name: 'Jugador 1',
    frames: Array.from({ length: 10 }, () => [null, null, null])
  }];
  
  currentPlayer = 0;
  currentFrame = 0;
  currentRoll = 0;
  timeLimit = 30;
  timeRemaining = 30 * 60;
  isTimerRunning = false;
  gameStarted = false;
  gameFinished = false;
  
  private timerInterval: any;

  ngOnInit() {
    this.startTimer();
  }

  ngOnDestroy() {
    this.stopTimer();
  }

  @HostListener('window:keydown', ['$event'])
  handleKeyPress(event: KeyboardEvent) {
    if (!this.gameStarted || this.gameFinished) return;
    
    const num = parseInt(event.key);
    if (!isNaN(num) && num >= 0 && num <= this.getAvailablePins()) {
      this.recordPins(num);
    }
  }

  startTimer() {
    this.timerInterval = setInterval(() => {
      if (this.isTimerRunning && this.timeRemaining > 0) {
        this.timeRemaining--;
        if (this.timeRemaining === 0) {
          this.isTimerRunning = false;
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

  addPlayer() {
    if (this.players.length < 9 && !this.gameStarted) {
      this.players.push({
        name: `Jugador ${this.players.length + 1}`,
        frames: Array.from({ length: 10 }, () => [null, null, null])
      });
    }
  }

  removePlayer() {
    if (this.players.length > 1 && !this.gameStarted) {
      this.players = this.players.slice(0, -1);
    }
  }

  calculateFrameScore(playerFrames: (number | null)[][], frameIndex: number): number | null {
    const frame = playerFrames[frameIndex];
    const [roll1, roll2, roll3] = frame;
    
    if (roll1 === null) return null;
    
    if (frameIndex === 9) {
      let score = roll1;
      if (roll2 !== null) score += roll2;
      if (roll3 !== null) score += roll3;
      return score;
    }
    
    if (roll1 === 10) {
      const nextFrame = playerFrames[frameIndex + 1];
      if (nextFrame[0] === null) return null;
      
      let score = 10 + nextFrame[0];
      
      if (nextFrame[0] === 10) {
        if (frameIndex + 1 === 9) {
          if (nextFrame[1] === null) return null;
          score += nextFrame[1];
        } else {
          const nextNextFrame = playerFrames[frameIndex + 2];
          if (nextNextFrame[0] === null) return null;
          score += nextNextFrame[0];
        }
      } else {
        if (nextFrame[1] === null) return null;
        score += nextFrame[1];
      }
      
      return score;
    }
    
    if (roll2 === null) return null;
    
    if (roll1 + roll2 === 10) {
      const nextFrame = playerFrames[frameIndex + 1];
      if (nextFrame[0] === null) return null;
      return 10 + nextFrame[0];
    }
    
    return roll1 + roll2;
  }

  calculateTotalScore(playerFrames: (number | null)[][]): number {
    let total = 0;
    for (let i = 0; i < 10; i++) {
      const frameScore = this.calculateFrameScore(playerFrames, i);
      if (frameScore === null) break;
      total += frameScore;
    }
    return total;
  }

  getFrameScores(playerFrames: (number | null)[][]): (number | null)[] {
    const scores: (number | null)[] = [];
    let cumulative = 0;
    
    for (let i = 0; i < 10; i++) {
      const frameScore = this.calculateFrameScore(playerFrames, i);
      if (frameScore === null) {
        scores.push(null);
      } else {
        cumulative += frameScore;
        scores.push(cumulative);
      }
    }
    
    return scores;
  }

  recordPins(pins: number) {
    if (!this.gameStarted || this.gameFinished) return;

    const frame = [...this.players[this.currentPlayer].frames[this.currentFrame]];
    
    if (this.currentFrame < 9) {
      if (this.currentRoll === 0) {
        frame[0] = pins;
        this.players[this.currentPlayer].frames[this.currentFrame] = frame;
        if (pins === 10) {
          this.moveToNextTurn();
        } else {
          this.currentRoll = 1;
        }
      } else {
        frame[1] = pins;
        this.players[this.currentPlayer].frames[this.currentFrame] = frame;
        this.moveToNextTurn();
      }
    } else {
      frame[this.currentRoll] = pins;
      this.players[this.currentPlayer].frames[this.currentFrame] = frame;
      
      if (this.currentRoll === 0) {
        this.currentRoll = 1;
      } else if (this.currentRoll === 1) {
        const roll1 = frame[0];
        if (roll1 === 10 || (roll1 !== null && roll1 + pins === 10)) {
          this.currentRoll = 2;
        } else {
          this.moveToNextTurn();
        }
      } else {
        this.moveToNextTurn();
      }
    }
  }

  moveToNextTurn() {
    if (this.currentPlayer < this.players.length - 1) {
      this.currentPlayer++;
      this.currentRoll = 0;
    } else if (this.currentFrame < 9) {
      this.currentPlayer = 0;
      this.currentFrame++;
      this.currentRoll = 0;
    } else {
      this.currentPlayer = 0;
      this.currentFrame = 0;
      this.currentRoll = 0;
      this.isTimerRunning = false;
      this.gameFinished = true;
    }
  }

  resetGame() {
    this.players = [{
      name: 'Jugador 1',
      frames: Array.from({ length: 10 }, () => [null, null, null])
    }];
    this.currentPlayer = 0;
    this.currentFrame = 0;
    this.currentRoll = 0;
    this.timeRemaining = this.timeLimit * 60;
    this.isTimerRunning = false;
    this.gameStarted = false;
    this.gameFinished = false;
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
    if (this.currentFrame < 9) {
      if (this.currentRoll === 0) return 10;
      return 10 - (frame[0] || 0);
    } else {
      if (this.currentRoll === 0) return 10;
      if (this.currentRoll === 1) {
        if (frame[0] === 10) return 10;
        return 10 - (frame[0] || 0);
      }
      if (frame[1] === 10) return 10;
      if (frame[0] === 10) {
        return 10 - (frame[1] || 0);
      }
      return 10;
    }
  }

  displayRoll(roll: number | null, frameIndex: number, rollIndex: number, playerFrames: (number | null)[][]): string {
    if (roll === null) return '';
    if (roll === 10) return 'X';
    
    const frame = playerFrames[frameIndex];
    
    if (frameIndex < 9) {
      if (rollIndex === 1 && frame[0] !== null && frame[0] + roll === 10) return '/';
    } else {
      if (rollIndex === 1) {
        if (frame[0] !== 10 && frame[0] !== null && frame[0] + roll === 10) return '/';
      }
      if (rollIndex === 2) {
        if (frame[1] === 10) {
          if (roll === 10) return 'X';
        } else if (frame[0] === 10) {
          if (frame[1] !== null && frame[1] + roll === 10) return '/';
        } else if (frame[0] !== null && frame[1] !== null && frame[0] + frame[1] === 10) {
          if (roll === 10) return 'X';
        }
      }
    }
    
    return roll.toString();
  }
}