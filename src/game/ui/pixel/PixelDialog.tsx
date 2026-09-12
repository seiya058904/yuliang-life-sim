import { useEffect, useRef, type ComponentPropsWithoutRef, type KeyboardEvent } from 'react';

function focusable(element: HTMLElement) {
  return [...element.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"], summary')].filter(node => node.getClientRects().length > 0);
}

function containTab(event: KeyboardEvent<HTMLElement>) {
  if (event.key !== 'Tab') return;
  const elements = focusable(event.currentTarget);
  const first = elements[0], last = elements.at(-1);
  if (!first) { event.preventDefault(); event.currentTarget.focus(); return; }
  if (event.shiftKey && (document.activeElement === first || document.activeElement === event.currentTarget)) { event.preventDefault(); last?.focus(); }
  if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}

/** Native modal focus, inert background and focus restoration; gates omit onDismiss. */
export function PixelDialog({ onDismiss, onClick, children, ...props }: ComponentPropsWithoutRef<'dialog'> & { onDismiss?: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.showModal();
    return () => {
      dialog.close();
      const restore = trigger?.isConnected ? trigger : document.querySelector<HTMLElement>('.settings-button');
      restore?.focus();
    };
  }, []);
  return <dialog {...props} ref={ref} onKeyDown={containTab} onCancel={(event) => { event.preventDefault(); onDismiss?.(); }} onClick={event => {
    onClick?.(event);
    if (!onDismiss || event.target !== event.currentTarget) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onDismiss();
  }}>{children}</dialog>;
}

/** The settlement keeps its shell-relative full-frame geometry, with the same keyboard contract. */
export function PixelModalFrame({ children, ...props }: ComponentPropsWithoutRef<'section'>) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const frame = ref.current!;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const backdrop = frame.parentElement!;
    const siblings = [...(backdrop.parentElement?.children ?? [])].filter((node): node is HTMLElement => node instanceof HTMLElement && node !== backdrop);
    const previous = siblings.map(node => node.inert);
    siblings.forEach(node => { node.inert = true; });
    (focusable(frame)[0] ?? frame).focus();
    return () => {
      siblings.forEach((node, index) => { node.inert = previous[index]; });
      if (trigger?.isConnected) trigger.focus();
    };
  }, []);
  return <section {...props} ref={ref} tabIndex={-1} role="dialog" aria-modal="true" onKeyDown={event => { containTab(event); if (event.key === 'Escape') event.preventDefault(); }}>{children}</section>;
}
