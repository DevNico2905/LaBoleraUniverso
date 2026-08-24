import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { BowlingScorerComponent } from './bowling-scorer';
import { AccountingService } from '../services/accounting.service';
import { AuthService } from '../services/auth.service';
import { KeyboardNavService } from '../services/keyboard-nav.service';
import { LoggingService } from '../services/logging.service';

/**
 * Test suite for the BowlingScorer component.
 *
 * Covers the 30-minute time option feature (Impls/001-opcion-30-minutos.md) end to end:
 *   - Initial time selection: 30 vs 60 min via changeTimeLimit().
 *   - Timer alert suppression: 15-min warning is skipped when initialTimeLimit ≤ 30.
 *   - Password-gated extensions: 'add5' / 'add30' / 'add60' branches in validatePassword().
 *   - Billing traceability: calculateBilledDuration() and the values passed to accounting.endGame().
 *
 * The component's ngOnInit redirects when the cash box is closed, so tests bypass detectChanges()
 * and drive methods directly. Dependencies are stubbed to isolate the component from Supabase,
 * router navigation and the DOM-based keyboard navigation service.
 */
describe('BowlingScorerComponent', () => {
  let component: BowlingScorerComponent;
  let fixture: ComponentFixture<BowlingScorerComponent>;

  let accountingStub: jasmine.SpyObj<AccountingService>;
  let authStub: jasmine.SpyObj<AuthService>;
  let keyboardNavStub: jasmine.SpyObj<KeyboardNavService>;
  let loggingStub: jasmine.SpyObj<LoggingService>;

  beforeEach(async () => {
    accountingStub = jasmine.createSpyObj<AccountingService>(
      'AccountingService',
      ['startGame', 'endGame'],
      { isDayOpen: true }
    );
    accountingStub.startGame.and.returnValue('session-test-id');
    accountingStub.endGame.and.returnValue(null);

    authStub = jasmine.createSpyObj<AuthService>('AuthService', ['verifyPassword']);
    // Default: password is valid. Individual tests can override via .and.resolveTo(false).
    authStub.verifyPassword.and.resolveTo(true);

    keyboardNavStub = jasmine.createSpyObj<KeyboardNavService>('KeyboardNavService', [
      'enterScope',
      'exitScope',
      'navigateNext',
      'setEnabled',
    ]);

    loggingStub = jasmine.createSpyObj<LoggingService>('LoggingService', ['info', 'warn', 'error']);

    await TestBed.configureTestingModule({
      imports: [BowlingScorerComponent],
      providers: [
        provideRouter([]),
        { provide: AccountingService, useValue: accountingStub },
        { provide: AuthService, useValue: authStub },
        { provide: KeyboardNavService, useValue: keyboardNavStub },
        { provide: LoggingService, useValue: loggingStub },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(BowlingScorerComponent);
    component = fixture.componentInstance;
    // Intentionally skip detectChanges() to avoid triggering ngOnInit (which starts the timer).
  });

  afterEach(() => {
    // Stop any timer the component may have started so it doesn't leak across specs.
    component.stopTimer();
  });

  describe('smoke', () => {
    it('should create', () => {
      expect(component).toBeTruthy();
    });

    it('should default to 60 min initial time', () => {
      expect(component.initialTimeLimit).toBe(60);
      expect(component.timeLimit).toBe(60);
      expect(component.timeRemaining).toBe(60 * 60);
    });
  });

  describe('changeTimeLimit (initial time selection)', () => {
    it('sets 30-min duration coherently across the three timer fields', () => {
      component.changeTimeLimit(30);

      expect(component.initialTimeLimit).toBe(30);
      expect(component.timeLimit).toBe(30);
      expect(component.timeRemaining).toBe(30 * 60);
    });

    it('sets 60-min duration coherently across the three timer fields', () => {
      component.changeTimeLimit(30);
      component.changeTimeLimit(60);

      expect(component.initialTimeLimit).toBe(60);
      expect(component.timeLimit).toBe(60);
      expect(component.timeRemaining).toBe(60 * 60);
    });

    it('is a no-op after the game has started (regression)', () => {
      component.startGame();
      const before = {
        initial: component.initialTimeLimit,
        limit: component.timeLimit,
        remaining: component.timeRemaining,
      };

      component.changeTimeLimit(30);

      expect(component.initialTimeLimit).toBe(before.initial);
      expect(component.timeLimit).toBe(before.limit);
      expect(component.timeRemaining).toBe(before.remaining);
    });
  });

  describe('startGame + 15-min alert suppression for short games', () => {
    it('suppresses the 15-min alert when initialTimeLimit is 30', () => {
      component.changeTimeLimit(30);

      component.startGame();

      // The suppression sets alertedAt15 = true up front so the alert never fires.
      expect((component as any).alertedAt15).toBeTrue();
      // The 5-min alert stays armed as a final warning.
      expect((component as any).alertedAt5).toBeFalse();
    });

    it('keeps the 15-min alert armed for standard 60-min games (regression)', () => {
      component.changeTimeLimit(60);

      component.startGame();

      expect((component as any).alertedAt15).toBeFalse();
      expect((component as any).alertedAt5).toBeFalse();
    });

    it('registers the session with accounting and logs game_started', () => {
      component.changeTimeLimit(30);

      component.startGame();

      expect(accountingStub.startGame).toHaveBeenCalledWith(component.players.length);
      expect(loggingStub.info).toHaveBeenCalledWith(
        'game',
        'game_started',
        jasmine.objectContaining({ timeLimitMinutes: 30 })
      );
    });
  });

  describe('validatePassword — extension branches', () => {
    beforeEach(() => {
      // Baseline: 30-min game already in progress.
      component.changeTimeLimit(30);
      component.startGame();
    });

    it('+5 min branch adds 5 min to the three fields and sets the compensation flag', async () => {
      component.openPasswordPrompt('add5');
      component.passwordInput = 'ok';

      await component.validatePassword();

      expect(component.timeLimit).toBe(35);
      expect(component.addedTimeLimit).toBe(5);
      expect(component.timeRemaining).toBe(35 * 60);
      expect(component.compensationTimeAdded).toBeTrue();
      expect(loggingStub.info).toHaveBeenCalledWith(
        'game',
        'time_extended',
        jasmine.objectContaining({ action: 'add5', addedMinutes: 5 })
      );
    });

    it('+30 min branch adds 30 min to the three fields (new feature)', async () => {
      component.openPasswordPrompt('add30');
      component.passwordInput = 'ok';

      await component.validatePassword();

      expect(component.timeLimit).toBe(60);
      expect(component.addedTimeLimit).toBe(30);
      expect(component.timeRemaining).toBe(60 * 60);
    });

    it('+30 min logs a time_extended event with action=add30 (traceability)', async () => {
      component.openPasswordPrompt('add30');
      component.passwordInput = 'ok';

      await component.validatePassword();

      expect(loggingStub.info).toHaveBeenCalledWith(
        'game',
        'time_extended',
        jasmine.objectContaining({ action: 'add30', addedMinutes: 30, totalAddedMinutes: 30 })
      );
    });

    it('+30 min does NOT set the +5 (compensation) or +60 (extra) flags — no flag pollution', async () => {
      component.openPasswordPrompt('add30');
      component.passwordInput = 'ok';

      await component.validatePassword();

      expect(component.compensationTimeAdded).toBeFalse();
      expect(component.extraTimeAdded).toBeFalse();
    });

    it('+60 min branch adds 60 min and sets the extra flag (regression)', async () => {
      component.openPasswordPrompt('add60');
      component.passwordInput = 'ok';

      await component.validatePassword();

      expect(component.timeLimit).toBe(90);
      expect(component.addedTimeLimit).toBe(60);
      expect(component.timeRemaining).toBe(90 * 60);
      expect(component.extraTimeAdded).toBeTrue();
    });

    it('+30 min applied after gameFinished reactivates the timer', async () => {
      // Simulate the game finishing before the extension.
      component.gameFinished = true;
      component.isTimerRunning = false;

      component.openPasswordPrompt('add30');
      component.passwordInput = 'ok';
      await component.validatePassword();

      expect(component.gameFinished).toBeFalse();
      expect(component.isTimerRunning).toBeTrue();
    });

    it('+30 min can be applied multiple times without restriction (consistent with +5 and +60)', async () => {
      component.openPasswordPrompt('add30');
      component.passwordInput = 'ok';
      await component.validatePassword();

      component.openPasswordPrompt('add30');
      component.passwordInput = 'ok';
      await component.validatePassword();

      expect(component.addedTimeLimit).toBe(60);
      expect(component.timeLimit).toBe(90);
    });

    it('rejects the extension when the password is invalid — no time is added', async () => {
      authStub.verifyPassword.and.resolveTo(false);
      component.openPasswordPrompt('add30');
      component.passwordInput = 'wrong';

      await component.validatePassword();

      expect(component.timeLimit).toBe(30); // unchanged
      expect(component.addedTimeLimit).toBe(0);
      expect(component.passwordError).toBeTrue();
    });
  });

  describe('calculateBilledDuration — billing traceability', () => {
    it('bills the full timeLimit (initial + all extensions) — regression', async () => {
      component.changeTimeLimit(30);
      component.startGame();

      component.openPasswordPrompt('add30');
      component.passwordInput = 'ok';
      await component.validatePassword();

      component.openPasswordPrompt('add5');
      component.passwordInput = 'ok';
      await component.validatePassword();

      // 30 + 30 + 5 = 65 min
      expect((component as any).calculateBilledDuration()).toBe(65);
    });

    it('passes the correct initial + added split to accounting on finishGame', () => {
      component.changeTimeLimit(30);
      component.startGame();
      // Simulate a +30 min extension without going through validatePassword to isolate the assertion.
      component.timeLimit = 60;
      component.addedTimeLimit = 30;

      component.finishGame();

      expect(accountingStub.endGame).toHaveBeenCalledWith(
        'session-test-id',
        60, // billedMinutes
        'completed',
        30, // initialTimeMinutes
        30, // addedTimeMinutes
        component.players.length
      );
    });
  });
});
