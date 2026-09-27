// Word magnets. The vocabulary leans on the themes and diction of James
// Baldwin (love as a fierce, public force; fire and water; witness, mercy,
// home, the blues) and Mumtaza Mehri (tongue and salt, sugar and gold,
// diaspora, archives, satellites and static, grandmothers, moons). Only
// single words: the poems are the player's own.
//
// pos: art (articles and possessives), adj, noun, verb, prep, pron, conj,
//      adv, suffix, break (new line)
// moods: water, fire, body, home, sky, time, love, earth, signal

const W = (pos, moods, list) => list.split(' ').map((w) => ({ w, pos, moods }));

export const WORDS = [
  ...W('art', [], 'the a an this that my your our her their every no'),
  ...W('pron', [], 'I you we she they it us them nobody everyone'),
  ...W('conj', [], 'and but or until because if while though so'),
  ...W('prep', [], 'of in beneath toward against inside across through without between after before like above among'),
  ...W('adv', [], 'still only always never again almost softly slowly here there'),

  ...W('noun', ['water'], 'river sea salt tide rain harbor well flood'),
  ...W('noun', ['fire'], 'fire ember flame ash smoke furnace'),
  ...W('noun', ['body'], 'tongue mouth hands teeth skin bones throat eyes spine heart'),
  ...W('noun', ['home'], 'mother grandmother brother kitchen door window street table bread name language'),
  ...W('noun', ['sky'], 'moon sun stars sky wings orbit weather bird'),
  ...W('noun', ['time'], 'morning midnight years archive memory summer dusk tomorrow'),
  ...W('noun', ['love'], 'love mercy prayer song blues witness tenderness grief joy'),
  ...W('noun', ['earth'], 'dust garden stone mountain field root seed honey sugar gold'),
  ...W('noun', ['signal'], 'signal static satellite radio map border distance'),

  ...W('adj', ['water'], 'drowned blue deep salted'),
  ...W('adj', ['fire'], 'burning bright molten'),
  ...W('adj', ['body'], 'bare bruised tender hungry'),
  ...W('adj', ['home'], 'small familiar borrowed'),
  ...W('adj', ['sky'], 'luminous distant weightless'),
  ...W('adj', ['time'], 'old new unfinished'),
  ...W('adj', ['love'], 'holy fierce gentle'),
  ...W('adj', ['earth'], 'golden sweet wild'),
  ...W('adj', ['signal'], 'electric broken quiet'),

  ...W('verb', ['water'], 'drown float pour'),
  ...W('verb', ['fire'], 'burn glow'),
  ...W('verb', ['body'], 'carry hold taste breathe'),
  ...W('verb', ['home'], 'return stay name'),
  ...W('verb', ['sky'], 'rise fly fall'),
  ...W('verb', ['time'], 'remember wait begin'),
  ...W('verb', ['love'], 'love forgive sing mourn'),
  ...W('verb', ['earth'], 'bloom grow bury'),
  ...W('verb', ['signal'], 'call hum answer'),
  ...W('verb', [], 'is are was become want know'),

  ...W('suffix', [], '-s -ing -ed -ly'),
];

export const LINE_BREAK = { w: '↵', pos: 'break', moods: [] };

// What tends to follow what. Not a grammar checker: just a lean that makes
// the next handful of words feel like they belong, with room to surprise.
const NEXT = {
  start: { art: 0.3, pron: 0.25, adj: 0.15, noun: 0.1, prep: 0.1, adv: 0.05, verb: 0.05 },
  art: { adj: 0.45, noun: 0.55 },
  adj: { noun: 0.6, adj: 0.12, conj: 0.1, prep: 0.1, suffix: 0.08 },
  noun: { verb: 0.3, prep: 0.25, conj: 0.12, suffix: 0.15, noun: 0.06, adv: 0.05, break: 0.07 },
  verb: { art: 0.3, prep: 0.2, pron: 0.12, adv: 0.12, noun: 0.12, suffix: 0.14 },
  prep: { art: 0.45, pron: 0.15, noun: 0.25, adj: 0.15 },
  pron: { verb: 0.6, adv: 0.2, conj: 0.1, prep: 0.1 },
  conj: { pron: 0.35, art: 0.3, noun: 0.15, adj: 0.1, verb: 0.1 },
  adv: { verb: 0.5, adj: 0.3, prep: 0.2 },
  suffix: { prep: 0.3, conj: 0.2, verb: 0.15, art: 0.15, break: 0.2 },
  break: { art: 0.3, pron: 0.3, conj: 0.15, prep: 0.15, adv: 0.1 },
};

export const POS_COLORS = {
  art: '#f4c96b',
  pron: '#f59e8b',
  conj: '#9fd8c8',
  prep: '#8fc3f2',
  adv: '#c7b3f5',
  noun: '#f7a6c8',
  adj: '#b9a3f0',
  verb: '#86dbb0',
  suffix: '#dddddd',
  break: '#ffffff',
};

export const MOODS = ['water', 'fire', 'body', 'home', 'sky', 'time', 'love', 'earth', 'signal'];

function weighted(r, table) {
  let total = 0;
  for (const v of Object.values(table)) total += v;
  let x = r() * total;
  for (const [k, v] of Object.entries(table)) {
    x -= v;
    if (x <= 0) return k;
  }
  return Object.keys(table)[0];
}

/**
 * Chooses a handful of words to offer next. Most follow on naturally from the
 * last word, a couple lean into the current mood, and one is a wild card.
 */
export function offerWords(r, { lastPos = 'start', mood, lineLength = 0, avoid = new Set(), count = 4 }) {
  const table = { ...(NEXT[lastPos] ?? NEXT.start) };
  // The longer the line, the more a line break is on offer.
  if (lineLength >= 3) table.break = (table.break ?? 0) + 0.06 * (lineLength - 2);
  if (lineLength === 0) delete table.suffix;

  const out = [];
  const used = new Set();
  const pick = (pos, preferMood) => {
    if (pos === 'break') return used.has('↵') ? null : LINE_BREAK;
    let pool = WORDS.filter((x) => x.pos === pos && !used.has(x.w) && !avoid.has(x.w));
    if (!pool.length) pool = WORDS.filter((x) => x.pos === pos && !used.has(x.w));
    if (preferMood) {
      const moody = pool.filter((x) => x.moods.includes(mood));
      if (moody.length && r() < 0.75) pool = moody;
    }
    return pool.length ? pool[Math.floor(r() * pool.length)] : null;
  };

  for (let i = 0; i < count; i++) {
    let word = null;
    for (let tries = 0; tries < 6 && !word; tries++) {
      const wild = i === count - 1; // one surprise per cluster
      const pos = wild ? weighted(r, NEXT.start) : weighted(r, table);
      word = pick(pos, !wild);
    }
    if (word) {
      used.add(word.w);
      out.push(word);
    }
  }
  return out;
}

/** Joins words into text, gluing suffix tiles onto the word before. */
export function lineText(words) {
  let s = '';
  for (const w of words) {
    if (w.pos === 'suffix') s += w.w.slice(1);
    else s += (s ? ' ' : '') + w.w;
  }
  return s;
}
