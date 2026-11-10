// Two still pictures proposed for the front page (11 November 2026). Paper, ink and the one blue; no motion.
//   node docs/box-v4/design/picture.mjs   -> picture-a.html and picture-b.html (fragments to drop into a page)
// A: a tangle goes into the box and comes out finished.   B: the one missing piece arrives.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));

let seed = 7;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const f = n => n.toFixed(1);
// A smooth line through points (Catmull-Rom as cubic Béziers).
const smooth = pts => pts.map((p, i) => {
  if (i === 0) return `M${f(p[0])} ${f(p[1])}`;
  const a = pts[Math.max(0, i - 2)], b = pts[i - 1], c = p, d = pts[Math.min(pts.length - 1, i + 1)];
  return `C${f(b[0] + (c[0] - a[0]) / 6)} ${f(b[1] + (c[1] - a[1]) / 6)} ${f(c[0] - (d[0] - b[0]) / 6)} ${f(c[1] - (d[1] - b[1]) / 6)} ${f(c[0])} ${f(c[1])}`;
}).join('');

const CSS = `
.ob-pic{--ink:#1b1b18;--paper:#fdfdfc;--shade:#e9eaeb;--soft:#8b8b86;--blue:#1d4f91;--sun:#c9d8ea;--hole:#3a3d42;position:relative;border-radius:1.5rem;overflow:hidden;background:radial-gradient(120% 100% at 50% 0%,#d9e3ef 0%,#eceef0 55%,#f3f2ee 100%)}
@media (prefers-color-scheme:dark){.ob-pic{--ink:#f1f0ec;--paper:#2a2d33;--shade:#1f2126;--soft:#8d8f94;--blue:#9dbfec;--sun:#2b3c55;--hole:#0e0f11;background:radial-gradient(120% 100% at 50% 0%,#223044 0%,#181b20 55%,#1b1b19 100%)}}
.ob-pic svg{display:block;width:100%;height:auto}
.ob-pic .ink{fill:none;stroke:var(--ink);stroke-width:3.6;stroke-linecap:round;stroke-linejoin:round}
.ob-pic .thin{fill:none;stroke:var(--ink);stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}
.ob-pic .blue{fill:none;stroke:var(--blue);stroke-width:4.4;stroke-linecap:round;stroke-linejoin:round}
.ob-pic .paper{fill:var(--paper);stroke:var(--ink);stroke-width:2.4;stroke-linejoin:round}
.ob-pic .side{fill:var(--shade);stroke:var(--ink);stroke-width:2.4;stroke-linejoin:round}
.ob-pic .hole{fill:var(--hole);stroke:var(--ink);stroke-width:2.4;stroke-linejoin:round} .ob-pic .sun{fill:var(--sun)} .ob-pic .dot{fill:var(--ink)} .ob-pic .bluefill{fill:var(--blue);stroke:var(--blue);stroke-width:2.4;stroke-linejoin:round}
.ob-pic .path{fill:none;stroke:var(--soft);stroke-width:2;stroke-linecap:round;stroke-dasharray:.1 9}
`;
const ROUGH = '<filter id="ob-rough" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency=".035" numOctaves="2" seed="4" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="3.2"/></filter>';
const wrap = (label, body) => `<div class="ob-pic"><style>${CSS}</style><svg viewBox="0 0 1200 500" role="img" aria-label="${label}"><defs>${ROUGH}</defs>${body}</svg></div>`;

// ---- A: a tangle goes in, a finished line comes out ----
function pictureA() {
  // The tangle: a wandering scribble that stays inside a soft blob, then leaves for the box.
  const cx = 250, cy = 250, pts = [];
  let angle = 0.6, radius = 30;
  for (let i = 0; i < 58; i++) {
    angle += 1.7 + rnd() * 1.5; radius = 22 + rnd() * 104;
    pts.push([cx + Math.cos(angle) * radius * 1.0, cy + Math.sin(angle) * radius * 1.0]);
  }
  pts.push([392, 236], [450, 268], [506, 208], [556, 168], [600, 190], [616, 236]);
  const tangle = smooth(pts);
  // The box: mark A as an object. An open box, seen a little from above.
  const bx = 520, by = 250, w = 160, h = 118, lift = 30, skew = 34;
  const inner = `M${bx} ${by} l${skew} ${-lift} h${w} l${-skew} ${lift}z`;
  const front = `M${bx} ${by} h${w} v${h} h${-w}z`;
  const right = `M${bx + w} ${by} l${skew} ${-lift} v${h} l${-skew} ${lift}z`;
  // Out the other side: one calm line, and it is done.
  const out = `M${bx + w + skew - 6} ${by + 40} H 930`;
  const check = 'M930 290 l38 38 l92 -124';
  const splats = [[118, 148, 3.2], [142, 372, 2.2], [384, 118, 2.6], [96, 300, 1.8], [356, 392, 2.8]].map(([x, y, r]) => `<circle class="dot" cx="${x}" cy="${y}" r="${r}"/>`).join('');
  return wrap('A tangled line goes into an open box and comes out the other side as one straight line ending in a tick.', `
    <circle class="sun" cx="640" cy="232" r="176"/>
    <path class="thin" d="M70 428 H1130" opacity=".35"/>
    <g filter="url(#ob-rough)">${splats}<path class="ink" d="${tangle}"/></g>
    <ellipse cx="${bx + w / 2 + 14}" cy="${by + h + 14}" rx="${w * 0.74}" ry="13" fill="var(--ink)" opacity=".1"/>
    <path class="hole" d="${inner}"/>
    <path class="side" d="${right}"/><path class="paper" d="${front}"/>
    <path class="thin" d="M${bx + 22} ${by + h - 22} h44 M${bx + 22} ${by + h - 36} h28" opacity=".5"/>
    <path class="blue" d="${out}"/><path class="blue" d="${check}"/>`);
}

// ---- B: the one missing piece arrives ----
function pictureB() {
  const size = 104, gap = 14, x0 = 420, y0 = 78, tiles = [];
  for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) {
    if (row === 1 && col === 2) continue;
    const x = x0 + col * (size + gap), y = y0 + row * (size + gap);
    tiles.push(`<rect class="paper" x="${x}" y="${y}" width="${size}" height="${size}" rx="14"/><path class="thin" opacity=".45" d="M${x + 22} ${y + 34} h${40 + ((row * 3 + col) * 13) % 24} M${x + 22} ${y + 52} h${24 + ((row + col) * 17) % 30}"/>`);
  }
  const hx = x0 + 2 * (size + gap), hy = y0 + (size + gap);
  const hole = `<rect x="${hx}" y="${hy}" width="${size}" height="${size}" rx="14" fill="none" stroke="var(--soft)" stroke-width="2" stroke-dasharray="2 8" stroke-linecap="round"/>`;
  const trail = smooth([[1120, 96], [1040, 150], [1010, 232], [942, 250], [900, 236]]);
  const piece = `<g transform="translate(846 196) rotate(14)"><rect class="bluefill" x="-52" y="-52" width="${size}" height="${size}" rx="14"/><path d="M-26 6 l18 18 l40 -52" fill="none" stroke="var(--paper)" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></g>`;
  return wrap('A grid of nine paper tiles with one missing. A blue tile with a tick on it is arriving along a dotted path to fill the gap.', `
    <circle class="sun" cx="596" cy="250" r="214"/>
    <path class="thin" d="M70 458 H1130" opacity=".35"/>
    ${tiles.join('')}${hole}
    <path class="path" d="${trail}"/>${piece}`);
}

writeFileSync(join(HERE, 'picture-a.html'), pictureA());
writeFileSync(join(HERE, 'picture-b.html'), pictureB());
const page = (name, frag) => writeFileSync(join(HERE, `picture-${name}-page.html`), `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#fbfbf9"><div style="max-width:72rem;margin:2rem auto;padding:0 2rem">${frag}</div>`);
page('a', pictureA()); seed = 7; page('b', pictureB());
console.log('pictures written');
