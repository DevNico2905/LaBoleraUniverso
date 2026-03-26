import { Injectable, OnDestroy } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class KeyboardNavService implements OnDestroy {
  private currentIndex = -1;
  private boundHandleKeydown = this.handleKeydown.bind(this);

  constructor() {
    document.addEventListener('keydown', this.boundHandleKeydown);
  }

  private handleKeydown(event: KeyboardEvent) {
    // Refetch elements every keydown to smoothly handle *ngIf DOM changes
    const allElements = Array.from(document.querySelectorAll('.kb-focusable')) as HTMLElement[];
    const focusableElements = allElements.filter(el => {
      const style = window.getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden' && !(el as any).disabled;
    });

    if (focusableElements.length === 0) return;

    const activeEl = document.querySelector('.kb-focused') as HTMLElement;
    let newIndex = this.currentIndex;

    if (activeEl) {
      newIndex = focusableElements.indexOf(activeEl);
    }

    if (newIndex === -1) {
      newIndex = 0;
    }

    const t = activeEl?.tagName;
    const isInput = t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT';

    // If an input is focused, allow Left/Right arrows and normal typing/Enter behavior
    if (isInput && (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Enter')) {
      return;
    }

    let handled = false;

    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowRight':
        newIndex = (newIndex + 1) % focusableElements.length;
        handled = true;
        break;
      case 'ArrowUp':
      case 'ArrowLeft':
        newIndex = (newIndex - 1 + focusableElements.length) % focusableElements.length;
        handled = true;
        break;
      case 'Enter':
        if (activeEl && !isInput) {
          activeEl.click();
        }
        handled = true;
        break;
    }

    if (handled && event.key !== 'Enter') {
      event.preventDefault();
      
      if (activeEl) {
        activeEl.classList.remove('kb-focused');
        activeEl.blur();
      }
      
      const nextEl = focusableElements[newIndex];
      this.currentIndex = newIndex;
      nextEl.classList.add('kb-focused');
      nextEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      
      // Auto-focus inputs so you can start typing right away
      if (nextEl.tagName === 'INPUT' || nextEl.tagName === 'TEXTAREA') {
        nextEl.focus();
      }
    }
  }

  ngOnDestroy() {
    document.removeEventListener('keydown', this.boundHandleKeydown);
  }
}
