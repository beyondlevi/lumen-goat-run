import type {Kind} from './track';
import type {ZoneKey} from './zones';

/**
 * Every text the game shows. English is the default; Brazilian Portuguese for any pt-* (the
 * glasses run pt-PT). `{name}` is a placeholder, filled with [fill]; numbers go through
 * [numberFormat] first.
 */
// A no-break space (\u00a0) keeps a number and its unit on one line.
const en = {
  title: 'GOAT RUN',
  tagline: 'HOW FAR CAN YOU RUN?',
  play: 'SWIPE UP TO PLAY',
  bestLine: 'Best: {meters} m · Zone {zone}',
  firstRun: 'Your first run',
  titleHints: 'Index tap: how to play · Middle tap: exit',
  howTitle: 'HOW TO PLAY',
  swipeLeft: 'SWIPE LEFT',
  swipeLeftText: 'One lane left',
  swipeRight: 'SWIPE RIGHT',
  swipeRightText: 'One lane right',
  swipeUp: 'SWIPE UP',
  swipeUpText: 'Jump over low things',
  swipeDown: 'SWIPE DOWN',
  swipeDownText: 'Slide under branches',
  jump: 'JUMP',
  jumpText: 'Rocks, fences',
  slide: 'SLIDE',
  slideText: 'Low branches',
  dodge: 'DODGE',
  dodgeText: 'Boulders, trees',
  collect: 'COLLECT',
  collectText: 'Clovers',
  howRows: 'Some rows block two lanes: take the third.',
  howZones: 'Faster in each zone: Meadow, Forest at {forest}\u00a0m, Snow at {snow}\u00a0m. On ice you cannot turn.',
  howPause: 'Middle tap during a run: pause',
  howHint: 'Index tap or middle tap: back',
  meters: '{meters} m',
  best: 'BEST {meters} m',
  zone: 'ZONE {number} · {name}',
  hintLane: 'Lane',
  hintJump: 'Jump',
  hintSlide: 'Slide',
  hintPause: 'Middle tap: pause',
  iceTip: 'Ice: you cannot change lanes on it',
  plusOne: '+1',
  bannerZone: 'ZONE {number}',
  faster: 'Faster now.',
  paused: 'PAUSED',
  pausedLine: '{meters} m · {clovers} · {zone}',
  cloverOne: '{count} clover',
  cloverMany: '{count} clovers',
  resume: 'Resume',
  resumeHint: 'Index tap',
  quit: 'Quit run',
  quitHint: 'Middle tap',
  pauseHints: 'Index tap: resume · Middle tap: quit',
  crash: 'CRASH!',
  newBest: 'NEW BEST',
  overLine: 'Zone {zone} · {name} · best {best} m',
  overLineRecord: 'Zone {zone} · {name} · previous best {best} m',
  overLineFirst: 'Zone {zone} · {name} · your first run',
  again: 'SWIPE UP: AGAIN',
  overHint: 'Middle tap: exit',
  zones: {
    meadow: {name: 'MEADOW', title: 'Meadow', banner: ['', '']},
    forest: {name: 'FOREST', title: 'Forest', banner: ['Low branches:', 'swipe down to slide.']},
    snow: {name: 'SNOW', title: 'Snow', banner: ['Ice patches:', 'no lane changes on them.']},
  } as Record<ZoneKey, {name: string; title: string; banner: [string, string]}>,
  hits: {
    rock: 'Hit a rock · swipe up to jump',
    fence: 'Hit a fence · swipe up to jump',
    branch: 'Hit a low branch · swipe down to slide',
    boulder: 'Hit a boulder · swipe left or right',
    pine: 'Hit a tree · swipe left or right',
  } as Record<Kind, string>,
};

export type Strings = typeof en;

const pt: Strings = {
  title: 'GOAT RUN',
  tagline: 'ATÉ ONDE VOCÊ CORRE?',
  play: 'DESLIZE PARA CIMA',
  bestLine: 'Recorde: {meters} m · Zona {zone}',
  firstRun: 'Sua primeira corrida',
  titleHints: 'Indicador: como jogar · Médio: sair',
  howTitle: 'COMO JOGAR',
  swipeLeft: 'À ESQUERDA',
  swipeLeftText: 'Uma pista à esquerda',
  swipeRight: 'À DIREITA',
  swipeRightText: 'Uma pista à direita',
  swipeUp: 'PARA CIMA',
  swipeUpText: 'Pula coisas baixas',
  swipeDown: 'PARA BAIXO',
  swipeDownText: 'Escorrega sob galhos',
  jump: 'PULAR',
  jumpText: 'Pedras, cercas',
  slide: 'ESCORREGAR',
  slideText: 'Galhos baixos',
  dodge: 'DESVIAR',
  dodgeText: 'Rochas, árvores',
  collect: 'PEGAR',
  collectText: 'Trevos',
  howRows: 'Algumas fileiras fecham duas pistas: vá pela terceira.',
  howZones: 'Mais rápido a cada zona: Prado, Floresta a {forest}\u00a0m, Neve a {snow}\u00a0m. No gelo você não muda de pista.',
  howPause: 'Médio durante a corrida: pausa',
  howHint: 'Indicador ou médio: voltar',
  meters: '{meters} m',
  best: 'RECORDE {meters} m',
  zone: 'ZONA {number} · {name}',
  hintLane: 'Pista',
  hintJump: 'Pular',
  hintSlide: 'Escorregar',
  hintPause: 'Médio: pausa',
  iceTip: 'Gelo: você não muda de pista nele',
  plusOne: '+1',
  bannerZone: 'ZONA {number}',
  faster: 'Mais rápido agora.',
  paused: 'PAUSA',
  pausedLine: '{meters} m · {clovers} · {zone}',
  cloverOne: '{count} trevo',
  cloverMany: '{count} trevos',
  resume: 'Continuar',
  resumeHint: 'Indicador',
  quit: 'Sair da corrida',
  quitHint: 'Médio',
  pauseHints: 'Indicador: continuar · Médio: sair',
  crash: 'BATEU!',
  newBest: 'NOVO RECORDE',
  overLine: 'Zona {zone} · {name} · recorde {best} m',
  overLineRecord: 'Zona {zone} · {name} · recorde anterior {best} m',
  overLineFirst: 'Zona {zone} · {name} · sua primeira corrida',
  again: 'DE NOVO: PARA CIMA',
  overHint: 'Médio: sair',
  zones: {
    meadow: {name: 'PRADO', title: 'Prado', banner: ['', '']},
    forest: {name: 'FLORESTA', title: 'Floresta', banner: ['Galhos baixos:', 'deslize para baixo.']},
    snow: {name: 'NEVE', title: 'Neve', banner: ['Gelo: você não', 'muda de pista nele.']},
  },
  hits: {
    rock: 'Bateu numa pedra · deslize para cima e pule',
    fence: 'Bateu numa cerca · deslize para cima e pule',
    branch: 'Bateu num galho · deslize para baixo e escorregue',
    boulder: 'Bateu numa rocha · deslize para o lado',
    pine: 'Bateu numa árvore · deslize para o lado',
  },
};

const catalogs: Record<'en' | 'pt', Strings> = {en, pt};

/** The base language used for [language] (a BCP 47 tag): one with a catalog, else English. */
export function languageFor(language: string | undefined | null): 'en' | 'pt' {
  const base = (language ?? 'en').toLowerCase().split('-')[0];
  return base === 'pt' ? 'pt' : 'en';
}

/** The strings for [language]: its base language if there is a catalog, else English. */
export function stringsFor(language: string | undefined | null): Strings {
  return catalogs[languageFor(language)];
}

/** Formats a number for [language]: 1,842 in English, 1.842 in Brazilian Portuguese. */
export function numberFormat(language: string | undefined | null): (n: number) => string {
  const format = new Intl.NumberFormat(languageFor(language) === 'pt' ? 'pt-BR' : 'en-US');
  return (n) => format.format(n);
}

/** Fills `{name}` placeholders. */
export function fill(text: string, values: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? `{${key}}`));
}

export const catalogsForTests = {en, pt};
