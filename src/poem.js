import { Composer, FORMS, lineText, POS_COLORS, slotHint, syllables } from './grammar.js';

const STORE = 'paperplanes.poems';

/**
 * The poem in progress (a Composer underneath) and its two views: the
 * magnet strip at the bottom of the screen, and the "fridge door".
 */
export class Poem {
  constructor() {
    this.c = new Composer();
    this.title = '';
    this.strip = document.getElementById('poem-strip');
    this.view = document.getElementById('poem-door');
    this.saved = [];
    try {
      this.saved = JSON.parse(localStorage.getItem(STORE) || '[]');
    } catch {
      this.saved = [];
    }
  }

  get isEmpty() {
    return !this.c.form || !this.c.lines.flat().some((t) => !t.lit);
  }

  get complete() {
    return this.c.complete;
  }

  get form() {
    return this.c.form;
  }

  offer(r, count) {
    return this.c.offer(r, count);
  }

  /** Places a caught magnet; returns the composer's result. */
  add(word) {
    const res = this.c.accept(word);
    if (res.formChosen) this.title = '';
    this.render(true);
    return res;
  }

  /** A word carried in through a word portal: it'll come back to you. */
  seed(word) {
    this.c.seed = word;
  }

  undo() {
    const ok = this.c.undo();
    this.render();
    return ok;
  }

  /** Ends a free-verse poem where it stands. */
  finish() {
    if (this.isEmpty) return false;
    this.c.complete = true;
    this.c.pattern = null;
    this.render();
    return true;
  }

  text() {
    return this.c.text();
  }

  lastLineText() {
    const lines = this.c.lines.filter((l) => l.some((t) => !t.lit));
    const l = this.c.complete ? lines.at(-1) : lines.at(-2) ?? lines.at(-1);
    return l ? lineText(l) : '';
  }

  titles() {
    return this.c.titles();
  }

  keep() {
    const text = this.text();
    if (!text) return;
    const title = this.title || this.titles()[0] || 'untitled';
    this.title = title;
    this.saved.unshift({ title, text, form: this.c.form, at: Date.now() });
    this.saved = this.saved.slice(0, 30);
    try {
      localStorage.setItem(STORE, JSON.stringify(this.saved));
    } catch {
      /* storage unavailable */
    }
    return title;
  }

  reset() {
    const seed = this.c.seed;
    this.c = new Composer();
    this.c.seed = seed;
    this.title = '';
    this.render();
  }

  _magnet(t, i, fresh, next) {
    const el = document.createElement('span');
    const glue = t.pos === 'punct';
    el.className = `magnet${glue ? ' punct' : ''}${t.lit ? ' lit' : ''}${fresh ? ' fresh' : ''}`;
    let w = t.w;
    if (w === 'a' && next && /^[aeiou]/i.test(next.w) && !/^(uni|one|eu)/i.test(next.w)) w = 'an';
    el.textContent = w;
    el.style.setProperty('--tilt', `${((i * 37) % 7) - 3}deg`);
    el.style.setProperty('--pos', POS_COLORS[t.pos] ?? '#ddd');
    return el;
  }

  /** Bottom strip: the line in progress, what comes next, and the form. */
  render(fresh = false) {
    const s = this.strip;
    s.innerHTML = '';
    const c = this.c;
    const head = document.createElement('div');
    head.className = 'strip-head';
    if (c.form) {
      const f = FORMS[c.form];
      const done = c.lineIndex + (c.complete ? 1 : 0);
      let meta = `${f.label} · line ${Math.min(done + 1, f.lines)}${f.lines < 12 ? ` of ${f.lines}` : ''}`;
      if (c.syllableTarget && !c.complete) meta += ` · ${c.lineSyllables}/${c.syllableTarget} syllables`;
      head.textContent = c.complete ? `${f.label} · complete ✦ open ✎ to title & keep` : meta;
    } else {
      head.textContent = 'fly through a form to begin a poem';
    }
    s.appendChild(head);

    const lines = c.lines.filter((l) => l.some((t) => !t.lit));
    const prev = c.complete ? lines.at(-2) : lines.at(-2);
    if (prev && !c.complete) {
      const p = document.createElement('div');
      p.className = 'strip-prev';
      p.textContent = lineText(prev);
      s.appendChild(p);
    }
    const row = document.createElement('div');
    row.className = 'strip-row';
    const cur = c.complete ? lines.at(-1) ?? [] : c.current;
    const lastChosen = cur.findLastIndex((t) => !t.lit);
    cur.forEach((t, i) => {
      if (t.pos === 'stanza') return;
      row.appendChild(this._magnet(t, i, fresh && i >= lastChosen, cur[i + 1]));
    });
    // What the sentence needs next, as a dashed placeholder.
    const slot = c.nextSlot;
    if (slot && !c.complete) {
      const g = document.createElement('span');
      g.className = 'magnet ghost';
      g.textContent = slotHint(slot);
      g.style.setProperty('--pos', POS_COLORS[slot] ?? '#ddd');
      row.appendChild(g);
      if (c.atEndPoint && cur.some((t) => !t.lit)) {
        const e = document.createElement('span');
        e.className = 'strip-or';
        e.textContent = 'or ↵';
        row.appendChild(e);
      }
    }
    s.appendChild(row);
  }

  /** The full poem, arranged like magnets on a fridge door. */
  renderDoor() {
    const door = this.view;
    door.innerHTML = '';
    const c = this.c;
    if (this.isEmpty) {
      door.innerHTML = '<p class="door-empty">No words yet. In Dreaming Hours, fly through a form (haiku, couplets…) and then through the words you want.</p>';
    } else {
      if (this.title) {
        const h = document.createElement('div');
        h.className = 'door-title';
        h.textContent = this.title;
        door.appendChild(h);
      }
      let li = 0;
      for (const line of c.lines) {
        if (line[0]?.pos === 'stanza') {
          const gap = document.createElement('div');
          gap.className = 'door-gap';
          door.appendChild(gap);
          continue;
        }
        if (!line.some((t) => !t.lit)) continue;
        const row = document.createElement('div');
        row.className = 'door-line';
        row.style.marginLeft = `${(li * 23) % 40}px`;
        line.forEach((t, i) => row.appendChild(this._magnet(t, i + li * 3, false, line[i + 1])));
        door.appendChild(row);
        li++;
      }
    }
    // Title suggestions once there's something to name.
    const chips = document.getElementById('poem-titles');
    const ts = this.isEmpty ? [] : this.titles();
    chips.innerHTML = ts.map((t) => `<button data-title="${escapeHtml(t)}" class="${t === this.title ? 'on' : ''}">${escapeHtml(t)}</button>`).join('');
    document.getElementById('poem-titles-wrap').classList.toggle('hidden', !ts.length);
    document.getElementById('poem-finish').classList.toggle('hidden', this.isEmpty || c.complete);

    const list = document.getElementById('poem-saved');
    list.innerHTML = this.saved
      .slice(0, 5)
      .map((p) => `<li><b>${escapeHtml(p.title ?? '')}</b> ${escapeHtml(p.text).replace(/\n/g, ' / ')}</li>`)
      .join('');
    document.getElementById('poem-saved-wrap').classList.toggle('hidden', !this.saved.length);
  }

  async share() {
    const text = `${this.title ? this.title + '\n\n' : ''}${this.text()}\n\n— written in flight, Paper Planes`;
    try {
      if (navigator.share) {
        await navigator.share({ text });
        return 'shared';
      }
      await navigator.clipboard.writeText(text);
      return 'copied';
    } catch {
      return 'failed';
    }
  }

  /** Renders the poem as magnets on a fridge door and downloads a PNG. */
  downloadImage() {
    const lines = this.c.lines.filter((l) => l[0]?.pos === 'stanza' || l.some((t) => !t.lit));
    if (!lines.length) return;
    const c = document.createElement('canvas');
    const W = 1080;
    const lineH = 110;
    c.width = W;
    c.height = 300 + lines.length * lineH + 120;
    const g = c.getContext('2d');
    const grd = g.createLinearGradient(0, 0, W, c.height);
    grd.addColorStop(0, '#f1ecf8');
    grd.addColorStop(1, '#e3f1ee');
    g.fillStyle = grd;
    g.fillRect(0, 0, W, c.height);
    let y = 150;
    if (this.title) {
      g.font = 'italic 600 58px Fraunces, Georgia, serif';
      g.fillStyle = '#2a2540';
      g.textAlign = 'left';
      g.fillText(this.title, 90, y);
      y += 110;
    }
    g.font = '600 48px Fraunces, Georgia, serif';
    g.textBaseline = 'middle';
    lines.forEach((line, li) => {
      if (line[0]?.pos === 'stanza') {
        y += lineH * 0.35;
        return;
      }
      let x = 90 + ((li * 23) % 40);
      line.forEach((t, i) => {
        let label = t.w;
        if (label === 'a' && line[i + 1] && /^[aeiou]/i.test(line[i + 1].w)) label = 'an';
        const punct = t.pos === 'punct';
        const tw = g.measureText(label).width;
        const pw = tw + (punct ? 18 : 40);
        if (x + pw > W - 60) {
          y += lineH * 0.85;
          x = 110;
        }
        g.save();
        g.translate(x + pw / 2, y);
        g.rotate(((((i + li * 3) * 37) % 7) - 3) * (Math.PI / 180));
        g.fillStyle = 'rgba(40,30,60,0.22)';
        g.fillRect(-pw / 2 + 5, -36, pw, 78);
        g.fillStyle = t.lit ? '#f3efe6' : '#fbf8f1';
        g.fillRect(-pw / 2, -42, pw, 78);
        g.fillStyle = POS_COLORS[t.pos] ?? '#ddd';
        g.fillRect(-pw / 2 + 12, 24, pw - 24, 4);
        g.fillStyle = t.lit ? '#6a6478' : '#1d1a26';
        g.textAlign = 'center';
        g.fillText(label, 0, -4);
        g.restore();
        x += pw + 14;
      });
      y += lineH;
    });
    g.font = 'italic 400 30px Fraunces, Georgia, serif';
    g.fillStyle = 'rgba(40,30,60,0.55)';
    g.textAlign = 'right';
    g.fillText(`${FORMS[this.c.form]?.label ?? ''} · written in flight · Paper Planes`, W - 70, c.height - 70);
    const a = document.createElement('a');
    a.download = `${(this.title || 'poem').replace(/[^a-z0-9 ]/gi, '').trim() || 'poem'}.png`;
    a.href = c.toDataURL('image/png');
    a.click();
  }
}

export { syllables };

function escapeHtml(s) {
  return s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
}
