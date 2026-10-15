/**
 * Run the bundled PlantUML engine on demand in an isolated page.
 * Each render has isolated state; cancel or timeout destroys the page without sending source to a server.
 */
const RENDERER_URL = '/vendor/plantuml/b0c5e6c/frame.html';
const ERROR_MESSAGE = 'Unable to render PlantUML diagram.';

export function renderPlantUml(
  source: string,
  { signal, dark = false }: { signal: AbortSignal; dark?: boolean },
): Promise<string> {
  /** Exchange source and results through window messages, accepting only the active isolated page. */
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Rendering cancelled.', 'AbortError'));
      return;
    }
    if (!source.trim() || new TextEncoder().encode(source).length > 64 * 1024) {
      reject(new Error('PlantUML source must contain between 1 byte and 64 KiB.'));
      return;
    }

    const frame = document.createElement('iframe');
    frame.title = 'PlantUML renderer';
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.setAttribute('aria-hidden', 'true');
    frame.tabIndex = -1;
    // Allow font measurement without occupying visible layout space.
    frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:1px;height:1px;border:0;visibility:hidden;';
    let settled = false;
    const timeout = window.setTimeout(() => finish(new Error('PlantUML rendering timed out.')), 30_000);

    function finish(error: Error | null, svg = '') {
      /** Release timers, listeners, and engine state so old requests cannot affect later diagrams. */
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      window.removeEventListener('message', receive);
      signal.removeEventListener('abort', abort);
      frame.remove();
      if (error) reject(error);
      else resolve(svg);
    }

    function abort() {
      /** Release the render context immediately on edit or unmount. */
      finish(new DOMException('Rendering cancelled.', 'AbortError'));
    }

    function receive(event: MessageEvent) {
      /** The sandbox has an opaque origin; verify the sending window identity. */
      if (event.source !== frame.contentWindow || !event.data) return;
      if (event.data.type === 'plantuml-ready') {
        frame.contentWindow?.postMessage({ type: 'plantuml-render', source, dark }, '*');
      } else if (event.data.type === 'plantuml-result') {
        if (typeof event.data.svg !== 'string' || !event.data.svg.includes('<svg')) {
          finish(new Error(ERROR_MESSAGE));
        } else {
          finish(null, event.data.svg);
        }
      } else if (event.data.type === 'plantuml-error') {
        finish(new Error(ERROR_MESSAGE));
      }
    }

    window.addEventListener('message', receive);
    signal.addEventListener('abort', abort, { once: true });
    frame.onerror = () => finish(new Error(ERROR_MESSAGE));
    frame.src = RENDERER_URL;
    document.body.appendChild(frame);
  });
}
