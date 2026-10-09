import http from 'node:http';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Avatar from 'boring-avatars';
import { createAvatar } from '@dicebear/core';
import * as notionistsNeutral from '@dicebear/notionists-neutral';

const PORT = Number(process.env.PORT) || 8787;
const HOST = process.env.HOST || '127.0.0.1';

const BORING_VARIANTS = new Set(['beam', 'marble', 'pixel', 'sunset', 'ring', 'bauhaus']);
const DICEBEAR_VARIANTS = new Set(['notionists-neutral']);
const VARIANTS = new Set([...BORING_VARIANTS, ...DICEBEAR_VARIANTS]);
// Brand Color System v0.3
const PALETTE = ['#462C6D', '#B24B38', '#14110F', '#E8E6E1', '#7E7973'];

const SVG_HEADERS = {
  'Content-Type': 'image/svg+xml; charset=utf-8',
  'Cache-Control': 'public, max-age=31536000, immutable',
  'X-Content-Type-Options': 'nosniff',
};

function render(variant, size, username) {
  if (DICEBEAR_VARIANTS.has(variant)) {
    // Style defaults: only seed and size are set.
    return createAvatar(notionistsNeutral, { seed: username, size }).toString();
  }
  const svg = renderToStaticMarkup(
    React.createElement(Avatar, { variant, size, name: username, colors: PALETTE, square: false }),
  );
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

    const body = render(variant, size, username);
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

http.createServer(handle).listen(PORT, HOST, () => {
  console.log(`listening on ${HOST}:${PORT}`);
});
