import { TINY } from './tiny';
import { SMALL } from './small';
import { MEDIUM } from './medium';
import { FULL } from './full';
import type { StarterGrid } from '../types';

/**
 * Official grids for the Atlas, there to browse and pick from on day one. Unlike STARTERS
 * they are not put on anyone's shelf, and they are not seeded into the database yet.
 */
export const PREMADE: StarterGrid[] = [...TINY, ...SMALL, ...MEDIUM, ...FULL];
