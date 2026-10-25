import { running } from './running';
import { chess } from './chess';
import { wellness } from './wellness';
import { usAndTheDog } from './usAndTheDog';
import { newYorkCity } from './newYorkCity';
import { fall } from './fall';
import type { StarterGrid } from './types';

/** The six official grids, in shelf order. */
export const STARTERS: StarterGrid[] = [running, chess, wellness, usAndTheDog, newYorkCity, fall];
