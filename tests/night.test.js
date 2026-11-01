// Cricket and frog pacing, and the rare figure at the tree line.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { loadFire } = require("./lib/load-fire");
const { backgroundRGBA } = require("./lib/images");

const Fire = loadFire();
const NIGHT_JS = path.join(__dirname, "..", "ui", "fire", "night.js");

function loadNight() {
  const source = fs.readFileSync(NIGHT_JS, "utf8").replace(/^\.pragma library\s*$/m, "");
  const module = { exports: {} };
  vm.runInContext(source, vm.createContext({ module, Math }), { filename: NIGHT_JS });
  return module.exports;
}

const Night = loadNight();

function runAmbience(seed, seconds, dt = 0.1) {
  const a = Night.createAmbience(seed);
  const events = [];
  for (let t = 0; t < seconds; t += dt) {
    for (const ev of Night.advanceAmbience(a, dt)) events.push({ t: t + dt, ...ev });
  }
  return events;
}

function gaps(times) {
  const g = [];
  for (let i = 1; i < times.length; i++) g.push(times[i] - times[i - 1]);
  return g;
}

test("crickets phrase and rest, frogs stay rare and out of the way", () => {
  for (const seed of [5919, 1, 2, 7, 99]) {
    const ev = runAmbience(seed, 15 * 60);
    const crickets = ev.filter(e => e.kind === "cricket");
    const primaries = crickets.filter(e => !e.answer);
    const answers = crickets.filter(e => e.answer);
    const frogs = ev.filter(e => e.kind === "peep" || e.kind === "croak");
    const frogPrimaries = frogs.filter(e => !e.echo);
    assert.ok(primaries.length > 40, `seed ${seed}: a night of cricket phrases`);
    assert.ok(frogs.length > 4, `seed ${seed}: frogs do call`);
    assert.ok(primaries.length > frogs.length * 3, `seed ${seed}: frogs are much rarer than crickets`);
    assert.ok(primaries[0].t >= 6 && primaries[0].t <= 10, `seed ${seed}: first chirp lets the fire speak first`);
    assert.ok(frogPrimaries[0].t >= 22 && frogPrimaries[0].t <= 40, `seed ${seed}: first frog is later`);

    const pg = gaps(primaries.map(e => e.t));
    for (const gap of pg) {
      // Recorded on a 0.1 s clock, so a phrase step of 0.86 to 1.10 s
      // lands in a slightly wider bucket.
      const phrase = gap >= 0.75 && gap <= 1.25;
      const rest = gap >= 14;
      assert.ok(phrase || rest, `seed ${seed}: cricket gap ${gap.toFixed(3)} is a phrase step or a rest`);
    }
    // Phrases are several chirps, not a metronome that never stops.
    assert.ok(pg.some(g => g >= 14), `seed ${seed}: the cricket rests between phrases`);
    assert.ok(pg.filter(g => g >= 0.84 && g <= 1.15).length > pg.filter(g => g >= 14).length, `seed ${seed}: chirps come in phrases`);

    for (const ans of answers) {
      const before = primaries.filter(p => ans.t - p.t > 0.2 && ans.t - p.t < 0.5);
      assert.equal(before.length, 1, `seed ${seed}: an answer follows one chirp`);
      assert.ok(ans.gain < 0.65, "the answering cricket is farther off");
    }

    const fg = gaps(frogPrimaries.map(e => e.t));
    for (const gap of fg) assert.ok(gap >= 22, `seed ${seed}: frogs wait ${gap.toFixed(1)}s`);
    for (const echo of frogs.filter(e => e.echo)) {
      const before = frogPrimaries.filter(p => p.kind === echo.kind && echo.t - p.t >= 0.9 && echo.t - p.t <= 2.1);
      assert.ok(before.length >= 1, `seed ${seed}: a doubled call follows its own kind`);
    }

    // No two calls begin in the same tenth of a second.
    const times = ev.map(e => e.t).sort((a, b) => a - b);
    for (let i = 1; i < times.length; i++) {
      assert.ok(times[i] - times[i - 1] >= 0.1, `seed ${seed}: calls stacked at ${times[i].toFixed(2)} (gap ${(times[i] - times[i - 1]).toFixed(2)})`);
    }
  }
});

test("the figure waits, stays a few seconds, and uses every part of the tree line", () => {
  const seen = new Set();
  for (let seed = 1; seed <= 80; seed++) {
    const w = Night.createWatch(seed, Fire.VISITOR_SPOTS.length);
    let t = 0;
    let appeared = -1;
    while (t < 320 && !w.visit) {
      Night.advanceWatch(w, 0.05);
      t += 0.05;
    }
    assert.ok(w.visit, `seed ${seed}: a figure within five minutes`);
    assert.ok(t >= 180 && t < 301, `seed ${seed}: first appearance at ${t.toFixed(1)}s is rare`);
    appeared = t;
    const spot = w.visit.spot;
    const duration = w.visit.duration;
    assert.ok(spot >= 0 && spot < Fire.VISITOR_SPOTS.length);
    assert.ok(duration >= 2.3 && duration <= 3.8, `duration ${duration}`);
    seen.add(spot);
    while (w.visit) {
      Night.advanceWatch(w, 0.05);
      t += 0.05;
    }
    assert.ok(t - appeared >= 2.3 && t - appeared <= 4.0, "it does not linger");
    const after = t;
    while (t < after + 470 && !w.visit) {
      Night.advanceWatch(w, 0.05);
      t += 0.05;
    }
    assert.equal(w.visit, null, "the next one is at least eight minutes later");
  }
  assert.equal(seen.size, Fire.VISITOR_SPOTS.length, `spots seen: ${[...seen].sort()}`);
});

test("each spot scales the figure to the trees there, and the shape stays faint", () => {
  const src = backgroundRGBA();
  const bg = Fire.prepareBackground(src.data, src.width, src.height);
  const heights = Fire.VISITOR_SPOTS.map(s => Fire.visitorSize(s).dh);
  for (let i = 0; i < Fire.VISITOR_SPOTS.length; i++) {
    const spot = Fire.VISITOR_SPOTS[i];
    const expect = Math.max(3, Math.round(spot.tree * Fire.VISITOR_TREE_FRACTION));
    assert.equal(heights[i], expect, spot.name);
    assert.ok(Math.abs(heights[i] / spot.tree - Fire.VISITOR_TREE_FRACTION) < 0.08, spot.name);
  }
  // Far shore is the smallest, the center pines the largest.
  const far = heights[Fire.VISITOR_SPOTS.findIndex(s => s.name === "far shore")];
  const center = heights[Fire.VISITOR_SPOTS.findIndex(s => s.name === "center pines")];
  assert.ok(far < center);
  assert.ok(far <= 5 && center >= 12, `far ${far}, center ${center}`);

  for (let spot = 0; spot < Fire.VISITOR_SPOTS.length; spot++) {
    const s = Fire.createState();
    s.visitor = { spot, age: 0, duration: 3 };
    const plain = Fire.createFrame();
    const marked = Fire.createFrame();
    Fire.render(plain, Fire.createState(), bg);
    const rects = Fire.createRects();
    Fire.render(marked, s, bg, rects);
    let changed = 0, maxDelta = 0, outside = 0;
    const box = Fire.visitorSize(Fire.VISITOR_SPOTS[spot]);
    const left = Math.round(Fire.VISITOR_SPOTS[spot].x - box.dw / 2);
    const top = Math.round(Fire.VISITOR_SPOTS[spot].y - box.dh);
    for (let y = 0; y < 240; y++) for (let x = 0; x < 360; x++) {
      const i = (y * 360 + x) * 4;
      const d = Math.max(
        Math.abs(marked[i] - plain[i]),
        Math.abs(marked[i + 1] - plain[i + 1]),
        Math.abs(marked[i + 2] - plain[i + 2]));
      if (d === 0) continue;
      changed++;
      if (d > maxDelta) maxDelta = d;
      const inside = x >= left && x < left + box.dw && y >= top && y < top + box.dh;
      if (!inside) outside++;
    }
    assert.ok(changed > 0, `${Fire.VISITOR_SPOTS[spot].name} is visible if you look`);
    assert.equal(outside, 0, `${Fire.VISITOR_SPOTS[spot].name} stays on its spot`);
    assert.ok(maxDelta <= 16, `${Fire.VISITOR_SPOTS[spot].name} shifts a pixel by ${maxDelta}, which is too strong`);
    // The dirty rectangles cover the change.
    const covered = new Uint8Array(360 * 240);
    for (let k = 0; k < rects.n; k++) {
      const x0 = rects.r[k * 4], y0 = rects.r[k * 4 + 1], x1 = rects.r[k * 4 + 2], y1 = rects.r[k * 4 + 3];
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) covered[y * 360 + x] = 1;
    }
    for (let y = top; y < top + box.dh; y++) for (let x = left; x < left + box.dw; x++) {
      const i = (y * 360 + x) * 4;
      const d = Math.abs(marked[i] - plain[i]) + Math.abs(marked[i + 1] - plain[i + 1]) + Math.abs(marked[i + 2] - plain[i + 2]);
      if (d > 0) assert.ok(covered[y * 360 + x], `dirty rect misses ${x},${y}`);
    }
  }
});

test("both ctrl keys and both alt keys are the only chord, and it paints every spot", () => {
  assert.equal(Night.chordSide(29), "lctrl");
  assert.equal(Night.chordSide(37), "lctrl");
  assert.equal(Night.chordSide(97), "rctrl");
  assert.equal(Night.chordSide(105), "rctrl");
  assert.equal(Night.chordSide(56), "lalt");
  assert.equal(Night.chordSide(64), "lalt");
  assert.equal(Night.chordSide(100), "ralt");
  assert.equal(Night.chordSide(108), "ralt");
  assert.equal(Night.chordSide(0), "");
  assert.equal(Night.chordSide(30), "");
  const down = { lctrl: true, rctrl: true, lalt: true, ralt: true };
  assert.equal(Night.chordHeld(down), true);
  for (const side of ["lctrl", "rctrl", "lalt", "ralt"]) {
    const missing = { ...down, [side]: false };
    assert.equal(Night.chordHeld(missing), false, side);
  }
  assert.equal(Night.chordHeld(null), false);

  const src = backgroundRGBA();
  const bg = Fire.prepareBackground(src.data, src.width, src.height);
  const plain = Fire.createFrame();
  const again = Fire.createFrame();
  const all = Fire.createFrame();
  const sAll = Fire.createState();
  sAll.visitorShowAll = true;
  const rects = Fire.createRects();
  Fire.render(plain, Fire.createState(), bg);
  Fire.render(again, Fire.createState(), bg);
  Fire.render(all, sAll, bg, rects);
  for (let i = 0; i < plain.length; i++) assert.equal(again[i], plain[i]);

  const boxes = Fire.VISITOR_SPOTS.map(spot => {
    const box = Fire.visitorSize(spot);
    return {
      left: Math.round(spot.x - box.dw / 2),
      top: Math.round(spot.y - box.dh),
      right: Math.round(spot.x - box.dw / 2) + box.dw,
      bottom: Math.round(spot.y - box.dh) + box.dh,
      hits: 0
    };
  });
  let outside = 0;
  for (let y = 0; y < 240; y++) for (let x = 0; x < 360; x++) {
    const i = (y * 360 + x) * 4;
    const d = Math.max(
      Math.abs(all[i] - plain[i]),
      Math.abs(all[i + 1] - plain[i + 1]),
      Math.abs(all[i + 2] - plain[i + 2]));
    if (d === 0) continue;
    let inside = false;
    for (const box of boxes) {
      if (x >= box.left && x < box.right && y >= box.top && y < box.bottom) {
        box.hits++;
        inside = true;
      }
    }
    if (!inside) outside++;
  }
  assert.equal(outside, 0);
  for (let i = 0; i < boxes.length; i++)
    assert.ok(boxes[i].hits > 0, Fire.VISITOR_SPOTS[i].name);
  const covered = new Uint8Array(360 * 240);
  for (let k = 0; k < rects.n; k++) {
    const x0 = rects.r[k * 4], y0 = rects.r[k * 4 + 1], x1 = rects.r[k * 4 + 2], y1 = rects.r[k * 4 + 3];
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) covered[y * 360 + x] = 1;
  }
  for (const box of boxes) {
    for (let y = box.top; y < box.bottom; y++) for (let x = box.left; x < box.right; x++) {
      const i = (y * 360 + x) * 4;
      const d = Math.abs(all[i] - plain[i]) + Math.abs(all[i + 1] - plain[i + 1]) + Math.abs(all[i + 2] - plain[i + 2]);
      if (d > 0) assert.ok(covered[y * 360 + x], `dirty rect misses ${x},${y}`);
    }
  }
});
