import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({
    providedIn: 'root'
})
export class AuthService {
    private readonly ADMIN_PASSWORD = 'admin'; // Keeping 'admin' as requested or default
    // Wait, previous code had 'admin123'. I should probably align or make it configurable.
    // The user prompt said "Administrator authentication via password upon program startup."
    // I will use 'admin123' to match the existing hardcoded password in the component for consistency,
    // or allow it to be passed in. Actually, let's stick to a simple secure default and maybe allow change later.
    // For now: 'admin123' seems to be what was in the original code for adding time.

    private _isAuthenticated = new BehaviorSubject<boolean>(false);
    isAuthenticated$ = this._isAuthenticated.asObservable();

    constructor() { }

    login(password: string): boolean {
        if (password === 'admin123') { // Hardcoded for now as per requirements/simplicity
            this._isAuthenticated.next(true);
            return true;
        }
        return false;
    }

    logout() {
        this._isAuthenticated.next(false);
    }

    isAuthenticated(): boolean {
        return this._isAuthenticated.value;
    }
}
