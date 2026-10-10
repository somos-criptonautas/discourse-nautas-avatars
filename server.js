import http from 'node:http';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const PORT = Number(process.env.PORT) || 8787;
const HOST = process.env.HOST || '127.0.0.1';

// shortcut: the retired set names render the patch too, so avatars keep working while
// external_system_avatars_url moves to /patch/; drop them once it has.
const VARIANTS = new Set(['patch', 'beam', 'marble', 'pixel', 'sunset', 'ring', 'bauhaus', 'notionists-neutral']);

// Brand Color System v0.3: the accents for the glyph, the light surfaces behind it.
const INKS = ['#462C6D', '#B24B38', '#1F7A5C'];
const PAPERS = ['#E8E6E1', '#EFEAF6'];
// The 7x7 glyph sits in a 12x12 field: its corners keep clear of the circle Discourse crops
// avatars to and of the theme's border (half-diagonal 4.95 against radius 6: about 4px at 48px).
const GRID = 7;
const FIELD = 12;
const OFFSET = (FIELD - GRID) / 2;
// Of the 49 cells, so no patch is a near-empty dot or a near-solid block.
export const MIN_CELLS = 18;
export const MAX_CELLS = 31;

const SVG_HEADERS = {
  'Content-Type': 'image/svg+xml; charset=utf-8',
  'Cache-Control': 'public, max-age=31536000, immutable',
  'X-Content-Type-Options': 'nosniff',
};

// Left half plus the middle column (4 x 7 = 28 bits), mirrored, so every glyph is symmetric.
function cells(bits) {
  const out = [];
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < 4; x++) {
      if ((bits >>> (y * 4 + x)) & 1) {
        out.push([x, y]);
        if (x < 3) out.push([GRID - 1 - x, y]);
      }
    }
  }
  return out;
}

// Flat on purpose: the border and hard shadow come from the forum theme's CSS, which
// gives uploaded photos the same frame.
export function patch(username) {
  const h = createHash('sha256').update(username).digest();
  const word = (i) => h.readUInt32BE(i * 4) & 0x0fffffff;

  // The first of the hash's seven words whose density is in range (about 9 in 10 are), else
  // the one nearest the middle: still deterministic, and never a dot or a block.
  const words = [0, 1, 2, 3, 4, 5, 6].map(word);
  const count = (w) => cells(w).length;
  const bits =
    words.find((w) => count(w) >= MIN_CELLS && count(w) <= MAX_CELLS) ??
    words.reduce((a, b) => (Math.abs(count(b) - 24.5) < Math.abs(count(a) - 24.5) ? b : a));

  const ink = INKS[h[28] % INKS.length];
  // Three grounds per accent - paper, lavender, or the accent itself under a paper glyph -
  // so 9 colourings plus the glyph tell two posters in a thread apart.
  const ground = h[29] % 3;
  const bg = ground === 2 ? ink : PAPERS[ground];
  const fg = ground === 2 ? PAPERS[0] : ink;

  // Centre what is drawn, not the grid: a glyph with an empty top or bottom row otherwise
  // sits visibly off-centre. Mirroring already centres it across. The shift can be half a
  // cell, so the field is drawn at twice the grid's resolution to keep every edge whole.
  const glyph = cells(bits);
  const ys = glyph.map(([, y]) => y);
  const dy = (GRID - (Math.max(...ys) - Math.min(...ys) + 1)) / 2 - Math.min(...ys);
  const d = glyph.map(([x, y]) => `M${(x + OFFSET) * 2} ${(y + OFFSET + dy) * 2}h2v2h-2z`).join('');
  const side = FIELD * 2;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${side} ${side}" shape-rendering="crispEdges">` +
    `<rect width="${side}" height="${side}" fill="${bg}"/><path fill="${fg}" d="${d}"/></svg>`
  );
}

function render(size, username) {
  const svg = patch(username).replace('<svg ', `<svg width="${size}" height="${size}" `);
  return `<?xml version="1.0" encoding="UTF-8"?>\n${svg}`;
}

// One route, so the path is parsed by hand instead of pulling in a router.
function handle(req, res) {
  const start = process.hrtime.bigint();
  let status = 404;
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      status = 405;
      res.writeHead(405, { Allow: 'GET, HEAD' }).end();
      return;
    }

    const url = new URL(req.url, 'http://internal');
    if (url.pathname.endsWith('/')) {
      res.writeHead(404).end();
      return;
    }
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length !== 3) {
      res.writeHead(404).end();
      return;
    }

    const [variant, sizeRaw, usernameRaw] = parts;
    if (!VARIANTS.has(variant)) {
      status = 400;
      res.writeHead(400).end('bad variant');
      return;
    }

    const size = Number(sizeRaw);
    if (!Number.isInteger(size) || size < 16 || size > 512) {
      status = 400;
      res.writeHead(400).end('bad size');
      return;
    }

    let username;
    try {
      username = decodeURIComponent(usernameRaw);
    } catch {
      status = 400;
      res.writeHead(400).end('bad username');
      return;
    }
    if (username.length === 0 || username.length > 60) {
      status = 400;
      res.writeHead(400).end('bad username');
      return;
    }

    const body = render(size, username);
    status = 200;
    res.writeHead(200, SVG_HEADERS);
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch {
    status = 500;
    res.writeHead(500).end();
  } finally {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    // Privacy: never log username/path, only status + timing.
    console.log(`${status} ${ms.toFixed(1)}ms`);
  }
}

// Started as a program; imported (by the tests) it only exports the generator.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  http.createServer(handle).listen(PORT, HOST, () => {
    console.log(`listening on ${HOST}:${PORT}`);
  });
}
