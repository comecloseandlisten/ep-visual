// The page is the picture, and everything else floats over it. The dock opens the panel's cards, which stay until
// closed; the bar with the dock goes with the cursor when the mouse rests and comes back when it moves. `h` puts the
// open cards away and brings them back. The picture fills the window by itself; the real full screen takes a click
// or a key, so it has the full button and `f`. The picture is square: filling a wide window cuts its top and bottom,
// and the fill button shows all of it, with bars at the sides.

const REST = 3000; // ms without the mouse before the bar and the cursor go

const load = (key) => { try { return localStorage.getItem(key); } catch { return null; } };
const save = (key, value) => { try { localStorage.setItem(key, value); } catch { /* storage blocked: it lasts this visit */ } };

export class Overlay {
  // ctx: { $, status(text) }
  constructor(ctx) {
    this.ctx = ctx;
    this.cards = [...document.querySelectorAll('section[data-card]')];
    this.keys = [...document.querySelectorAll('.dock [data-card]')];
    this.away = []; // the cards `h` put away
    this.timer = 0;
    this.keys.forEach((b) => b.addEventListener('click', () => {
      const name = b.dataset.card, open = this.open;
      this.show(open.includes(name) ? open.filter((k) => k !== name) : [...open, name]);
    }));
    this.show((load('ep-visual.cards') || '').split(' '));

    this.fill = load('ep-visual.fill') !== '0';
    this.fillBtn = ctx.$('#fillBtn');
    this.fillBtn.addEventListener('click', () => {
      this.fill = !this.fill;
      save('ep-visual.fill', this.fill ? '1' : '0');
      this.showFill();
    });
    this.showFill();

    this.fullBtn = ctx.$('#fullBtn');
    this.fullBtn.hidden = !document.fullscreenEnabled;
    this.fullBtn.addEventListener('click', () => this.toggleFull());
    // Esc leaves it without asking the page
    document.addEventListener('fullscreenchange', () => this.fullBtn.classList.toggle('on', !!document.fullscreenElement));

    window.addEventListener('pointermove', () => this.wake());
    window.addEventListener('pointerdown', () => this.wake());
    this.wake();
  }

  get open() {
    return this.cards.filter((el) => !el.hidden).map((el) => el.dataset.card);
  }

  show(names) {
    this.cards.forEach((el) => { el.hidden = !names.includes(el.dataset.card); });
    this.keys.forEach((b) => b.classList.toggle('on', names.includes(b.dataset.card)));
    save('ep-visual.cards', this.open.join(' '));
  }

  showFill() {
    document.body.classList.toggle('whole', !this.fill);
    this.fillBtn.classList.toggle('on', this.fill);
  }

  toggleFull() {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.().catch(() => this.ctx.status('the browser refused full screen'));
  }

  // `h`: a clean picture at once, then everything as it was; with nothing to bring back, at least the dock
  toggleCards() {
    const open = this.open;
    this.show(open.length ? [] : this.away);
    if (open.length) { this.away = open; this.rest(); } else this.wake();
  }

  wake() {
    document.body.classList.remove('idle');
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.rest(), REST);
  }

  rest() {
    // not from under a mouse resting on a button
    if (document.querySelector('.bar:hover, .panel:hover')) this.wake();
    else document.body.classList.add('idle');
  }
}
