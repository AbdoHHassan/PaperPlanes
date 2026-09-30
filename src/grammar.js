// The poem grammar: line patterns, forms, inflection, syllables and rhyme,
// and the Composer that decides which magnets to offer next.
//
// Structure: each line follows a pattern of slots (det adj noun v ...).
// Small glue words ("like", "of", "what if") snap in on their own; the
// player chooses the words that carry meaning. Verbs agree with their
// subject, nouns pluralise, "a" becomes "an".
//
// Serendipity: every handful of magnets mixes words that fit the drifting
// mood, a "spice" word from a wider register (wild, pop, genz, news) that
// adapts to your taste, and a surprise: a phrase that re-routes the line,
// a rhyme, an echo of your own earlier words, or a line ending.

import { LEXICON, PHRASES, CLOSERS, UNCOUNTABLE } from './lexicon.js';

// ---------------------------------------------------------------- inflection

const IRREGULAR_PAST = {
  eat: 'ate', fly: 'flew', fall: 'fell', rise: 'rose', grow: 'grew', sing: 'sang', hold: 'held', know: 'knew',
  become: 'became', begin: 'began', swim: 'swam', sink: 'sank', shine: 'shone', bleed: 'bled', forget: 'forgot',
  forgive: 'forgave', stay: 'stayed', pray: 'prayed', slay: 'slayed', buffer: 'buffered', orbit: 'orbited',
};
const DOUBLE = new Set(['swim', 'hum', 'begin', 'forget', 'ship', 'scroll']);
const IRREGULAR_PLURAL = { tooth: 'teeth', foot: 'feet', child: 'children', mouse: 'mice', person: 'people' };

const isVowel = (c) => 'aeiou'.includes(c);

export function plural(n) {
  if (IRREGULAR_PLURAL[n]) return IRREGULAR_PLURAL[n];
  const parts = n.split(' ');
  const last = parts.pop();
  let p;
  if (/(s|sh|ch|x|z)$/.test(last)) p = last + 'es';
  else if (/[^aeiou]y$/.test(last)) p = last.slice(0, -1) + 'ies';
  else if (/(volcano|tomato|potato|hero|echo)$/.test(last)) p = last + 'es';
  else if (/fe$/.test(last)) p = last.slice(0, -2) + 'ves';
  else if (/(lea|wol|sel|hal)f$/.test(last)) p = last.slice(0, -1) + 'ves';
  else p = last + 's';
  return [...parts, p].join(' ');
}

export function thirdPerson(v) {
  if (/(s|sh|ch|x|z|o)$/.test(v)) return v + 'es';
  if (/[^aeiou]y$/.test(v)) return v.slice(0, -1) + 'ies';
  return v + 's';
}

export function past(v) {
  if (IRREGULAR_PAST[v]) return IRREGULAR_PAST[v];
  if (v.endsWith('e')) return v + 'd';
  if (/[^aeiou]y$/.test(v)) return v.slice(0, -1) + 'ied';
  if (DOUBLE.has(v)) return v + v.at(-1) + 'ed';
  return v + 'ed';
}

export function gerund(v) {
  if (v.endsWith('ie')) return v.slice(0, -2) + 'ying';
  if (v.endsWith('e') && !v.endsWith('ee') && v !== 'be') return v.slice(0, -1) + 'ing';
  if (DOUBLE.has(v)) return v + v.at(-1) + 'ing';
  return v + 'ing';
}

// ------------------------------------------------------- syllables & rhyme

export function syllables(text) {
  let n = 0;
  for (const raw of text.toLowerCase().split(/[\s-]+/)) {
    const w = raw.replace(/[^a-z0-9]/g, '');
    if (!w) continue;
    if (/^\d+k$/.test(w)) {
      n += 2; // "4K"
      continue;
    }
    let s = (w.match(/[aeiouy]+/g) || []).length;
    if (w.length > 2 && w.endsWith('e') && !/(le|ee|ie|ye)$/.test(w)) s -= 1; // silent e
    if (/[^aeiou]ed$/.test(w) && !/(t|d)ed$/.test(w)) s -= 1; // "burned"
    n += Math.max(1, s);
  }
  return n;
}

/** Slant rhyme: just the last vowel sound (flame / rain, tide / light). */
export function slantKey(text) {
  const k = rhymeKey(text);
  const m = k.match(/^[aeiouAEO]+/);
  return m ? m[0].replace(/^a(?=[^aeiou]*e?$)/, 'a') : k;
}

/** A rough rhyme key: the last vowel sound and what follows it. */
export function rhymeKey(text) {
  const w = text.toLowerCase().split(/\s+/).pop().replace(/[^a-z]/g, '');
  if (!w) return '';
  // One-syllable -y words say "eye" (sky, fly); longer ones say "ee" (memory).
  const shortY = /^[^aeiouy]*y$/.test(w);
  let s = w
    .replace(/igh/g, 'i')
    .replace(/(ea|ee)/g, 'E')
    .replace(/y$/g, shortY ? 'i' : 'E')
    .replace(/a([^aeiou])e$/, 'A$1')
    .replace(/o([^aeiou])e$/, 'O$1')
    .replace(/i([^aeiou])e$/, 'i$1')
    .replace(/(ai|ay)/g, 'A')
    .replace(/(ow|ou)/g, 'O')
    .replace(/([^aeiouAEO])e$/, '$1');
  const m = s.match(/[aeiouAEO]+[^aeiouAEO]*$/);
  return m ? m[0] : s.slice(-2);
}

// ---------------------------------------------------------------- patterns
//
// Slots: det dets adj noun nouns v (agrees with subject) verb (base,
// imperative) ved ving prep subj adv BE (am/is/are). Anything else is a
// literal that snaps in by itself. "|" marks a point where the line may end.

export const PATTERNS = [
  { p: 'det adj noun v | prep det noun', w: 3 },
  { p: 'subj v prep det noun |', w: 3 },
  { p: 'prep det noun , subj v | dets nouns', w: 2 },
  { p: 'det noun v like det adj noun', w: 3 },
  { p: 'subj BE adj like dets nouns', w: 2 },
  { p: 'subj ved dets nouns | prep det noun', w: 2 },
  { p: 'what if det noun v | adv', w: 2 },
  { p: 'adj , adj noun', w: 1.5 },
  { p: 'nouns v prep det noun |', w: 2 },
  { p: 'det noun of det noun |', w: 2 },
  { p: 'and subj v det noun |', w: 1.5 },
  { p: 'verb det adj noun | prep det noun', w: 2 },
  { p: 'adv subj BE ving |', w: 1.5 },
  { p: 'who ved det adj noun ?', w: 1 },
  { p: 'even dets nouns v | adv', w: 1.5 },
  { p: 'subj keep ving | prep det noun', w: 2 },
  { p: 'there is det noun in det noun', w: 2 },
  { p: 'I v you like det noun', w: 2 },
  { p: 'det adj nouns |', w: 1 },
  { p: 'somewhere , det noun BE ving', w: 1.5 },
];

// Short patterns that fit haiku lines.
const SHORT = ['det adj noun |', 'dets adj nouns |', 'det noun v |', 'subj v prep det noun |', 'adj , adj noun', 'nouns v |', 'verb det noun |', 'prep det adj noun |', 'det noun of det noun |'];

export const FORMS = {
  haiku: { label: 'haiku', lines: 3, syllables: [5, 7, 5], blurb: 'three lines · 5 7 5' },
  couplets: { label: 'couplets', lines: 6, stanza: 2, rhyme: true, blurb: 'rhyming pairs' },
  litany: { label: 'litany', lines: 5, blurb: 'every line begins the same' },
  letter: { label: 'letter', lines: 5, blurb: 'dear … yours,' },
  free: { label: 'free verse', lines: 12, blurb: 'no rules' },
};
const ANAPHORA = ['because', 'if', 'I remember', 'and still', 'tell me'];

const SLOT_HINTS = {
  det: 'a / the', dets: 'the / our', adj: 'describe it', noun: 'a thing', nouns: 'things', v: 'what it does',
  verb: 'do something', ved: 'what happened', ving: 'doing', prep: 'where', subj: 'who', adv: 'how',
};
export const slotHint = (slot) => SLOT_HINTS[slot] ?? '';

// Colour of a magnet's underline, by role.
export const POS_COLORS = {
  det: '#f4c96b', dets: '#f4c96b', subj: '#f59e8b', prep: '#8fc3f2', adv: '#c7b3f5', noun: '#f7a6c8', nouns: '#f7a6c8',
  adj: '#b9a3f0', v: '#86dbb0', verb: '#86dbb0', ved: '#86dbb0', ving: '#86dbb0', lit: '#e6e1d6', phrase: '#ffd27a',
  closer: '#ffd27a', break: '#ffffff', form: '#ffffff', punct: '#e6e1d6',
};

const REGISTERS = ['wild', 'pop', 'genz', 'news'];

// ---------------------------------------------------------------- composer

const pickW = (r, items, weight) => {
  let total = 0;
  for (const it of items) total += weight(it);
  let x = r() * total;
  for (const it of items) {
    x -= weight(it);
    if (x <= 0) return it;
  }
  return items[items.length - 1];
};

export class Composer {
  constructor() {
    this.reset();
  }

  reset(form = null) {
    this.form = form; // null until the player chooses one
    this.lines = [[]]; // tokens: { w, pos, base, register, moods, lit }
    this.pattern = null;
    this.slot = 0;
    this.subject = null; // 'sg' | 'pl' | 'I' for agreement
    this.anaphora = null;
    this.complete = false;
    this.lastPatterns = [];
    this.taste = { wild: 0.6, pop: 0.5, genz: 0.5, news: 0.45 };
    this.mood = null;
    this.seed = null; // a word carried in from a word portal
    this.history = [];
  }

  _snapshot() {
    const { lines, pattern, slot, subject, complete, lineDone, lastPatterns, mood, taste, anaphora, form } = this;
    this.history.push(JSON.stringify({ lines, pattern, slot, subject, complete, lineDone, lastPatterns, mood, taste, anaphora, form }));
    if (this.history.length > 80) this.history.shift();
  }

  /** Steps back one choice, exactly as it was. */
  undo() {
    const last = this.history.pop();
    if (!last) return false;
    Object.assign(this, JSON.parse(last));
    return true;
  }

  get current() {
    return this.lines[this.lines.length - 1];
  }

  get finishedLines() {
    return this.lineIndex;
  }

  /** Lines already finished (the current one only once the poem is complete). */
  get finished() {
    const done = this.complete ? this.lines : this.lines.slice(0, -1);
    return done.filter((l) => l.some((t) => !t.lit));
  }

  /** Index of the current line among real (non-stanza-gap) lines. */
  get lineIndex() {
    return this.lines.slice(0, -1).filter((l) => l.some((t) => !t.lit)).length;
  }

  /** Syllables so far in the current line (haiku). */
  get lineSyllables() {
    return this.current.reduce((a, t) => a + (t.pos === 'punct' ? 0 : syllables(t.w)), 0);
  }

  get syllableTarget() {
    const f = FORMS[this.form];
    return f?.syllables ? f.syllables[this.lineIndex] : null;
  }

  /** The slot currently waiting to be filled, or null. */
  get nextSlot() {
    if (!this.pattern) return null;
    return this.pattern.slots[this.slot] ?? null;
  }

  get atEndPoint() {
    if (!this.pattern) return false;
    return this.pattern.ends.includes(this.slot) || this.slot >= this.pattern.slots.length;
  }

  // ------------------------------------------------------------ choosing

  chooseForm(key) {
    const seed = this.seed;
    this.reset(key);
    this.seed = seed;
    if (key === 'litany') this.anaphora = ANAPHORA[Math.floor(Math.random() * ANAPHORA.length)];
    this._startLine();
  }

  _parse(p) {
    const tokens = p.split(' ');
    const slots = [];
    const ends = [];
    for (const t of tokens) {
      if (t === '|') ends.push(slots.length);
      else slots.push(t);
    }
    return { slots, ends };
  }

  _startLine() {
    const f = FORMS[this.form];
    const li = this.lineIndex;
    let p;
    if (this.form === 'letter' && li === 0) p = 'dear adj noun ,';
    else if (this.form === 'letter' && li === f.lines - 1) p = 'yours , det adj noun';
    else if (this.form === 'haiku') {
      p = SHORT[Math.floor(Math.random() * SHORT.length)];
    } else {
      // Weighted pick, avoiding the last two patterns so lines vary.
      let pool = PATTERNS.filter((x) => !this.lastPatterns.includes(x.p));
      if (this.form === 'litany') pool = pool.filter((x) => !/^(who|I |there)/.test(x.p));
      p = pickW(Math.random, pool, (x) => x.w).p;
      if (this.form === 'litany') p = `${this.anaphora} ${p.replace(/^(and|even|what if|somewhere ,) /, '')}`;
    }
    this.lastPatterns = [p, ...this.lastPatterns].slice(0, 2);
    this.pattern = this._parse(p);
    this.slot = 0;
    this.subject = null;
    this.lineDone = false;
    return this._fillLiterals();
  }

  /** Snaps in literal glue words until the next real slot. Returns them. */
  _fillLiterals() {
    const placed = [];
    while (this.pattern && this.slot < this.pattern.slots.length) {
      const s = this.pattern.slots[this.slot];
      if (SLOT_HINTS[s] !== undefined) break;
      let w = s;
      if (s === 'BE') w = this.subject === 'I' ? 'am' : this.subject === 'sg' ? 'is' : 'are';
      if (s === 'keep' && this.subject === 'sg') w = 'keeps';
      const tok = { w, pos: /^[,?:]$/.test(s) ? 'punct' : 'lit', lit: true };
      if (s === 'I') this.subject = 'I';
      if (s === 'there' || s === 'is') this.subject = 'sg';
      this.current.push(tok);
      placed.push(tok);
      this.slot++;
    }
    return placed;
  }

  // ------------------------------------------------------------ offering

  /**
   * The next handful of magnets. Returns word objects with
   * { w, pos, base, register, moods, badge? } where badge is 'rhyme',
   * 'echo', 'phrase' or 'break'.
   */
  offer(r = Math.random, count = 4) {
    if (!this.form || this.complete) return this._formOffer(r, count);
    const slot = this.nextSlot;
    const out = [];
    const used = new Set();
    const push = (x) => {
      if (x && !used.has(x.w)) {
        used.add(x.w);
        out.push(x);
      }
    };

    // Ending the line is on offer where the pattern allows it.
    if (this.atEndPoint && this.current.some((t) => !t.lit)) push({ w: '↵', pos: 'break', badge: 'break' });
    if (!slot) return out.length ? out : [{ w: '↵', pos: 'break', badge: 'break' }];

    const pool = this._candidates(slot);
    if (!pool.length) return out;

    // 1. A rhyme for the previous line's ending, when this slot could end the line.
    const rhymeWanted = this._rhymeTarget();
    if (rhymeWanted && this._slotCanEnd()) {
      const prev = this._prevLineEnd();
      let rh = pool.filter((c) => rhymeKey(c.w) === rhymeWanted && c.w !== prev);
      // No true rhyme? A slant rhyme (same vowel sound) still sings.
      if (!rh.length) rh = pool.filter((c) => slantKey(c.w) === slantKey(prev) && c.w !== prev);
      if (rh.length) push({ ...rh[Math.floor(r() * rh.length)], badge: 'rhyme' });
    }
    // 2. Words that fit the drifting mood (the heart of the imagery).
    const lyric = pool.filter((c) => c.register === 'lyric');
    const moody = lyric.filter((c) => !this.mood || c.moods.includes(this.mood));
    push(this._pick(r, moody.length ? moody : lyric.length ? lyric : pool));
    // 3. Spice from a wider register, weighted by the player's taste.
    const spice = pool.filter((c) => c.register !== 'lyric');
    const spiceCount = spice.length ? 1 + (count >= 4 && r() < 0.4 ? 1 : 0) : 0;
    for (let k = 0; k < spiceCount; k++) {
      const reg = pickW(r, REGISTERS.filter((g) => spice.some((c) => c.register === g)), (g) => this.taste[g]);
      push(this._pick(r, spice.filter((c) => c.register === reg)));
    }
    // 4. A surprise: an echo of your own words, a phrase, or a closer.
    const echo = this._echo(slot);
    // Phrases only open a truly empty line (not after glue like "there is").
    const line0 = this.current.length === 0;
    if (echo && r() < 0.5 + Math.min(0.3, this.finishedLines * 0.06)) push({ ...echo, badge: 'echo' });
    else if (line0 && !this.noPhrases && !['haiku', 'letter', 'litany'].includes(this.form) && r() < 0.45) {
      const ph = PHRASES[Math.floor(r() * PHRASES.length)];
      push({ w: ph.w, pos: 'phrase', register: ph.register, moods: [], open: ph.open, badge: 'phrase' });
    } else if (this.atEndPoint && this.form !== 'haiku' && r() < 0.35) {
      const cl = CLOSERS[Math.floor(r() * CLOSERS.length)];
      push({ w: cl.w, pos: 'closer', register: cl.register, moods: [], badge: 'phrase' });
    }
    // A word carried in through a word portal comes back early on.
    if (this.seed && this.seed.pos === slot.replace(/s$/, '') && this.lineIndex < 2) push({ ...this._inflect(this.seed, slot), badge: 'echo' });
    // Fill the rest from anything that fits.
    for (let i = 0; out.length < count && i < 12; i++) push(this._pick(r, pool));
    return out.slice(0, count);
  }

  _formOffer(r, count) {
    const keys = Object.keys(FORMS);
    const pick = [];
    while (pick.length < Math.min(count, keys.length)) {
      const k = keys[Math.floor(r() * keys.length)];
      if (!pick.includes(k)) pick.push(k);
    }
    return pick.map((k) => ({ w: FORMS[k].label, pos: 'form', form: k, badge: 'form' }));
  }

  _pick(r, list) {
    if (!list.length) return null;
    const recent = new Set(this.lines.flat().slice(-14).map((t) => t.base ?? t.w));
    const fresh = list.filter((c) => !recent.has(c.base ?? c.w));
    const src = fresh.length ? fresh : list;
    return src[Math.floor(r() * src.length)];
  }

  /** Every lexicon word that fits a slot, already inflected, within syllable budget. */
  _candidates(slot) {
    const base = slot === 'nouns' ? 'noun' : ['v', 'verb', 'ved', 'ving'].includes(slot) ? 'verb' : slot;
    let list = LEXICON.filter((e) => e.pos === base);
    const prev = this.current.at(-1);
    if (slot === 'nouns') list = list.filter((e) => !UNCOUNTABLE.has(e.w) && !e.w.includes('-'));
    if (slot === 'noun' && prev && ['a', 'every', 'this', 'that'].includes(prev.w)) list = list.filter((e) => !UNCOUNTABLE.has(e.w));
    if (slot === 'noun' && prev?.pos === 'adj' && ['a', 'every'].includes(this.current.at(-2)?.w)) list = list.filter((e) => !UNCOUNTABLE.has(e.w));
    // "a" can't go before a plural or uncountable pattern, so keep dets tidy.
    if (slot === 'det' && this.pattern?.slots[this.slot + 1] === 'nouns') list = LEXICON.filter((e) => e.pos === 'dets');
    let out = list.map((e) => this._inflect(e, slot));
    // Haiku: keep inside the line's syllable budget.
    const target = this.syllableTarget;
    if (target) {
      // Leave room for what's still to come: 1 per slot, plus glue words.
      const rest = this.pattern.slots.slice(this.slot + 1);
      const remainingSlots = rest.filter((s) => SLOT_HINTS[s] !== undefined).length;
      const restMin = rest.reduce((a, s) => a + (SLOT_HINTS[s] !== undefined ? 1 : /^[,?:|]$/.test(s) ? 0 : syllables(s === 'BE' ? 'is' : s)), 0);
      const budget = target - this.lineSyllables - restMin;
      const fits = out.filter((c) => syllables(c.w) <= budget);
      out = fits.length ? fits : out.filter((c) => syllables(c.w) === 1);
      // On the last content slot, land exactly on the count when possible.
      if (remainingSlots === 0) {
        const exact = out.filter((c) => this.lineSyllables + syllables(c.w) + restMin === target);
        if (exact.length) out = exact;
      }
    }
    return out;
  }

  _inflect(e, slot) {
    let w = e.w;
    if (slot === 'nouns') w = plural(e.w);
    else if (slot === 'v') w = this.subject === 'sg' ? thirdPerson(e.w) : e.w;
    else if (slot === 'ved') w = past(e.w);
    else if (slot === 'ving') w = gerund(e.w);
    return { w, pos: slot, base: e.w, register: e.register, moods: e.moods };
  }

  _slotCanEnd() {
    if (!this.pattern) return false;
    const next = this.slot + 1;
    return this.pattern.ends.includes(next) || next >= this.pattern.slots.length;
  }

  _prevLineEnd() {
    for (let i = this.lines.length - 2; i >= 0; i--) {
      const l = this.lines[i].filter((t) => t.pos !== 'punct' && t.pos !== 'stanza');
      if (l.length) return l.at(-1).w;
    }
    return null;
  }

  _rhymeTarget() {
    const f = FORMS[this.form];
    const prevEnd = this._prevLineEnd();
    if (!prevEnd) return null;
    // Couplets: the second line of each pair rhymes with the first.
    if (f?.rhyme) return this.lineIndex % 2 === 1 ? rhymeKey(prevEnd) : null;
    // Elsewhere, a rhyme is an occasional gift.
    return Math.random() < 0.3 ? rhymeKey(prevEnd) : null;
  }

  _echo(slot) {
    const base = slot === 'nouns' ? 'noun' : ['v', 'verb', 'ved', 'ving'].includes(slot) ? 'verb' : slot;
    if (!['noun', 'adj', 'verb'].includes(base)) return null;
    const earlier = this.lines.slice(0, -1).flat().filter((t) => !t.lit && (t.pos === slot || t.pos.startsWith(base.slice(0, 1))));
    // Echo only what would fit here anyway (number, "a"/"every", syllables).
    const bases = new Set(earlier.map((t) => t.base));
    const src = this._candidates(slot).filter((c) => bases.has(c.base ?? c.w));
    return src.length ? src[Math.floor(Math.random() * src.length)] : null;
  }

  // ------------------------------------------------------------ accepting

  /**
   * Places a caught magnet. Returns { placed: [tokens], lineDone, poemDone, formChosen }.
   */
  accept(word) {
    const res = { placed: [], lineDone: false, poemDone: false, formChosen: null };
    if (word.pos !== 'form') this._snapshot();
    if (word.pos === 'form') {
      this.chooseForm(word.form);
      res.formChosen = word.form;
      res.placed = [...this.current];
      return res;
    }
    if (!this.form) this.chooseForm('free');
    // A tile offered for an earlier moment in the sentence no longer fits.
    const slotTypes = ['det', 'dets', 'adj', 'noun', 'nouns', 'v', 'verb', 'ved', 'ving', 'prep', 'subj', 'adv'];
    const known = slotTypes.includes(word.pos) || ['break', 'closer', 'phrase'].includes(word.pos);
    if (!known || !this.pattern || (slotTypes.includes(word.pos) && word.pos !== this.nextSlot)) {
      this.history.pop();
      res.stale = true;
      return res;
    }
    if ((word.pos === 'break' || word.pos === 'closer') && !this.atEndPoint) {
      this.history.pop();
      res.stale = true;
      return res;
    }
    if (word.pos === 'break') {
      this._endLine(res);
      return res;
    }
    // Taste: what you pick shapes what drifts in next.
    if (word.register && word.register !== 'lyric') {
      this.taste[word.register] = Math.min(2.2, (this.taste[word.register] ?? 0.5) + 0.3);
      for (const g of REGISTERS) if (g !== word.register) this.taste[g] = Math.max(0.3, this.taste[g] * 0.96);
    }
    if (word.moods?.length && Math.random() < 0.6) this.mood = word.moods[0];

    const tok = { w: word.w, pos: word.pos, base: word.base ?? word.w, register: word.register, moods: word.moods ?? [], badge: word.badge };
    this.current.push(tok);
    res.placed.push(tok);

    if (word.pos === 'phrase') {
      // A phrase takes over the rest of the line with its own shape.
      this.pattern = this._parse(word.open.join(' ') + ' |');
      this.pattern.ends = [this.pattern.slots.length];
      this.slot = 0;
    } else if (word.pos === 'closer') {
      this._endLine(res);
      return res;
    } else {
      // Agreement for the verb that follows.
      if (word.pos === 'subj') this.subject = word.w === 'I' ? 'I' : ['she', 'it', 'nobody', 'everyone'].includes(word.w) ? 'sg' : 'pl';
      if (word.pos === 'noun' && !this.subject) this.subject = 'sg';
      if (word.pos === 'nouns' && !this.subject) this.subject = 'pl';
      this.slot++;
    }
    res.placed.push(...this._fillLiterals());
    // Haiku lines end on the syllable count; others when the pattern runs out.
    const target = this.syllableTarget;
    if (target && this.slot >= this.pattern.slots.length && this.lineSyllables < target) {
      // Shape ran out before the count: extend it with a short tail.
      const left = target - this.lineSyllables;
      const tail = left >= 3 ? ['prep', 'det', 'noun'] : ['adv'];
      this.pattern.slots.push(...tail);
      this.pattern.ends.push(this.pattern.slots.length);
    }
    if ((target && this.lineSyllables >= target && this.atEndPoint) || this.slot >= this.pattern.slots.length) this._endLine(res);
    return res;
  }

  _endLine(res) {
    if (!this.current.some((t) => !t.lit)) return;
    res.lineDone = true;
    this.lineDone = true;
    const f = FORMS[this.form];
    const done = this.lines.filter((l) => l.some((t) => !t.lit)).length;
    if (f && done >= f.lines) {
      this.complete = true;
      res.poemDone = true;
      this.pattern = null;
      return;
    }
    // Stanza breaks for couplets.
    if (f?.stanza && done % f.stanza === 0) this.lines.push([{ w: '', pos: 'stanza', lit: true }]);
    this.lines.push([]);
    res.placed.push(...this._startLine());
  }

  /** Plain text of the poem (with "a" -> "an" and punctuation glued). */
  text() {
    return this.lines
      .map((l) => (l[0]?.pos === 'stanza' ? '' : lineText(l)))
      .filter((s, i, a) => s || (i > 0 && a[i - 1]))
      .join('\n')
      .trim();
  }

  /** A title from the poem's most telling noun. */
  titles() {
    const nouns = this.lines.flat().filter((t) => (t.pos === 'noun' || t.pos === 'nouns') && !t.lit);
    const counts = new Map();
    for (const n of nouns) counts.set(n.base, (counts.get(n.base) ?? 0) + 1);
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([w]) => w);
    const adjs = this.lines.flat().filter((t) => t.pos === 'adj').map((t) => t.w);
    const out = [];
    if (sorted[0]) out.push(`${sorted[0]}`);
    if (sorted[0] && adjs[0]) out.push(`${adjs[0]} ${sorted[0]}`);
    if (sorted[1]) out.push(`${sorted[0]} & ${sorted[1]}`);
    if (sorted[0]) out.push(`on ${plural(sorted[0])}`);
    return [...new Set(out)].slice(0, 4);
  }
}

/** Joins tokens: punctuation glues left, "a" turns to "an" before a vowel. */
export function lineText(tokens) {
  let s = '';
  tokens.forEach((t, i) => {
    if (t.pos === 'stanza') return;
    let w = t.w;
    if ((w === 'a' || w === 'A') && tokens[i + 1] && /^[aeiou]/i.test(tokens[i + 1].w) && !/^(uni|one|eu)/i.test(tokens[i + 1].w)) w += 'n';
    if (t.pos === 'punct') s += w;
    else s += (s ? ' ' : '') + w;
  });
  return s;
}
