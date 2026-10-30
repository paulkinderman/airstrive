// The Echo Show screens, as APL documents (Amazon's layout format) and the data they bind.
// Sizes are in vw/vh so one document fits every Echo Show from the 5 to the 21; the round
// Echo Spot drops the side panel. Colors follow the app (src/theme) on the dark ground of the device.
import type { ShelfGrid } from './skill.ts';

export interface Photo { url: string | null; title: string; meta: string; color: string }

const C = {
  ground: '#1C2028', panel: '#232832', tile: '#2A303B', ink: '#F3F1EC', muted: '#A3AAB6',
  yellow: '#F5B61C', paper: '#FBFAF7', paperInk: '#1F2937', scrapInk: '#8A7B63',
};

// deno-lint-ignore no-explicit-any
type Json = any;

function doc(mainTemplate: Json, extra: Json = {}): Json {
  return {
    type: 'APL',
    version: '2023.3',
    theme: 'dark',
    // Keep the screen up for ten minutes, the most a skill gets; the photo show is for watching.
    settings: { idleTimeout: 600000 },
    background: C.ground,
    layouts: LAYOUTS,
    mainTemplate: { parameters: ['payload'], ...mainTemplate },
    ...extra,
  };
}

/** Mixes a grid color into the tile color, like the app's revealed squares (30 to 35 percent). */
export function mix(hex: string, into: string, amount: number): string {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [a, b] = [p(/^#[0-9a-f]{6}$/i.test(hex) ? hex : C.yellow), p(into)];
  return '#' + a.map((v, i) => Math.round(v * amount + b[i] * (1 - amount)).toString(16).padStart(2, '0')).join('');
}

const LAYOUTS: Json = {
  // A grid on the shelf: name, progress and Next up. Tapping it opens the board.
  GridCard: {
    parameters: ['grid'],
    item: {
      type: 'TouchWrapper',
      onPress: [{ type: 'SendEvent', arguments: ['grid', '${grid.id}'] }],
      item: {
        type: 'Container', width: '100%', paddingTop: '2.4vh', paddingBottom: '2.4vh', paddingLeft: '2vw', paddingRight: '2vw',
        backgroundColor: C.panel, borderRadius: '2vh', direction: 'column',
        items: [
          { type: 'Container', direction: 'row', alignItems: 'center', items: [
            { type: 'Frame', width: '2.6vh', height: '2.6vh', borderRadius: '0.7vh', backgroundColor: '${grid.color}' },
            { type: 'Text', text: '${grid.title}', fontSize: '4vh', fontWeight: '700', color: C.ink, paddingLeft: '1.2vw', maxLines: 1, grow: 1, shrink: 1 },
          ] },
          { type: 'Text', text: '${grid.count}', fontSize: '2.8vh', color: C.muted, paddingTop: '0.6vh' },
          { type: 'Frame', width: '100%', height: '1vh', borderRadius: '0.5vh', backgroundColor: C.tile, marginTop: '1.2vh',
            item: { type: 'Frame', width: '${grid.percent}', height: '100%', borderRadius: '0.5vh', backgroundColor: '${grid.color}' } },
          { type: 'Text', when: '${grid.nextUp}', text: '<b>Next up</b> ${grid.nextUp}', fontSize: '2.8vh', color: C.ink, paddingTop: '1.4vh', maxLines: 2 },
        ],
      },
    },
  },
  // A photo, or the grid's color when the moment has none.
  PhotoFill: {
    parameters: ['photo', 'radius'],
    item: {
      type: 'Frame', width: '100%', height: '100%', borderRadius: '${radius}', backgroundColor: '${photo.color}',
      item: { type: 'Image', when: '${photo.url}', source: '${photo.url}', width: '100%', height: '100%', scale: 'best-fill', borderRadius: '${radius}' },
    },
  },
  // The scrapbook caption under a photo.
  Caption: {
    parameters: ['photo', 'size'],
    item: {
      type: 'Container', backgroundColor: C.paper, borderRadius: '0.6vh',
      paddingTop: '1.6vh', paddingBottom: '1.4vh', paddingLeft: '2vw', paddingRight: '2vw',
      items: [
        { type: 'Text', text: '${photo.title}', fontSize: '${size}', fontWeight: '700', color: C.paperInk, maxLines: 2 },
        { type: 'Text', text: '${photo.meta}', fontSize: '2.4vh', color: C.scrapInk, letterSpacing: '0.1vh', paddingTop: '0.6vh', maxLines: 1 },
      ],
    },
  },
};

function cardData(g: ShelfGrid) {
  return {
    id: g.user_grid_id, title: g.title, color: g.color,
    count: g.finished ? `Finished · ${g.total} squares` : `${g.done} of ${g.total} done${g.together ? ' · together' : ''}`,
    percent: `${g.total ? Math.round((g.done / g.total) * 100) : 0}%`,
    nextUp: g.finished ? '' : g.next_up ?? '',
  };
}

const hint = (text: string) => ({ type: 'Text', text, fontSize: '2.6vh', color: C.muted, maxLines: 2 });

/** Home: the newest moment friends shared, big, with the next few beside it; the shelf when friends haven't shared any. */
export function homeDocument({ greeting, photos, grids }: { greeting: string; photos: Photo[]; grids: ShelfGrid[] }) {
  const [hero, ...rest] = photos;
  const payload = {
    greeting, hero: hero ?? null, rest: rest.slice(0, 3), hasPhotos: photos.length > 0,
    grids: grids.filter((g) => !g.finished).slice(0, 3).map(cardData),
  };
  const left = [
    {
      type: 'TouchWrapper', when: '${payload.hasPhotos}', width: '100%', height: '100%',
      onPress: [{ type: 'SendEvent', arguments: ['photos'] }],
      item: { type: 'Container', width: '100%', height: '100%', items: [
        { type: 'PhotoFill', photo: '${payload.hero}', radius: '3vh' },
        { type: 'Container', position: 'absolute', left: '2vw', bottom: '3vh', right: '2vw', alignItems: 'start',
          items: [{ type: 'Caption', photo: '${payload.hero}', size: '4.6vh' }] },
      ] },
    },
    {
      type: 'Container', when: '${!payload.hasPhotos}', width: '100%', height: '100%', direction: 'column', justifyContent: 'center',
      items: [
        { type: 'Text', text: 'Your grids', fontSize: '3vh', fontWeight: '700', color: C.yellow, letterSpacing: '0.3vh', paddingBottom: '1.6vh' },
        { type: 'Sequence', data: '${payload.grids}', grow: 1, spacing: '1.6vh', items: [{ type: 'GridCard', grid: '${data}' }] },
      ],
    },
  ];
  const side = {
    type: 'Container', when: "${viewport.shape != 'round'}", width: '38vw', height: '100%', paddingLeft: '3vw', direction: 'column',
    items: [
      { type: 'Text', text: '${payload.greeting}', fontSize: '6.4vh', fontWeight: '700', color: C.ink },
      {
        type: 'Sequence', when: '${payload.hasPhotos}', data: '${payload.rest}', grow: 1, shrink: 1, paddingTop: '3vh', spacing: '2.4vh',
        items: [{
          type: 'TouchWrapper', onPress: [{ type: 'SendEvent', arguments: ['photos'] }],
          item: { type: 'Container', direction: 'row', alignItems: 'center', items: [
            { type: 'Container', width: '11vh', height: '11vh', items: [{ type: 'PhotoFill', photo: '${data}', radius: '1.8vh' }] },
            { type: 'Container', grow: 1, shrink: 1, paddingLeft: '1.6vw', items: [
              { type: 'Text', text: '${data.title}', fontSize: '3.4vh', fontWeight: '700', color: C.ink, maxLines: 2 },
              { type: 'Text', text: '${data.meta}', fontSize: '2.4vh', color: C.muted, maxLines: 1, paddingTop: '0.4vh' },
            ] },
          ] },
        }],
      },
      { type: 'Container', when: '${!payload.hasPhotos}', grow: 1, paddingTop: '3vh', items: [
        { type: 'Text', text: 'When friends share moments with you, their photos show up here.', fontSize: '3.2vh', color: C.muted },
      ] },
      hint('Try “show the photos”, “what’s next” or “show my grids”'),
    ],
  };
  return {
    document: doc({ items: [{
      type: 'Container', width: '100vw', height: '100vh', direction: 'row',
      paddingTop: '5vh', paddingBottom: '5vh', paddingLeft: '4vw', paddingRight: '4vw',
      items: [{ type: 'Container', grow: 1, shrink: 1, height: '100%', items: left }, side],
    }] }),
    datasources: { payload },
  };
}

/** The photo show: one photo at a time, full screen, with its caption. `auto` turns a page every 15 seconds. */
export function photosDocument(photos: Photo[], auto: boolean) {
  return {
    document: doc({ items: [{
      type: 'Pager', id: 'pager', width: '100vw', height: '100vh', navigation: 'wrap', data: '${payload.photos}',
      items: [{
        type: 'Container', width: '100%', height: '100%',
        items: [
          { type: 'PhotoFill', photo: '${data}', radius: '0' },
          { type: 'Container', position: 'absolute', left: '4vw', right: '4vw', bottom: '5vh', alignItems: 'start',
            items: [{ type: 'Caption', photo: '${data}', size: '5.4vh' }] },
        ],
      }],
    }] }, auto && photos.length > 1 ? { onMount: [{ type: 'AutoPage', componentId: 'pager', duration: 15000 }] } : {}),
    datasources: { payload: { photos } },
  };
}

// Each square's side in dp: the board fills 78 percent of the height, or 46 percent of the width
// on a narrower screen (80 percent on the round Echo Spot, which has no side panel).
const SQUARE = "${Math.min(viewport.height * 0.78 / payload.rows, viewport.width * (viewport.shape == 'round' ? 0.8 : 0.46) / payload.cols)}";

/** One grid: the board, its progress and Next up. Done squares show their photo; tapping one opens the moment. */
export function gridDocument(g: ShelfGrid, urls: Map<string, string>) {
  const rows = Math.max(1, g.rows), cols = Math.max(1, g.cols);
  const board = [];
  for (let r = 0; r < rows; r++) {
    board.push({
      squares: g.squares.filter((s) => Math.floor(s.idx / cols) === r).map((s) => ({
        idx: s.idx,
        color: s.state === 'done' ? g.color : s.state === 'revealed' ? mix(g.color, C.tile, 0.35) : C.tile,
        url: s.state === 'done' && s.cover_path ? urls.get(s.cover_path) ?? null : null,
      })),
    });
  }
  const payload = { grid: cardData(g), rows, cols, board };
  return {
    document: doc({ items: [{
      type: 'Container', width: '100vw', height: '100vh', direction: 'row', alignItems: 'center',
      paddingLeft: '4vw', paddingRight: '4vw',
      items: [
        {
          type: 'Container', backgroundColor: C.panel, borderRadius: '3vh', paddingTop: '1.6vh', paddingBottom: '1.6vh', paddingLeft: '1.6vh', paddingRight: '1.6vh',
          data: '${payload.board}',
          items: [{
            type: 'Container', direction: 'row', data: '${data.squares}',
            items: [{
              type: 'TouchWrapper', onPress: [{ type: 'SendEvent', arguments: ['square', '${payload.grid.id}', '${data.idx}'] }],
              item: { type: 'Container', width: SQUARE, height: SQUARE, paddingTop: '0.5vh', paddingBottom: '0.5vh', paddingLeft: '0.5vh', paddingRight: '0.5vh',
                items: [{ type: 'PhotoFill', photo: '${data}', radius: '1.2vh' }] },
            }],
          }],
        },
        {
          type: 'Container', when: "${viewport.shape != 'round'}", grow: 1, shrink: 1, paddingLeft: '4vw', direction: 'column',
          items: [
            { type: 'Text', text: '${payload.grid.title}', fontSize: '7vh', fontWeight: '700', color: C.ink, maxLines: 2 },
            { type: 'Text', text: '${payload.grid.count}', fontSize: '3.2vh', color: C.muted, paddingTop: '1vh' },
            {
              type: 'Container', when: '${payload.grid.nextUp}', backgroundColor: C.panel, borderRadius: '2.6vh', marginTop: '3vh',
              paddingTop: '2.6vh', paddingBottom: '2.6vh', paddingLeft: '2vw', paddingRight: '2vw',
              items: [
                { type: 'Text', text: 'NEXT UP', fontSize: '2.2vh', fontWeight: '800', letterSpacing: '0.4vh', color: C.yellow },
                { type: 'Text', text: '${payload.grid.nextUp}', fontSize: '4vh', fontWeight: '700', color: C.ink, paddingTop: '0.8vh', maxLines: 3 },
              ],
            },
            { type: 'Container', grow: 1 },
            hint('Tap a done square to see its moment'),
          ],
        },
      ],
    }] }),
    datasources: { payload },
  };
}

/** The shelf: every grid as a card, side by side. */
export function shelfDocument(grids: ShelfGrid[]) {
  return {
    document: doc({ items: [{
      type: 'Container', width: '100vw', height: '100vh', paddingTop: '6vh', paddingBottom: '6vh', paddingLeft: '4vw', paddingRight: '4vw',
      items: [
        { type: 'Text', text: 'Your grids', fontSize: '6.4vh', fontWeight: '700', color: C.ink, paddingBottom: '3vh' },
        {
          type: 'Sequence', scrollDirection: 'horizontal', data: '${payload.grids}', grow: 1, spacing: '2vw',
          items: [{ type: 'Container', width: '34vw', items: [{ type: 'GridCard', grid: '${data}' }] }],
        },
        hint('Tap a grid to open it'),
      ],
    }] }),
    datasources: { payload: { grids: grids.map(cardData) } },
  };
}

/** Before the account is linked. */
export function linkDocument() {
  const tile = (on: boolean) => ({ type: 'Frame', width: '4vh', height: '4vh', borderRadius: '1vh', backgroundColor: on ? C.yellow : C.tile, margin: '0.5vh' });
  // The app's mark: a three-by-three grid, checkered.
  const mark = [0, 1, 2].map((r) => ({ type: 'Container', direction: 'row', items: [0, 1, 2].map((c) => tile((r * 3 + c) % 2 === 0)) }));
  return {
    document: doc({ items: [{
      type: 'Container', width: '100vw', height: '100vh', alignItems: 'center', justifyContent: 'center',
      paddingLeft: '8vw', paddingRight: '8vw',
      items: [
        { type: 'Container', backgroundColor: C.panel, borderRadius: '3vh', paddingTop: '1.6vh', paddingBottom: '1.6vh', paddingLeft: '1.6vh', paddingRight: '1.6vh', items: mark },
        { type: 'Text', text: 'Link your AirStrive account', fontSize: '6.4vh', fontWeight: '700', color: C.ink, textAlign: 'center', paddingTop: '4vh' },
        { type: 'Text', text: 'Open the Alexa app on your phone. Tap More, then Skills & Games, then AirStrive, and sign in.', fontSize: '3.4vh', color: C.muted, textAlign: 'center', paddingTop: '2vh' },
      ],
    }] }),
    datasources: { payload: {} },
  };
}
