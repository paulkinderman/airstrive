/**
 * HTML for things AirStrive prints: the chapter poster and the Memory Lane PDF in the
 * export. Pure functions; images come in as data URIs so the printer needs no files.
 */

export interface PrintMoment {
  title: string;
  gridTitle: string;
  gridColor: string;
  happenedOn: string;
  body: string;
  place: string;
  weather: string;
  withPeople: string;
  photos: string[]; // data URIs, cover first
}

export interface PrintChapter {
  gridTitle: string;
  gridColor: string;
  cols: number;
  tiles: (string | null)[]; // data URI or null for a solid tile
  caption: string;
}

export type PrintPage = { kind: 'moment'; moment: PrintMoment } | { kind: 'chapter'; chapter: PrintChapter };

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export function longDate(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

const FONTS = `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fredoka:wght@600&family=Nunito:wght@600;700&family=Caveat:wght@500&display=swap">`;
const BASE = `
  @page { margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: 'Nunito', system-ui, sans-serif; color: #1F2937; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .display { font-family: 'Fredoka', system-ui, sans-serif; font-weight: 600; }
  .hand { font-family: 'Caveat', cursive; }
  .label { font-size: 11px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; }
`;

function mosaic(c: PrintChapter, width: number) {
  const gap = 4;
  const cell = (width - 20 - gap * (c.cols - 1)) / c.cols;
  const tiles = c.tiles
    .map((t) => (t
      ? `<div style="width:${cell}px;height:${cell}px;background:url('${t}') center/cover"></div>`
      : `<div style="width:${cell}px;height:${cell}px;background:${c.gridColor}"></div>`))
    .join('');
  return `<div style="display:flex;flex-wrap:wrap;gap:${gap}px;width:${width}px;padding:10px;background:#fff;box-shadow:0 10px 30px rgba(0,0,0,.35)">${tiles}</div>`;
}

function chapterPage(c: PrintChapter) {
  return `<section class="page" style="background:#1F2937;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:28px">
    ${mosaic(c, 460)}
    <div style="text-align:center;display:flex;flex-direction:column;gap:10px">
      <div class="label" style="color:${c.gridColor}">Grid complete</div>
      <div class="display" style="font-size:52px;line-height:1;color:#fff">${esc(c.gridTitle)}</div>
      <div class="hand" style="font-size:28px;color:#D5DAE1">${esc(c.caption)}</div>
    </div>
  </section>`;
}

function momentPage(m: PrintMoment, page: number) {
  const [cover, ...rest] = m.photos;
  const tags = [m.place, m.weather, m.withPeople ? `With ${m.withPeople}` : ''].filter(Boolean)
    .map((t) => `<span style="border:1.5px solid #D9CFBE;border-radius:15px;padding:4px 12px;font-size:12px;color:#8A7B63;font-weight:700">${esc(t)}</span>`).join(' ');
  const polaroid = (src: string, w: number, h: number, rot: number) =>
    `<div style="background:#fff;padding:8px 8px 26px;box-shadow:0 8px 14px rgba(31,41,55,.18);transform:rotate(${rot}deg);display:inline-block"><div style="width:${w}px;height:${h}px;background:url('${src}') center/cover"></div></div>`;
  return `<section class="page" style="background:#F6F1E7;padding:56px 64px;display:flex;flex-direction:column;gap:18px">
    ${cover ? `<div style="text-align:center;padding:10px 0">${polaroid(cover, 420, 315, -1.5)}</div>` : ''}
    <div class="label" style="color:#8A7B63;display:flex;align-items:center;gap:8px"><span style="width:10px;height:10px;border-radius:3px;background:${m.gridColor};display:inline-block"></span>${esc(m.gridTitle)} · ${longDate(m.happenedOn)}</div>
    <div class="display" style="font-size:${cover ? 30 : 40}px;line-height:1.1">${esc(m.title)}</div>
    ${!cover ? `<div style="width:48px;height:3px;border-radius:2px;background:${m.gridColor}"></div>` : ''}
    <div class="hand" style="font-size:24px;line-height:1.45;color:#3A3F49;white-space:pre-wrap">${m.body ? esc(m.body) : '<span style="color:#AEB5C0">No words this time.</span>'}</div>
    ${tags ? `<div style="display:flex;gap:8px;flex-wrap:wrap">${tags}</div>` : ''}
    ${rest.length ? `<div style="display:flex;gap:16px;flex-wrap:wrap;padding-top:8px">${rest.map((p, i) => polaroid(p, 130, 130, i % 2 ? 2 : -2)).join('')}</div>` : ''}
    <div style="flex:1"></div>
    <div style="text-align:center;font-size:12px;font-weight:700;color:#C9BDA8">${page}</div>
  </section>`;
}

const PAGE_CSS = `.page { width: 8.5in; height: 11in; overflow: hidden; page-break-after: always; }`;

export function posterHtml(c: PrintChapter): string {
  return `<!doctype html><html><head><meta charset="utf-8">${FONTS}<style>${BASE}${PAGE_CSS}</style></head><body>${chapterPage(c)}</body></html>`;
}

/** Oldest page first, like a book. Pages are passed newest first, as Memory Lane lists them. */
export function scrapbookHtml(pages: PrintPage[], owner: string): string {
  const ordered = [...pages].reverse();
  const body = ordered.map((p, i) => (p.kind === 'moment' ? momentPage(p.moment, i + 1) : chapterPage(p.chapter))).join('');
  const title = `<section class="page" style="background:#F6F1E7;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px">
    <div class="label" style="color:#8A7B63">Memory Lane</div>
    <div class="display" style="font-size:56px">${esc(owner)}</div>
    <div class="hand" style="font-size:28px;color:#8A7B63">${ordered.length} page${ordered.length === 1 ? '' : 's'} · moments over metrics</div>
  </section>`;
  return `<!doctype html><html><head><meta charset="utf-8">${FONTS}<style>${BASE}${PAGE_CSS}</style></head><body>${title}${body}</body></html>`;
}

export function chapterCaption(momentCount: number, firstOn: string | null, lastOn: string | null) {
  const n = `${momentCount} moment${momentCount === 1 ? '' : 's'}`;
  if (!firstOn || !lastOn) return n;
  const short = (iso: string) => longDate(iso).replace(/^(\w{3})\w*/, '$1');
  const sameYear = firstOn.slice(0, 4) === lastOn.slice(0, 4);
  const from = sameYear ? short(firstOn).replace(/, \d{4}$/, '') : short(firstOn);
  return firstOn === lastOn ? `${n} · ${short(lastOn)}` : `${n} · ${from} to ${short(lastOn)}`;
}
