/**
 * Convert single-finger vertical terminal gestures to wheel events understood by xterm.js.
 * Allow touchscreen history scrolling when tmux enables the mouse protocol.
 */
import type { Terminal } from '@xterm/xterm';

const TOUCH_WHEEL_STEP_PX = 24;

/**
 * Bridge touch scrolling while the xterm.js mouse protocol is active and return a cleanup function.
 *
 * @param terminal - An opened xterm.js terminal instance.
 * @returns A cleanup function removing all touch listeners.
 */
export function attachTerminalTouchScroll(terminal: Terminal): () => void {
  const terminalElement = terminal.element;
  if (!terminalElement) {
    return () => {};
  }

  let lastTouchY: number | null = null;
  let pendingDeltaY = 0;

  /** Record the initial single-finger position for displacement calculation. */
  const handleTouchStart = (event: TouchEvent) => {
    if (event.touches.length !== 1) {
      lastTouchY = null;
      pendingDeltaY = 0;
      return;
    }

    lastTouchY = event.touches[0].clientY;
    pendingDeltaY = 0;
  };

  /**
   * Translate vertical movement only while the application owns the mouse; otherwise use native xterm.js scrolling.
   */
  const handleTouchMove = (event: TouchEvent) => {
    if (event.touches.length !== 1 || lastTouchY === null) {
      return;
    }

    const touch = event.touches[0];
    const deltaY = lastTouchY - touch.clientY;
    lastTouchY = touch.clientY;

    if (!terminalElement.classList.contains('enable-mouse-events')) {
      pendingDeltaY = 0;
      return;
    }

    event.preventDefault();
    pendingDeltaY += deltaY;

    while (Math.abs(pendingDeltaY) >= TOUCH_WHEEL_STEP_PX) {
      const step = Math.sign(pendingDeltaY) * TOUCH_WHEEL_STEP_PX;
      terminalElement.dispatchEvent(new WheelEvent('wheel', {
        bubbles: true,
        cancelable: true,
        clientX: touch.clientX,
        clientY: touch.clientY,
        deltaMode: WheelEvent.DOM_DELTA_PIXEL,
        deltaY: step,
      }));
      pendingDeltaY -= step;
    }
  };

  /** Clear temporary state after gesture completion or cancellation. */
  const resetTouch = () => {
    lastTouchY = null;
    pendingDeltaY = 0;
  };

  terminalElement.addEventListener('touchstart', handleTouchStart, { passive: true });
  terminalElement.addEventListener('touchmove', handleTouchMove, { passive: false });
  terminalElement.addEventListener('touchend', resetTouch, { passive: true });
  terminalElement.addEventListener('touchcancel', resetTouch, { passive: true });

  return () => {
    terminalElement.removeEventListener('touchstart', handleTouchStart);
    terminalElement.removeEventListener('touchmove', handleTouchMove);
    terminalElement.removeEventListener('touchend', resetTouch);
    terminalElement.removeEventListener('touchcancel', resetTouch);
  };
}
