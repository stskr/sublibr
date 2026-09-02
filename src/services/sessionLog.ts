import type { SessionLevel } from './sessionSanitize';

export function logSession(
  event: string,
  data?: unknown,
  level: SessionLevel = 'info',
): void {
  window.electronAPI?.logSession?.({ event, data, level }).catch(() => {});
}

export function bindSessionLog(payload: {
  projectDir?: string;
  sourcePath?: string;
  name: string;
  media?: unknown;
  settings?: unknown;
}): void {
  window.electronAPI?.bindSession?.(payload).catch(() => {});
}

export function describeClickTarget(el: EventTarget | null): Record<string, unknown> | null {
  if (!(el instanceof HTMLElement)) return null;
  if (el.closest('input[type="password"]')) return { redacted: 'password-field' };

  const text = (el.innerText || el.getAttribute('aria-label') || el.getAttribute('title') || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);

  const button = el.closest('button, [role="button"], a, label, [data-log]');
  return {
    tag: el.tagName.toLowerCase(),
    id: el.id || undefined,
    role: el.getAttribute('role') || undefined,
    name: (el as HTMLInputElement).name || undefined,
    type: (el as HTMLInputElement).type || undefined,
    ariaLabel: el.getAttribute('aria-label') || undefined,
    title: el.getAttribute('title') || undefined,
    text: text || undefined,
    closest: button
      ? {
          tag: button.tagName.toLowerCase(),
          text: (button as HTMLElement).innerText?.replace(/\s+/g, ' ').trim().slice(0, 80) || undefined,
          ariaLabel: button.getAttribute('aria-label') || undefined,
        }
      : undefined,
  };
}
