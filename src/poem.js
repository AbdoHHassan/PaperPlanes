import { lineText, POS_COLORS } from './words.js';

const STORE = 'paperplanes.poems';

/**
 * The poem being written: lines of word magnets. Draws the magnet strip at
 * the bottom of the screen and the full "fridge door" view.
 */
export class Poem {
  constructor() {
    this.lines = [[]];
    this.strip = document.getElementById('poem-strip');
    this.view = document.getElementById('poem-door');
    this.saved = [];
    try {
      this.saved = JSON.parse(localStorage.getItem(STORE) || '[]');
    } catch {
      this.saved = [];
    }
  }

  get current() {
    return this.lines[this.lines.length - 1];
  }

  get wordCount() {
    return this.lines.reduce((a, l) => a + l.length, 0);
  }

  get lastPos() {
    const cur = this.current;
    if (cur.length) return cur[cur.length - 1].pos;
    return this.lines.length > 1 ? 'break' : 'start';
  }

  get isEmpty() {
    return this.wordCount === 0;
  }

  /** Recently used words, so the game doesn't keep offering them. */
  recent() {
    return new Set(this.lines.flat().slice(-12).map((w) => w.w));
  }

  add(word) {
    if (word.pos === 'break') return this.newLine();
    this.current.push(word);
    this.render(true);
    return null;
  }

  /** Ends the current line; returns its text if it had any words. */
  newLine() {
    const cur = this.current;
    if (!cur.length) return null;
    this.lines.push([]);
    this.render();
    return lineText(cur);
  }

  undo() {
    if (!this.current.length && this.lines.length > 1) this.lines.pop();
    else this.current.pop();
    this.render();
  }

  text() {
    return this.lines.filter((l) => l.length).map(lineText).join('\n');
  }

  keep() {
    const text = this.text();
    if (!text) return;
    this.saved.unshift({ text, at: Date.now() });
    this.saved = this.saved.slice(0, 30);
    try {
      localStorage.setItem(STORE, JSON.stringify(this.saved));
    } catch {
      /* storage unavailable */
    }
  }

  reset() {
    this.lines = [[]];
    this.render();
  }

  _magnet(word, i, fresh) {
    const el = document.createElement('span');
    el.className = `magnet${word.pos === 'suffix' ? ' suffix' : ''}${fresh ? ' fresh' : ''}`;
    el.textContent = word.w;
    el.style.setProperty('--tilt', `${((i * 37) % 7) - 3}deg`);
    el.style.setProperty('--pos', POS_COLORS[word.pos] ?? '#ddd');
    return el;
  }

  /** Bottom strip: the line in progress, with the previous line faintly above. */
  render(fresh = false) {
    const s = this.strip;
    s.innerHTML = '';
    const prev = this.lines.length > 1 ? this.lines[this.lines.length - 2] : null;
    if (prev && prev.length) {
      const p = document.createElement('div');
      p.className = 'strip-prev';
      p.textContent = lineText(prev);
      s.appendChild(p);
    }
    const row = document.createElement('div');
    row.className = 'strip-row';
    this.current.forEach((w, i) => row.appendChild(this._magnet(w, i, fresh && i === this.current.length - 1)));
    if (!this.current.length) {
      const hint = document.createElement('span');
      hint.className = 'strip-hint';
      hint.textContent = this.isEmpty ? 'fly through a word to begin' : 'a new line…';
      row.appendChild(hint);
    }
    s.appendChild(row);
    s.classList.toggle('hidden', false);
  }

  /** The full poem, arranged like magnets on a fridge door. */
  renderDoor() {
    const door = this.view;
    door.innerHTML = '';
    const lines = this.lines.filter((l) => l.length);
    if (!lines.length) {
      door.innerHTML = '<p class="door-empty">No words yet. Find the floating words in Dreaming Hours.</p>';
    }
    lines.forEach((line, li) => {
      const row = document.createElement('div');
      row.className = 'door-line';
      row.style.marginLeft = `${(li * 23) % 40}px`;
      line.forEach((w, i) => row.appendChild(this._magnet(w, i + li * 3, false)));
      door.appendChild(row);
    });
    const list = document.getElementById('poem-saved');
    list.innerHTML = this.saved
      .slice(0, 5)
      .map((p) => `<li>${escapeHtml(p.text).replace(/\n/g, ' / ')}</li>`)
      .join('');
    document.getElementById('poem-saved-wrap').classList.toggle('hidden', !this.saved.length);
  }

  async share() {
    const text = `${this.text()}\n\n— written in flight, Paper Planes`;
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
    const lines = this.lines.filter((l) => l.length);
    if (!lines.length) return;
    const c = document.createElement('canvas');
    const W = 1080;
    const lineH = 118;
    c.width = W;
    c.height = 260 + lines.length * lineH + 120;
    const g = c.getContext('2d');
    const grd = g.createLinearGradient(0, 0, W, c.height);
    grd.addColorStop(0, '#f1ecf8');
    grd.addColorStop(1, '#e3f1ee');
    g.fillStyle = grd;
    g.fillRect(0, 0, W, c.height);
    g.font = '600 52px Fraunces, Georgia, serif';
    g.textBaseline = 'middle';
    let y = 170;
    lines.forEach((line, li) => {
      let x = 90 + ((li * 23) % 40);
      line.forEach((w, i) => {
        const label = w.w;
        const tw = g.measureText(label).width;
        const pw = tw + 44;
        if (w.pos === 'suffix') x -= 12;
        if (x + pw > W - 60) {
          y += lineH * 0.85;
          x = 110;
        }
        g.save();
        g.translate(x + pw / 2, y);
        g.rotate(((((i + li * 3) * 37) % 7) - 3) * (Math.PI / 180));
        g.fillStyle = 'rgba(40,30,60,0.22)';
        g.fillRect(-pw / 2 + 5, -38, pw, 84);
        g.fillStyle = '#fbf8f1';
        g.fillRect(-pw / 2, -44, pw, 84);
        g.fillStyle = POS_COLORS[w.pos] ?? '#ddd';
        g.fillRect(-pw / 2 + 14, 26, pw - 28, 4);
        g.fillStyle = '#1d1a26';
        g.textAlign = 'center';
        g.fillText(label, 0, -4);
        g.restore();
        x += pw + 16;
      });
      y += lineH;
    });
    g.font = 'italic 400 30px Fraunces, Georgia, serif';
    g.fillStyle = 'rgba(40,30,60,0.55)';
    g.textAlign = 'right';
    g.fillText('written in flight · Paper Planes', W - 70, c.height - 70);
    const a = document.createElement('a');
    a.download = 'paper-planes-poem.png';
    a.href = c.toDataURL('image/png');
    a.click();
  }
}

function escapeHtml(s) {
  return s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
}
