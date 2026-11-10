// The front page's picture, proposed (11 November 2026): a hand-off bench, drawn in isometric paper and ink.
//
//   node docs/box-v4/design/hero/build.mjs [path to the anatomy kit folder]
//
// writes hero.fragment.html beside this file: one <div> with its styles, the drawing and its script,
// ready to drop into a page. Nothing here is product code.
//
// The object is the explanation. What moves, and what it means:
//   a task card drops into an open box            the task and the code are packed
//   the box rides its rail out through the gate   posted in the open, as a GitHub issue
//   three cards ride back in on the near rail     pull requests come back
//   the arm picks one and sets it on the stack    the agent merges one onto the branch
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const KIT = process.argv[2] ?? join(process.env.USERPROFILE ?? process.env.HOME, '.claude', 'skills', 'anatomy', 'kit');
const k = await import(pathToFileURL(join(KIT, 'iso-kit.mjs')).href);

const WIDTH = 920, HEIGHT = 452;
const PLATE = { x: -184, y: -80, w: 368, d: 160, r: 10 };
const PLATE_H = 10, FOOT_H = 5;
const OUT_Y = -36, BACK_Y = 30;                    // the two lanes
const X0 = -118, X1 = 112;                         // where the box waits, and where it is posted
const GATE_X = 38, GATE_H = 58;
const SLOTS = [18, 62, 106];                       // where the three answers stop
const STACK_X = -128, STACK_TOP = 14;
const BEAM_Z = 54, BEAM_Y = 6, HEAD_REST = -52;
const CARD = { w: 30, d: 20, h: 3 };

const P = k.fitProjection(
  [...k.boxCorners(PLATE, -PLATE_H - FOOT_H, 0), [GATE_X, -64, GATE_H + 8], [172, -78, 62], [HEAD_REST, BACK_Y, 106], [-175, 76, 44]],
  WIDTH, HEIGHT, { pad: 12, azimuth: 45 }
);
const at = point => k.iso(point, P);
const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const D = (points, style) => k.dotsSvg(points, style);
const slab = (plan, z, h, style = { tone: 'mid' }, steps = 3, bevel = 0.4) => S(k.slabOf(plan, z, h, P, steps, bevel), style);
const byDepth = points => [...points].sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));

function base() {
  const out = [`<path class="iso-halo" d="${k.haloOf(PLATE, -PLATE_H - FOOT_H, PLATE_H, P)}"/>`];
  for (const [x, y] of byDepth(k.corners(PLATE, 24))) {
    out.push(S(k.cylinder(x, y, 8, -PLATE_H - FOOT_H, 1.6, P, 28), { tone: 'lo' }));
    out.push(S(k.cylinder(x, y, 6, -PLATE_H - FOOT_H + 1.6, FOOT_H - 1.6, P, 28), { tone: 'mid' }));
  }
  out.push(S(k.slabOf(PLATE, -PLATE_H, PLATE_H, P, 10, 1.4), { tone: 'mid' }));
  out.push(L(k.planOutline(k.insetPlan(PLATE, 5), 0, P), { tone: 'faint' }));
  const screws = k.corners(PLATE, 11);
  out.push(L(screws.map(([x, y]) => k.ring(x, y, 2.3, 0, P, 16)).join(''), { tone: 'lo' }));
  out.push(D(screws.map(([x, y]) => at([x, y, 0])), { size: 0.5 }));
  // The line the box crosses: this side is your repository's working copy, that side is in the open.
  out.push(L(k.lineOnTop([GATE_X, PLATE.y + 5], [GATE_X, PLATE.y + PLATE.d - 5], 0, P), { tone: 'lo', dashed: true }));
  // A ruler along the near edge, and a label plate.
  const strip = { x: -150, y: PLATE.y + PLATE.d - 15, w: 300, d: 7, r: 1 };
  out.push(S(k.slabOf(strip, 0, 0.6, P, 3), { tone: 'lo', crease: 'none' }));
  const ticks = k.topTicks(strip.x + 4, strip.x + strip.w - 4, 4, 5, strip.y + 0.8, 0.6, [2, 3.6], P);
  out.push(L(ticks.minor, { tone: 'lo' }), L(ticks.major, { tone: 'mid' }));
  out.push(D([at([strip.x + 2, strip.y + 3.5, 0.6]), at([strip.x + strip.w - 2, strip.y + 3.5, 0.6])], { size: 0.45 }));
  const label = { x: 128, y: 44, w: 34, d: 14, r: 1.5 };
  out.push(S(k.slabOf(label, 0, 0.8, P, 3), { tone: 'lo', crease: 'none' }));
  out.push(L([3.5, 7, 10.5].map((dy, i) => k.lineOnTop([label.x + 4, label.y + dy], [label.x + label.w - (i === 2 ? 14 : 4), label.y + dy], 0.8, P)).join(''), { tone: 'lo', free: true }));
  out.push(D([at([label.x + 2, label.y + 2, 0.8]), at([label.x + label.w - 2, label.y + label.d - 2, 0.8])], { size: 0.4 }));
  // Where each answer stops.
  for (const x of SLOTS) out.push(L(k.planOutline({ x: x - 17, y: BACK_Y - 12, w: 34, d: 24, r: 2 }, 0, P, 3), { tone: 'faint' }));
  out.push(L(k.planOutline({ x: X1 - 23, y: OUT_Y - 20, w: 46, d: 40, r: 2 }, 0, P, 3), { tone: 'faint' }));
  return out.join('');
}

function rails(y, from, to) {
  const out = [];
  for (const offset of [-12, 8]) {
    out.push(slab({ x: from, y: y + offset, w: to - from, d: 4, r: 1 }, 0, 3));
    out.push(D([from + 8, (from + to) / 2, to - 8].map(x => at([x, y + offset + 2, 3])), { size: 0.4 }));
  }
  return out.join('');
}
const stop = (x, y) => slab({ x, y: y - 16, w: 5, d: 32, r: 1.2 }, 0, 8) + D([at([x + 2.5, y - 10, 8]), at([x + 2.5, y + 10, 8])], { size: 0.45 });
const post = (x, y, h, r = 2.6) => S(k.cylinder(x, y, r + 1.6, 0, 2, P, 20), { tone: 'mid' }) + S(k.cylinder(x, y, r, 2, h - 2, P, 20), { tone: 'mid', crease: 'none' }) + L(k.sideArc(x, y, r, h * 0.5, P, 12), { tone: 'faint' });

// The box that goes out, built round the origin and moved as one group: far walls, the card, near walls.
const BOX = { x: -20, y: -17, w: 40, d: 34, r: 2 };
function boxBack() {
  const out = [slab(k.insetPlan(BOX, -2), 3, 3)];
  out.push(slab({ x: BOX.x, y: BOX.y, w: BOX.w, d: 2.6, r: 0.8 }, 6, 16));
  out.push(slab({ x: BOX.x, y: BOX.y, w: 2.6, d: BOX.d, r: 0.8 }, 6, 16));
  out.push(L(k.planOutline(k.insetPlan(BOX, 4), 6, P, 3), { tone: 'faint' }));
  return out.join('');
}
function boxFront() {
  const out = [];
  out.push(slab({ x: BOX.x + BOX.w - 2.6, y: BOX.y, w: 2.6, d: BOX.d, r: 0.8 }, 6, 16));
  out.push(slab({ x: BOX.x, y: BOX.y + BOX.d - 2.6, w: BOX.w, d: 2.6, r: 0.8 }, 6, 16));
  out.push(L(k.segment([BOX.x + BOX.w, BOX.y + 3, 14], [BOX.x + BOX.w, BOX.y + BOX.d - 3, 14], P), { tone: 'faint' }));
  out.push(D([at([BOX.x + BOX.w, BOX.y + 5, 18]), at([BOX.x + BOX.w, BOX.y + BOX.d - 5, 18])], { size: 0.4 }));
  return out.join('');
}
// The task: a card standing in the box. The one accent.
function taskCard() {
  const plan = { x: -1.6, y: -12, w: 3.2, d: 24, r: 0.6 };
  const out = [S(k.slabOf(plan, 7, 30, P, 2, 0.3), { tone: 'hi', className: 'ob-accent' })];
  out.push(L([30, 25, 20].map((z, i) => k.segment([1.6, -8, z], [1.6, i === 2 ? 1 : 8, z], P)).join(''), { tone: 'hi', className: 'ob-on-accent', free: true }));
  return out.join('');
}

// An answer: a card lying on the near rails.
function answer(accent) {
  const plan = { x: -CARD.w / 2, y: -CARD.d / 2, w: CARD.w, d: CARD.d, r: 1.5 };
  const out = [S(k.slabOf(plan, 3, CARD.h, P, 3, 0.4), { tone: accent ? 'hi' : 'mid', className: accent ? 'ob-accent' : undefined })];
  out.push(L([-4, 0, 4].map((dy, i) => k.lineOnTop([-10, dy], [i === 2 ? 0 : 10, dy], 3 + CARD.h, P)).join(''), { tone: accent ? 'hi' : 'lo', className: accent ? 'ob-on-accent' : undefined, free: true }));
  if (!accent) out.push(D([at([11, -6, 3 + CARD.h])], { size: 0.5 }));
  return out.join('');
}

function gate() {
  const far = post(GATE_X, -64, GATE_H);
  const near = post(GATE_X, -8, GATE_H);
  const lintel = slab({ x: GATE_X - 3.5, y: -68, w: 7, d: 64, r: 1.5 }, GATE_H, 5, { tone: 'mid' }, 3, 0.5)
    + D([at([GATE_X, -64, GATE_H + 5]), at([GATE_X, -8, GATE_H + 5])], { size: 0.5 })
    + L(k.sideSeam({ x: GATE_X - 3.5, y: -68, w: 7, d: 64, r: 1.5 }, GATE_H + 2.5, P, 3), { tone: 'faint' });
  return { far, near: near + lintel };
}

function flagUnused() {
  const [x, y] = [160, -62];
  const mast = post(x, y, 46, 1.5) + S(k.cylinder(x, y, 2.4, 46, 1.6, P, 16), { tone: 'mid' });
  const cloth = slab({ x: x - 0.6, y: y + 2, w: 1.2, d: 15, r: 0.4 }, 0, 9, { tone: 'hi' }, 2, 0)
    + L(k.segment([x + 0.6, y + 5, 4.5], [x + 0.6, y + 13, 4.5], P), { tone: 'lo', free: true });
  return { mast, cloth };
}

function stack() {
  const out = [slab({ x: STACK_X - 20, y: BACK_Y - 15, w: 40, d: 30, r: 2 }, 0, 2)];
  [[0.8, -0.6], [-0.7, 0.5], [0.4, 0.3], [0, 0]].forEach(([dx, dy], index) => {
    out.push(slab({ x: STACK_X - CARD.w / 2 + dx, y: BACK_Y - CARD.d / 2 + dy, w: CARD.w, d: CARD.d, r: 1.5 }, 2 + index * 3, 3, { tone: 'mid', crease: 'lo' }));
  });
  out.push(L([-4, 0, 4].map((dy, i) => k.lineOnTop([STACK_X - 10, BACK_Y + dy], [STACK_X + (i === 2 ? 0 : 10), BACK_Y + dy], STACK_TOP, P)).join(''), { tone: 'lo', free: true }));
  return out.join('');
}

function gantry() {
  const posts = [-158, -84, 128].map(x => post(x, BEAM_Y, BEAM_Z)).join('');
  const beamPlan = { x: -164, y: BEAM_Y - 3, w: 298, d: 6, r: 1.2 };
  const beam = slab(beamPlan, BEAM_Z, 5, { tone: 'mid' }, 3, 0.5)
    + L(k.sideSeam(beamPlan, BEAM_Z + 2.5, P, 3), { tone: 'faint' })
    + D([-158, -84, 128].map(x => at([x, BEAM_Y, BEAM_Z + 5])), { size: 0.5 });
  const ticks = k.topTicks(-150, 120, 6, 5, BEAM_Y - 2.6, BEAM_Z + 5, [1.6, 3], P);
  return { posts, beam: beam + L(ticks.minor, { tone: 'lo' }) + L(ticks.major, { tone: 'mid' }) };
}
// The arm's carriage, built at x = 0 and moved along the beam.
function head() {
  const out = [];
  out.push(slab({ x: -10, y: BEAM_Y - 6, w: 20, d: 12, r: 1.5 }, BEAM_Z + 5, 6, { tone: 'hi', crease: 'lo' }, 3, 0.5));
  out.push(slab({ x: -7, y: BEAM_Y + 3, w: 14, d: 3, r: 0.8 }, BEAM_Z - 2, 7, { tone: 'hi', crease: 'lo' }, 2, 0.3));
  out.push(slab({ x: -3.5, y: BEAM_Y + 6, w: 7, d: BACK_Y - BEAM_Y - 1, r: 1.5 }, BEAM_Z + 7, 4, { tone: 'hi', crease: 'lo' }, 3, 0.4));
  out.push(S(k.cylinder(0, BEAM_Y, 4, BEAM_Z + 11, 4, P, 24), { tone: 'mid' }));
  out.push(L(k.knurl(0, BEAM_Y, 4, BEAM_Z + 11, BEAM_Z + 15, 22, P), { tone: 'lo' }));
  out.push(D([at([0, BEAM_Y, BEAM_Z + 15]), at([-7, BEAM_Y + 3, BEAM_Z + 11]), at([7, BEAM_Y + 3, BEAM_Z + 11])], { size: 0.45 }));
  out.push(S(k.cylinder(0, BACK_Y, 3.4, BEAM_Z + 11, 2.4, P, 20), { tone: 'mid' }));
  return out.join('');
}
// The rod and its pad, built with the pad's foot at z = 0 and moved up and down.
function gripper() {
  const out = [S(k.cylinder(0, BACK_Y, 6.5, 0, 2.2, P, 28, 0.4), { tone: 'hi', crease: 'lo' })];
  out.push(S(k.cylinder(0, BACK_Y, 1.5, 2.2, 64, P, 16), { tone: 'hi', crease: 'none' }));
  out.push(L([18, 34].map(z => k.sideArc(0, BACK_Y, 1.5, z, P, 10)).join(''), { tone: 'faint' }));
  return out.join('');
}

const G = (name, body, offset = [0, 0, 0], extra = '') => `<g data-part="${name}" transform="${k.translateAlong(P, offset)}"${extra}>${body}</g>`;
// The agent's console, where the task comes from: a small screen on a foot, facing the bench.
function consoleUnit() {
  const out = [slab({ x: -181, y: 36, w: 18, d: 38, r: 2 }, 0, 3)];
  out.push(slab({ x: -174, y: 51, w: 4, d: 8, r: 1 }, 3, 6));
  const screen = { x: -175, y: 34, w: 4, d: 42, r: 1 };
  out.push(S(k.slabOf(screen, 9, 34, P, 3, 0.4), { tone: 'hi', crease: 'lo' }));
  const X = -171, y0 = 37, y1 = 73;
  out.push(L(['M', ...[[y0, 12], [y1, 12], [y1, 40], [y0, 40]].map(([y, z], i) => (i ? 'L' : '') + at([X, y, z]).map(n => n.toFixed(1)).join(' ')), 'Z'].join(' '), { tone: 'lo' }));
  out.push(L([35, 31, 27, 23].map((z, i) => k.segment([X, y0 + 4, z], [X, y0 + [26, 19, 30, 11][i], z], P)).join(''), { tone: 'mid', free: true }));
  out.push('<g data-part="cursor">' + D([at([X, y0 + 14.5, 23])], { size: 0.9, tone: 'hi' }) + '</g>');
  return out.join('');
}
// The open board: a panel along the back edge with other people's issues pinned to it. Ours is pinned when the box arrives.
const quad = (pts) => 'M' + pts.map(p => at(p).map(n => n.toFixed(1)).join(' ')).join('L') + 'Z';
function board() {
  const plan = { x: 64, y: -79, w: 112, d: 3.4, r: 1 };
  const out = [slab({ x: 70, y: -80, w: 8, d: 9, r: 1 }, 0, 3), slab({ x: 162, y: -80, w: 8, d: 9, r: 1 }, 0, 3)];
  out.push(S(k.slabOf(plan, 3, 56, P, 3, 0.4), { tone: 'mid' }));
  const Y = -75.6;
  out.push(L(quad([[68, Y, 7], [172, Y, 7], [172, Y, 55], [68, Y, 55]]), { tone: 'faint' }));
  const pins = [];
  [[74, 36], [98, 36], [122, 36], [146, 36], [74, 13], [98, 13], [146, 13]].forEach(([x, z]) => {
    out.push(L(quad([[x, Y, z], [x + 19, Y, z], [x + 19, Y, z + 15], [x, Y, z + 15]]), { tone: 'lo' }));
    out.push(L(k.segment([x + 3, Y, z + 10], [x + 15, Y, z + 10], P) + k.segment([x + 3, Y, z + 6], [x + 11, Y, z + 6], P), { tone: 'faint', free: true }));
    pins.push(at([x + 9.5, Y, z + 15]));
  });
  out.push(D(pins, { size: 0.55 }));
  const ours = [122, 13];
  out.push('<g data-part="pin"><path class="ob-pin" d="' + quad([[ours[0], Y, ours[1]], [ours[0] + 19, Y, ours[1]], [ours[0] + 19, Y, ours[1] + 15], [ours[0], Y, ours[1] + 15]]) + '"/>'
    + L(k.segment([ours[0] + 3, Y, ours[1] + 10], [ours[0] + 15, Y, ours[1] + 10], P) + k.segment([ours[0] + 3, Y, ours[1] + 6], [ours[0] + 11, Y, ours[1] + 6], P), { tone: 'hi', className: 'ob-on-accent', free: true })
    + D([at([ours[0] + 9.5, Y, ours[1] + 15])], { size: 0.6, tone: 'hi' }) + '</g>');
  return out.join('');
}
const theGate = gate(), theGantry = gantry();

// ---- the story, as one pure function of time. The page runs the same function. ----
const STORY = `
const ease = (t) => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
const span = (t, from, to) => ease((t - from) / (to - from));
const X0 = ${X0}, X1 = ${X1}, SLOTS = ${JSON.stringify(SLOTS)}, STACK_X = ${STACK_X}, REST = ${HEAD_REST}, LOOP = 11.4;
const LINES = [
  ['$ box bounty post bt-4f2a91c07d3e', 'packed: the task, what was tried, the code'],
  ['$ box bounty post bt-4f2a91c07d3e', 'posted \\u00b7 issue #48 on example-org/ledger'],
  ['$ box bounty status bt-4f2a91c07d3e', 'pull requests #61, #62, #63'],
  ['$ box bounty apply bt-4f2a91c07d3e 62', 'attempt 62 \\u00b7 picked'],
  ['$ box bounty apply bt-4f2a91c07d3e 62', 'applied \\u00b7 attempt 62 merged on this branch']
];
function story(t) {
  const drop = span(t, 0.15, 0.95);
  const out = span(t, 1.0, 2.9);
  const arrive = [span(t, 3.3, 4.4), span(t, 3.9, 5.0), span(t, 4.5, 5.6)];
  const reach = span(t, 5.9, 6.6), down = span(t, 6.6, 7.0) - span(t, 7.0, 7.4);
  const carry = span(t, 7.4, 8.7), set = span(t, 8.7, 9.1), release = span(t, 9.1, 9.4), home = span(t, 9.5, 10.3);
  const lifted = span(t, 7.0, 7.4);
  const headX = REST + (SLOTS[1] - REST) * reach + (STACK_X - SLOTS[1]) * carry + (REST - STACK_X) * home;
  const cardLift = 28 * lifted - 17 * set;                    // rides up 28, then down onto the stack, 11 above the rail
  const pad = t < 7.0 ? 36 - 30 * span(t, 6.6, 7.0) : t < 9.1 ? 6 + cardLift : 6 + 11 + 19 * release;
  return {
    show: Math.min(span(t, 0, 0.35), 1 - span(t, LOOP - 0.5, LOOP - 0.05)),
    boxX: X0 + (X1 - X0) * out,
    taskZ: 44 * (1 - drop), taskShow: span(t, 0.1, 0.5),
    pinned: span(t, 2.9, 3.3),
    answers: SLOTS.map((slot, i) => ({ x: slot + 96 * (1 - arrive[i]), show: span(t, 3.3 + i * 0.6, 3.7 + i * 0.6) })),
    pickedX: SLOTS[1] + 96 * (1 - arrive[1]) + (STACK_X - SLOTS[1]) * carry, pickedZ: cardLift, accent: span(t, 6.9, 7.5),
    headX, pad,
    line: t < 0.95 ? 0 : t < 3.0 ? (t < 2.9 ? 0 : 1) : t < 3.4 ? 1 : t < 5.9 ? 2 : t < 8.9 ? 3 : 4
  };
}`;
const { story, LINES } = new Function(`${STORY}; return { story, LINES };`)();
const REST_AT = 8.05;                                          // the still picture: the arm carrying #62 to the stack
const now = story(REST_AT);

const body = [
  base(),
  board(),
  rails(OUT_Y, -150, 150), stop(-155, OUT_Y), stop(150, OUT_Y),
  theGate.far,
  `<g data-part="box" transform="${k.translateAlong(P, [now.boxX, OUT_Y, 0])}">${boxBack()}${G('task', taskCard(), [0, 0, now.taskZ])}${boxFront()}</g>`,
  theGate.near,
  rails(BACK_Y, -100, 174), stop(-105, BACK_Y),
  stack(), consoleUnit(),
  theGantry.posts, theGantry.beam,
  G('a0', answer(false), [now.answers[0].x, BACK_Y, 0]),
  G('a2', answer(false), [now.answers[2].x, BACK_Y, 0]),
  `<g data-part="a1" transform="${k.translateAlong(P, [now.pickedX, BACK_Y, now.pickedZ])}">${answer(false)}<g data-part="a1-accent" style="opacity:${now.accent}">${answer(true)}</g></g>`,
  G('pad', gripper(), [now.headX, 0, now.pad]),
  G('head', head(), [now.headX, 0, 0])
];
const svg = k.figureSvg({
  width: WIDTH, height: HEIGHT, body,
  label: 'A bench that shows how a bounty works. A task card stands in an open box; the box rides a rail out through a gate, where it is posted. Three answer cards ride back in on a nearer rail. An arm on an overhead beam picks one of them and sets it on the stack.'
});

const ux = k.axisVector(P, [1, 0, 0]), uz = k.axisVector(P, [0, 0, 1]), oy = k.axisVector(P, [0, 1, 0]);
const LIVE = `(() => {
${STORY}
const root = document.currentScript.closest('.ob-hero');
const part = (name) => root.querySelector('[data-part="' + name + '"]');
const UX = ${JSON.stringify(ux)}, UZ = ${JSON.stringify(uz)}, UY = ${JSON.stringify(oy)};
const move = (el, x, y, z) => el.setAttribute('transform', 'translate(' + (UX[0] * x + UY[0] * y + UZ[0] * z).toFixed(2) + ' ' + (UX[1] * x + UY[1] * y + UZ[1] * z).toFixed(2) + ')');
const parts = { box: part('box'), task: part('task'), pin: part('pin'), cursor: part('cursor'), a: [part('a0'), part('a1'), part('a2')], accent: part('a1-accent'), pad: part('pad'), head: part('head') };
const command = root.querySelector('[data-flow-command]'), result = root.querySelector('[data-flow-result]');
let shown = -1;
function draw(t) {
  const s = story(t);
  move(parts.box, s.boxX, ${OUT_Y}, 0); move(parts.task, 0, 0, s.taskZ); parts.task.style.opacity = s.taskShow;
  parts.pin.style.opacity = s.pinned * s.show; parts.cursor.style.opacity = (t * 1.6) % 1 < 0.55 ? 1 : 0.15;
  move(parts.a[0], s.answers[0].x, ${BACK_Y}, 0); parts.a[0].style.opacity = s.answers[0].show;
  move(parts.a[2], s.answers[2].x, ${BACK_Y}, 0); parts.a[2].style.opacity = s.answers[2].show;
  move(parts.a[1], s.pickedX, ${BACK_Y}, s.pickedZ); parts.a[1].style.opacity = s.answers[1].show; parts.accent.style.opacity = s.accent;
  move(parts.pad, s.headX, 0, s.pad); move(parts.head, s.headX, 0, 0);
  parts.box.style.opacity = s.show;
  if (s.line !== shown) { shown = s.line; command.textContent = LINES[shown][0]; result.textContent = LINES[shown][1]; }
}
const still = matchMedia('(prefers-reduced-motion: reduce)');
let frame = 0, start = 0, visible = false;
function tick(now) {
  if (!start) start = now - ${REST_AT} * 1000;                 // carry on from the still picture, so nothing jumps at load
  draw(((now - start) / 1000) % LOOP);
  frame = visible && !still.matches ? requestAnimationFrame(tick) : 0;
}
new IntersectionObserver((entries) => { visible = entries[entries.length - 1].isIntersecting; if (visible && !frame && !still.matches) frame = requestAnimationFrame(tick); }).observe(root);
})();`;

const CSS = `
.ob-hero{--anatomy-paper:#fdfdfc;--anatomy-face:#ffffff;--anatomy-top:#ffffff;--anatomy-shade-0:#d9dbdd;--anatomy-shade-1:#e3e5e6;--anatomy-shade-2:#eceded;--anatomy-shade-3:#f4f4f3;
  --anatomy-hi:#1b1b18;--anatomy-mid:#7f7f7a;--anatomy-lo:#b3b3ae;--anatomy-faint:#d6d6d1;--anatomy-lit:#1b1b18;--anatomy-halo:#5d6f86;--anatomy-halo-opacity:.26;--anatomy-dot:#3a3a36;
  --anatomy-weight:.7px;--anatomy-mono:"Geist Mono",ui-monospace,Menlo,Consolas,monospace;--ob-accent:#1d4f91;--ob-accent-side:#173f74;--ob-accent-deep:#12335e;--ob-on-accent:#dfe9f6;
  position:relative;border-radius:1.5rem;overflow:hidden;padding:clamp(.5rem,2vw,1.5rem) clamp(.25rem,2vw,2rem) 3.4rem;
  background:radial-gradient(120% 100% at 50% 0%,#d9e3ef 0%,#eceef0 55%,#f3f2ee 100%)}
@media (prefers-color-scheme:dark){.ob-hero{--anatomy-paper:#1d1f23;--anatomy-face:#2a2d33;--anatomy-top:#2b2e34;--anatomy-shade-0:#15171a;--anatomy-shade-1:#1a1c20;--anatomy-shade-2:#1f2126;--anatomy-shade-3:#24272c;
  --anatomy-hi:#f1f0ec;--anatomy-mid:#8d8f94;--anatomy-lo:#5a5d63;--anatomy-faint:#3a3d43;--anatomy-lit:#ffffff;--anatomy-halo:#000000;--anatomy-halo-opacity:.7;--anatomy-dot:#e6e6e6;
  --ob-accent:#9dbfec;--ob-accent-side:#7da6dc;--ob-accent-deep:#5f8cc8;--ob-on-accent:#12335e;background:radial-gradient(120% 100% at 50% 0%,#223044 0%,#181b20 55%,#1b1b19 100%)}}
.ob-hero .iso-solid.ob-accent>.iso-fill,.ob-hero .iso-solid.ob-accent>.iso-top{fill:var(--ob-accent)}
.ob-hero .iso-solid.ob-accent>.iso-shade{fill:var(--ob-accent-side)}
.ob-hero .iso-solid.ob-accent>.iso-shade[data-shade="0"],.ob-hero .iso-solid.ob-accent>.iso-shade[data-shade="1"]{fill:var(--ob-accent-deep)}
.ob-hero .iso-solid.ob-accent>.iso-edge,.ob-hero .iso-solid.ob-accent>.iso-crease,.ob-hero .iso-solid.ob-accent>.iso-bevel{stroke:var(--ob-accent-deep)}
.ob-hero .iso-line.ob-on-accent{stroke:var(--ob-on-accent)}
.ob-hero .ob-pin{fill:var(--ob-accent);stroke:var(--ob-accent-deep);stroke-width:.6px}
.ob-hero .ob-line{position:absolute;left:0;right:0;bottom:0;display:flex;flex-wrap:wrap;justify-content:space-between;gap:.15rem 1.5rem;padding:.9rem clamp(1rem,3vw,2rem);font:400 .8125rem/1.25rem var(--anatomy-mono);color:var(--anatomy-mid)}
.ob-hero .ob-line [data-flow-command]{color:var(--anatomy-hi)}
`;

// The kit's own styles carry the drawing's classes; scope them to this block.
const fragment = `<div class="ob-hero iso" data-theme="light"><style>${k.ISO_CSS}${CSS}</style>${svg}<p class="ob-line"><span data-flow-command>${LINES[now.line][0]}</span><span data-flow-result>${LINES[now.line][1]}</span></p><script>${LIVE}</script></div>`;
writeFileSync(join(HERE, 'hero.fragment.html'), fragment);
writeFileSync(join(HERE, 'hero.html'), `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>The hand-off bench</title><body style="margin:0;background:#fbfbf9;font-family:system-ui"><div style="max-width:76rem;margin:3rem auto;padding:0 2rem">${fragment}</div></body>`);
console.log(`hero: ${(fragment.length / 1024).toFixed(0)} KB, ${(svg.match(/<path/g) ?? []).length} paths, ${(svg.match(/class="iso-solid/g) ?? []).length} solids`);
