// The word-magnet lexicon.
//
// Registers:
//   lyric  – the heart of it: themes and diction in the spirit of James
//            Baldwin (love as a fierce force, fire and water, witness, mercy,
//            home, the blues) and Mumtaza Mehri (tongue and salt, sugar and
//            gold, archives, satellites and static, grandmothers, moons).
//   wild   – vivid, strange adjectives and images.
//   pop    – generic pop culture (no names, no brands).
//   genz   – internet and Gen Z lingo.
//   news   – nouns you hear in the news, kept general (no people, places,
//            or events), so they open doors instead of closing them.
//
// Only single words and short stock phrases: the poems are the player's own.
// "_" joins a multi-word magnet. Moods steer imagery gently:
//   water fire body home sky time love earth signal

const entries = [];
const add = (pos, register, moods, list, extra = {}) => {
  for (const raw of list.trim().split(/\s+/)) entries.push({ w: raw.replace(/_/g, ' '), pos, register, moods, ...extra });
};

// ----------------------------------------------------------------- nouns
add('noun', 'lyric', ['water'], 'river sea tide harbor well flood wave shore rain');
add('noun', 'lyric', ['fire'], 'fire ember flame furnace candle match lantern');
add('noun', 'lyric', ['body'], 'tongue mouth hand throat spine heart eye skin bone wrist rib');
add('noun', 'lyric', ['home'], 'mother grandmother brother sister kitchen door window street table name language house doorway');
add('noun', 'lyric', ['sky'], 'moon sun star sky wing orbit bird cloud comet');
add('noun', 'lyric', ['time'], 'morning midnight year archive memory summer dusk tomorrow photograph clock');
add('noun', 'lyric', ['love'], 'love mercy prayer song witness grief joy promise blues hymn');
add('noun', 'lyric', ['earth'], 'garden stone mountain field root seed orchard river_bed');
add('noun', 'lyric', ['signal'], 'signal satellite radio map border distance frequency antenna');

add('noun', 'wild', ['sky'], 'hologram galaxy nebula constellation');
add('noun', 'wild', ['earth'], 'volcano thunderstorm avalanche jungle');
add('noun', 'wild', ['body'], 'heartbeat fever pulse');
add('noun', 'wild', ['fire'], 'firework sparkler supernova');

add('noun', 'pop', ['signal'], 'playlist algorithm meme livestream notification screenshot avatar remix podcast emoji');
add('noun', 'pop', ['time'], 'sequel reboot finale cliffhanger flashback montage trailer spoiler');
add('noun', 'pop', ['love'], 'soundtrack encore mixtape karaoke fandom rom-com');
add('noun', 'pop', ['home'], 'group_chat side_quest main_character sidekick villain arcade');
add('noun', 'pop', ['sky'], 'multiverse superhero disco_ball red_carpet');

add('noun', 'genz', ['love'], 'vibe era situationship bestie crush ick');
add('noun', 'genz', ['signal'], 'aura lore glow-up side-eye plot_twist');
add('noun', 'genz', ['home'], 'group_project comfort_show');

add('noun', 'news', ['water'], 'heatwave drought glacier hurricane forecast');
add('noun', 'news', ['fire'], 'wildfire blackout rocket launch');
add('noun', 'news', ['signal'], 'headline bulletin broadcast deadline data server passport');
add('noun', 'news', ['home'], 'rent commute market traffic census');
add('noun', 'news', ['sky'], 'telescope eclipse rover');
add('noun', 'news', ['time'], 'summit ballot verdict economy');

// Uncountable nouns: never offered as plural, or after "a" / "every".
export const UNCOUNTABLE = new Set(
  'love mercy grief joy salt rain honey sugar gold dust static weather rent data traffic heatwave drought blues'.split(' '),
);
add('noun', 'lyric', ['water'], 'salt', {});
add('noun', 'lyric', ['earth'], 'honey sugar gold dust', {});
add('noun', 'lyric', ['signal'], 'static', {});
add('noun', 'lyric', ['sky'], 'weather light', {});

// ------------------------------------------------------------ adjectives
add('adj', 'lyric', ['water'], 'drowned blue deep salted');
add('adj', 'lyric', ['fire'], 'burning bright molten');
add('adj', 'lyric', ['body'], 'bare bruised tender hungry');
add('adj', 'lyric', ['home'], 'small familiar borrowed');
add('adj', 'lyric', ['sky'], 'luminous distant weightless');
add('adj', 'lyric', ['time'], 'old new unfinished');
add('adj', 'lyric', ['love'], 'holy fierce gentle');
add('adj', 'lyric', ['earth'], 'golden sweet wild');
add('adj', 'lyric', ['signal'], 'electric broken quiet');

add('adj', 'wild', ['sky'], 'iridescent holographic cosmic ultraviolet galactic lunar');
add('adj', 'wild', ['fire'], 'radioactive supersonic feverish neon');
add('adj', 'wild', ['body'], 'feral velvet elastic barefoot');
add('adj', 'wild', ['time'], 'haunted sequined cinematic nocturnal liminal');
add('adj', 'wild', ['signal'], 'glitching analog wireless magnetic spectral');
add('adj', 'wild', ['earth'], 'bioluminescent carnivorous gilded tectonic');

add('adj', 'pop', ['time'], 'vintage viral');
add('adj', 'pop', ['signal'], 'pixelated animated');

add('adj', 'genz', ['love'], 'unbothered iconic delulu extra');
add('adj', 'genz', ['signal'], 'chaotic mid sus cringe');
add('adj', 'genz', ['fire'], 'salty lit goated');

add('adj', 'news', ['signal'], 'breaking live urgent');
add('adj', 'news', ['earth'], 'renewable record-breaking');

// ----------------------------------------------------------------- verbs
// (base form; the grammar conjugates: burns, burned, burning)
add('verb', 'lyric', ['water'], 'drown float pour swim sink');
add('verb', 'lyric', ['fire'], 'burn glow shine');
add('verb', 'lyric', ['body'], 'carry hold taste breathe bleed');
add('verb', 'lyric', ['home'], 'return stay name wait');
add('verb', 'lyric', ['sky'], 'rise fly fall orbit');
add('verb', 'lyric', ['time'], 'remember begin forget');
add('verb', 'lyric', ['love'], 'love forgive sing mourn pray');
add('verb', 'lyric', ['earth'], 'bloom grow bury');
add('verb', 'lyric', ['signal'], 'call hum answer');
add('verb', 'lyric', [], 'know want become');

add('verb', 'wild', ['fire'], 'ricochet detonate shimmer');
add('verb', 'wild', ['body'], 'unravel levitate');
add('verb', 'wild', ['signal'], 'glitch buffer');

add('verb', 'pop', ['signal'], 'stream scroll remix');
add('verb', 'pop', ['love'], 'ship binge');

add('verb', 'genz', ['love'], 'slay serve manifest');
add('verb', 'genz', ['fire'], 'eat'); // "it ate"
add('verb', 'genz', ['signal'], 'ghost vibe');

add('verb', 'news', ['signal'], 'trend broadcast forecast');
add('verb', 'news', ['earth'], 'launch rebuild');

// ------------------------------------------------------------ small words
add('det', 'lyric', [], 'the a my your our her their every this that no');
add('dets', 'lyric', [], 'the my your our her their these those no all_the');
add('subj', 'lyric', [], 'I you we they she it nobody everyone');
add('prep', 'lyric', [], 'of in beneath toward against inside across through without between after before above among under');
add('adv', 'lyric', [], 'still only always never again almost softly slowly');
add('adv', 'genz', [], 'lowkey highkey literally');
add('adv', 'news', [], 'suddenly reportedly');
add('adv', 'wild', [], 'feverishly cosmically');

export const LEXICON = entries;

// Phrase magnets. An "open" phrase starts a line and hands over to its own
// continuation; a "close" phrase finishes one.
export const PHRASES = [
  { w: "it's giving", register: 'genz', open: ['adj', 'noun'] },
  { w: 'plot twist:', register: 'pop', open: ['det', 'noun', 'v'] },
  { w: 'not me', register: 'genz', open: ['ving', 'prep', 'det', 'noun'] },
  { w: 'in this economy,', register: 'news', open: ['subj', 'v', 'det', 'noun'] },
  { w: 'no cap,', register: 'genz', open: ['det', 'noun', 'BE', 'adj'] },
  { w: 'breaking news:', register: 'news', open: ['dets', 'nouns', 'v'] },
  { w: 'once upon a', register: 'pop', open: ['noun', ',', 'subj', 'v'] },
  { w: 'somewhere,', register: 'lyric', open: ['det', 'noun', 'BE', 'ving'] },
  { w: 'tell me', register: 'lyric', open: ['prep', 'det', 'adj', 'noun'] },
  { w: 'what if', register: 'lyric', open: ['det', 'noun', 'v'] },
  { w: 'even now,', register: 'lyric', open: ['subj', 'v', 'det', 'noun'] },
  { w: 'lowkey', register: 'genz', open: ['subj', 'BE', 'adj'] },
];
export const CLOSERS = [
  { w: 'rent free', register: 'genz' },
  { w: 'on repeat', register: 'pop' },
  { w: 'no notes', register: 'genz' },
  { w: 'for real', register: 'genz' },
  { w: 'in 4K', register: 'genz' },
  { w: 'after the credits', register: 'pop' },
  { w: 'live on air', register: 'news' },
  { w: 'like weather', register: 'lyric' },
  { w: 'all night', register: 'lyric' },
  { w: 'anyway', register: 'lyric' },
];
