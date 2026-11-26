// Compare the drawing against the expected shape on this round.
const width = 300;
const height = 160;
const size = width * height;

function alphaMask(context, w, h) {
  const data = context.getImageData(0, 0, w, h).data;
  return Uint8Array.from({length: w * h}, (_, i) => Number(data[i * 4 + 3] > 72));
}

function maskOf(canvas, source, destination) {
  const reduced = document.createElement('canvas');
  reduced.width = width;
  reduced.height = height;
  const context = reduced.getContext('2d', {willReadFrequently: true});
  if (source) {
    context.drawImage(canvas, source.x * 2, source.y * 2, source.w * 2, source.h * 2,
      destination.x, destination.y, destination.w, destination.h);
  } else {
    context.drawImage(canvas, 0, 0, width, height);
  }
  return alphaMask(context, width, height);
}

function bounds(mask, w, h) {
  let left = w, top = h, right = -1, bottom = -1;
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    const x = i % w;
    const y = Math.floor(i / w);
    left = Math.min(left, x);
    top = Math.min(top, y);
    right = Math.max(right, x);
    bottom = Math.max(bottom, y);
  }
  if (right < 0) return null;
  return {x: left, y: top, w: right - left + 1, h: bottom - top + 1};
}

function distance(mask) {
  const d = Float32Array.from(mask, pixel => pixel ? 0 : 10000);
  const diagonal = Math.SQRT2;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (x) d[i] = Math.min(d[i], d[i - 1] + 1);
      if (y) {
        d[i] = Math.min(d[i], d[i - width] + 1);
        if (x) d[i] = Math.min(d[i], d[i - width - 1] + diagonal);
        if (x < width - 1) d[i] = Math.min(d[i], d[i - width + 1] + diagonal);
      }
    }
  }
  for (let y = height - 1; y >= 0; y--) {
    for (let x = width - 1; x >= 0; x--) {
      const i = y * width + x;
      if (x < width - 1) d[i] = Math.min(d[i], d[i + 1] + 1);
      if (y < height - 1) {
        d[i] = Math.min(d[i], d[i + width] + 1);
        if (x < width - 1) d[i] = Math.min(d[i], d[i + width + 1] + diagonal);
        if (x) d[i] = Math.min(d[i], d[i + width - 1] + diagonal);
      }
    }
  }
  return d;
}

function components(mask) {
  const pending = mask.slice();
  const parts = [];
  for (let i = 0; i < size; i++) {
    if (!pending[i]) continue;
    const part = [i];
    pending[i] = 0;
    for (let at = 0; at < part.length; at++) {
      const pixel = part[at];
      const x = pixel % width;
      const y = Math.floor(pixel / width);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const neighbor = pixel + dy * width + dx;
          if (x + dx < 0 || x + dx >= width || y + dy < 0 || y + dy >= height || !pending[neighbor]) continue;
          pending[neighbor] = 0;
          part.push(neighbor);
        }
      }
    }
    if (part.length >= 2) parts.push(part);
  }
  return parts;
}

function alignWord(canvas, ink, target) {
  const source = bounds(ink, width, height);
  if (!source) return ink;

  // Match position and overall size while keeping the proportions of the handwriting.
  const scale = Math.min(target.w / source.w, target.h / source.h);
  const w = Math.min(target.w, source.w * scale * 1.25);
  const h = Math.min(target.h, source.h * scale * 1.25);
  const x = target.x + (target.w - w) / 2;
  const y = target.y + (target.h - h) / 2;
  return maskOf(canvas, source, {x, y, w, h});
}

export function traceGrade(coverage, precision) {
  const percent = Math.round(Math.min(coverage, precision) * 1000) / 10;
  return {percent, pass: percent > 75};
}

export function evaluateTrace(guide, inkCanvas) {
  const raw = maskOf(inkCanvas);
  const ink = guide.word ? alignWord(inkCanvas, raw, guide.box) : raw;
  const inkDistance = distance(ink);
  const coverRadius = guide.word ? 6 : 4.5;
  const precisionRadius = guide.word ? 7 : 5.5;
  let covered = 0, inside = 0, inkTotal = 0;
  const missed = [];
  for (let i = 0; i < size; i++) {
    if (guide.mask[i]) {
      if (inkDistance[i] <= coverRadius) covered++;
      else missed.push(i);
    }
    if (ink[i]) {
      inkTotal++;
      if (guide.distance[i] <= precisionRadius) inside++;
    }
  }

  let coverage = covered / guide.total;
  if (guide.word) {
    // Give detached letter shapes and dots a share of the score even when they are small.
    const meanPart = guide.parts.reduce((total, part) =>
      total + part.filter(i => inkDistance[i] <= coverRadius).length / part.length, 0) / guide.parts.length;
    coverage = coverage * 0.3 + meanPart * 0.7;
  }
  const precision = inkTotal ? inside / inkTotal : 0;
  return {coverage, precision, missed, ...traceGrade(coverage, precision)};
}


/**
 * Turn thick, parallel rows of dots in legacy tracing artwork into one
 * centre-line. Work at assessment resolution so what children see and
 * what we grade are exactly the same shape.
 */
function singleStrokeGuide(canvas) {
  const w = width, h = height;
  const source = maskOf(canvas);
  const expanded = new Uint8Array(size);
  const radius = 3;
  for (let i = 0; i < size; i++) {
    if (!source[i]) continue;
    const x = i % w, y = (i / w) | 0;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy > radius * radius) continue;
        const xx = x + dx, yy = y + dy;
        if (xx >= 0 && xx < w && yy >= 0 && yy < h) expanded[yy * w + xx] = 1;
      }
    }
  }
  const thin = expanded.slice();
  const adjacent = (x, y) => [
    thin[(y - 1) * w + x], thin[(y - 1) * w + x + 1],
    thin[y * w + x + 1], thin[(y + 1) * w + x + 1],
    thin[(y + 1) * w + x], thin[(y + 1) * w + x - 1],
    thin[y * w + x - 1], thin[(y - 1) * w + x - 1],
  ];
  // Zhang-Suen thinning preserves curved strokes and their junctions.
  for (let iteration = 0; iteration < 80; iteration++) {
    let changed = false;
    for (let pass = 0; pass < 2; pass++) {
      const remove = [];
      for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        if (!thin[i]) continue;
        const p = adjacent(x, y);
        const count = p.reduce((n, v) => n + v, 0);
        if (count < 2 || count > 6) continue;
        let transitions = 0;
        for (let k = 0; k < 8; k++) if (!p[k] && p[(k + 1) % 8]) transitions++;
        if (transitions !== 1) continue;
        if (pass === 0 ? p[0] * p[2] * p[4] || p[2] * p[4] * p[6]
          : p[0] * p[2] * p[6] || p[0] * p[4] * p[6]) continue;
        remove.push(i);
      }
      for (const i of remove) thin[i] = 0;
      if (remove.length) changed = true;
    }
    if (!changed) break;
  }
  const skeleton = [];
  for (let i = 0; i < size; i++) if (thin[i]) skeleton.push(i);
  if (skeleton.length < 3) return; // Never erase a guide if source is malformed.
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#777087';
  const taken = new Uint8Array(size);
  // Uniform, non-overlapping dots centred on the single-pixel skeleton.
  for (const i of skeleton) {
    if (taken[i]) continue;
    const x = i % w, y = (i / w) | 0;
    ctx.beginPath();
    ctx.arc((x + 0.5) * 2, (y + 0.5) * 2, 3.5, 0, Math.PI * 2);
    ctx.fill();
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const xx = x + dx, yy = y + dy;
      if (dx * dx + dy * dy <= 16 && xx >= 0 && xx < w && yy >= 0 && yy < h) {
        taken[yy * w + xx] = 1;
      }
    }
  }
}

export function drawGuide(image, canvas, word = false) {
  const original = document.createElement('canvas');
  original.width = image.naturalWidth;
  original.height = image.naturalHeight;
  const context = original.getContext('2d', {willReadFrequently: true});
  context.drawImage(image, 0, 0);
  const source = bounds(alphaMask(context, original.width, original.height), original.width, original.height);
  if (!source) throw new Error('Empty writing guide');

  const scale = Math.min(516 / source.w, 244 / source.h);
  const w = source.w * scale;
  const h = source.h * scale;
  const out = canvas.getContext('2d');
  out.drawImage(image, source.x, source.y, source.w, source.h,
    (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);

  if (!word) singleStrokeGuide(canvas);
  const mask = maskOf(canvas);
  return {mask, word, parts: word ? components(mask) : [], box: bounds(mask, width, height),
    distance: distance(mask), total: mask.reduce((total, value) => total + value, 0)};
}
