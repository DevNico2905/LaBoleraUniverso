import { Injectable, OnDestroy } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class KeyboardNavService implements OnDestroy {
  private currentIndex = -1;
  private boundHandleKeydown = this.handleKeydown.bind(this);
  private enabled = true;

  constructor() {
    document.addEventListener('keydown', this.boundHandleKeydown);
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (!enabled) {
      document.querySelectorAll('.kb-focused').forEach(el => el.classList.remove('kb-focused'));
      this.currentIndex = -1;
    }
  }

  /** Mueve el foco al siguiente elemento kb-focusable (para uso externo). */
  navigateNext() {
    this.moveFocus(1);
  }

  private getFocusableElements(): HTMLElement[] {
    return (Array.from(document.querySelectorAll('.kb-focusable')) as HTMLElement[]).filter(el => {
      const style = window.getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden' && !(el as any).disabled;
    });
  }

  private moveFocus(delta: number) {
    const focusableElements = this.getFocusableElements();
    if (focusableElements.length === 0) return;

    const activeEl = document.querySelector('.kb-focused') as HTMLElement;
    let newIndex = activeEl ? focusableElements.indexOf(activeEl) : -1;
    if (newIndex === -1) newIndex = delta > 0 ? 0 : focusableElements.length - 1;
    else newIndex = (newIndex + delta + focusableElements.length) % focusableElements.length;

    if (activeEl) { activeEl.classList.remove('kb-focused'); activeEl.blur(); }

    const nextEl = focusableElements[newIndex];
    this.currentIndex = newIndex;
    nextEl.classList.add('kb-focused');
    nextEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    if (nextEl.tagName === 'INPUT' || nextEl.tagName === 'TEXTAREA') nextEl.focus();
  }

  private handleKeydown(event: KeyboardEvent) {
    if (!this.enabled) return;

    const focusableElements = this.getFocusableElements();
    if (focusableElements.length === 0) return;

    const activeEl = document.querySelector('.kb-focused') as HTMLElement;
    const t = activeEl?.tagName;
    const isInput = t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT';

    if (isInput && (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Enter')) {
      return;
    }

    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowRight':
        event.preventDefault();
        this.moveFocus(1);
        break;
      case 'ArrowUp':
      case 'ArrowLeft':
        event.preventDefault();
        this.moveFocus(-1);
        break;
      case 'Enter':
        if (activeEl && !isInput) activeEl.click();
        break;
    }
  }

  ngOnDestroy() {
    document.removeEventListener('keydown', this.boundHandleKeydown);
  }
}
