import { Alert, Dimensions, type AlertButton, type ScaledSize } from 'react-native';
import { colors } from '@/theme';

/**
 * Browser setup for the web build, imported once from app/_layout.tsx.
 *
 * 1. React Native Web's Alert.alert does nothing, and the app uses it for confirmations and
 *    the "Add a photo" choice, so this draws the same dialog in the page.
 * 2. On a wide screen the app sits in a phone-width column instead of stretching. Screens size
 *    the board and photos from the window width, so the window reports the column's width.
 */

const COLUMN = 480;

const css = `
html, body { background: ${colors.scrap}; }
#root { max-width: ${COLUMN}px; margin: 0 auto; background: ${colors.paper}; box-shadow: 0 0 0 1px ${colors.line}, 0 20px 60px rgba(31,41,55,.08); }
.as-alert-backdrop { position: fixed; inset: 0; z-index: 9999; display: flex; align-items: center; justify-content: center;
  padding: 16px; background: rgba(31,41,55,.45); font-family: Nunito_600SemiBold, Nunito, system-ui, sans-serif; }
.as-alert { width: 100%; max-width: 340px; background: #fff; border-radius: 18px; padding: 20px 20px 12px; box-shadow: 0 20px 50px rgba(0,0,0,.25); }
.as-alert h2 { margin: 0 0 6px; font: 600 20px/1.2 Fredoka_600SemiBold, Fredoka, system-ui, sans-serif; color: ${colors.ink}; }
.as-alert p { margin: 0 0 14px; font-size: 15px; line-height: 1.45; color: ${colors.muted}; }
.as-alert .as-buttons { display: flex; flex-direction: column; gap: 6px; }
.as-alert button { font: 700 16px Nunito_700Bold, Nunito, system-ui, sans-serif; border: 0; border-radius: 14px; padding: 12px; cursor: pointer;
  background: ${colors.tileHidden}; color: ${colors.ink}; }
.as-alert button.as-default { background: ${colors.accent}; }
.as-alert button.as-destructive { background: ${colors.danger}; color: #fff; }
.as-alert button.as-cancel { background: transparent; color: ${colors.muted}; }
.as-alert button:focus-visible { outline: 3px solid ${colors.ink}; outline-offset: 2px; }
`;

function showAlert(title: string, message?: string, buttons?: AlertButton[]) {
  const list: AlertButton[] = buttons?.length ? buttons : [{ text: 'OK' }];
  const backdrop = document.createElement('div');
  backdrop.className = 'as-alert-backdrop';
  const box = document.createElement('div');
  box.className = 'as-alert';
  box.setAttribute('role', 'alertdialog');
  box.setAttribute('aria-modal', 'true');
  const h = document.createElement('h2');
  h.textContent = title;
  box.appendChild(h);
  if (message) {
    const p = document.createElement('p');
    p.textContent = message;
    box.appendChild(p);
  }
  const row = document.createElement('div');
  row.className = 'as-buttons';
  const close = () => { backdrop.remove(); document.removeEventListener('keydown', onKey); };
  const cancel = list.find((b) => b.style === 'cancel');
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { close(); cancel?.onPress?.(); } };
  // Cancel goes last, like an action sheet.
  for (const b of [...list.filter((x) => x !== cancel), ...(cancel ? [cancel] : [])]) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = b.text ?? 'OK';
    btn.className = b.style === 'cancel' ? 'as-cancel' : b.style === 'destructive' ? 'as-destructive' : list.length === 1 ? 'as-default' : '';
    // onPress runs inside the click so a file picker it opens still counts as user-initiated.
    btn.onclick = () => { close(); b.onPress?.(); };
    row.appendChild(btn);
  }
  box.appendChild(row);
  backdrop.appendChild(box);
  backdrop.onclick = (e) => { if (e.target === backdrop && cancel) { close(); cancel.onPress?.(); } };
  document.addEventListener('keydown', onKey);
  document.body.appendChild(backdrop);
  (row.querySelector('button:not(.as-cancel)') as HTMLButtonElement | null ?? row.querySelector('button'))?.focus();
}

function narrowWindow() {
  let raw: ScaledSize | null = null;
  let narrowed: ScaledSize | null = null;
  const narrow = (w: ScaledSize) => {
    if (w.width <= COLUMN) return w;
    if (w !== raw) { raw = w; narrowed = { ...w, width: COLUMN }; }
    return narrowed!;
  };
  const get = Dimensions.get.bind(Dimensions);
  Dimensions.get = (dim) => (dim === 'window' ? narrow(get(dim)) : get(dim));
  // React Native Web's useWindowDimensions removes its listener by the original handler.
  type Handler = (d: { window: ScaledSize; screen: ScaledSize }) => void;
  const wrapped = new Map<Handler, Handler>();
  const dims = Dimensions as unknown as {
    addEventListener: (type: 'change', h: Handler) => { remove: () => void };
    removeEventListener: (type: 'change', h: Handler) => void;
  };
  const add = dims.addEventListener.bind(Dimensions);
  const remove = dims.removeEventListener.bind(Dimensions);
  dims.addEventListener = (type, handler) => {
    const w: Handler = (d) => handler({ ...d, window: narrow(d.window) });
    wrapped.set(handler, w);
    return add(type, w);
  };
  dims.removeEventListener = (type, handler) => {
    remove(type, wrapped.get(handler) ?? handler);
    wrapped.delete(handler);
  };
}

if (typeof document !== 'undefined') {
  narrowWindow();
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
  Alert.alert = showAlert;
}
