import { ErrorHandler, Injectable, inject } from '@angular/core';
import { LoggingService } from '../services/logging.service';

@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  private logging = inject(LoggingService);

  handleError(error: unknown): void {
    this.logging.error('system', 'unhandled_error', error);
    // Preservar el comportamiento por defecto de Angular
    console.error(error);
  }
}
