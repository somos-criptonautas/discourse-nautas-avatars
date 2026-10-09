# discourse-nautas-avatars

Maintained by [Criptonautas](https://criptonautas.co). Not affiliated with or endorsed by
Discourse (Civilized Discourse Construction Kit, Inc.); it only plugs into Discourse's
`external_system_avatars_url` setting.

Self-hosted avatar generator for Discourse's `external_system_avatars_url`.
Replaces letter avatars without sending usernames to any third party (everything
renders locally, server-side, with no outbound requests).

## What it does

`GET /:variant/:size/:username` returns a deterministic SVG avatar, rendered
server-side (no browser, no canvas, no calls to any third-party avatar API).

- `variant`: one of `beam`, `marble`, `pixel`, `sunset`, `ring`, `bauhaus` (all
  [boring-avatars](https://www.npmjs.com/package/boring-avatars), via
  `react-dom/server`'s `renderToStaticMarkup`), or `notionists-neutral` (via
  [`@dicebear/core`](https://www.npmjs.com/package/@dicebear/core) +
  [`@dicebear/notionists-neutral`](https://www.npmjs.com/package/@dicebear/notionists-neutral),
  default style options — only `seed` (= username) and `size` are passed). Anything
  else → 400.
- `size`: integer 16–512. Anything else → 400.
- `username`: URL-decoded, max 60 chars, used only as the hash/seed (never logged). Anything else → 400.
- Any other path, or a trailing slash → 404. Non-GET/HEAD → 405.
- Boring Avatars palette is fixed to the brand Color System v0.3: `#462C6D`, `#B24B38`,
  `#14110F`, `#E8E6E1`, `#7E7973`. `notionists-neutral` uses its own default palette
  (not overridden).
- `square: false` for boring-avatars — see "square vs circle" below.

## Run locally

```sh
pnpm install
node server.js            # PORT=8787 HOST=127.0.0.1 by default
curl -s http://127.0.0.1:8787/beam/128/satoshi -o avatar.svg
```

## Run in Docker

```sh
docker build -t discourse-nautas-avatars .
docker run --rm -p 127.0.0.1:8787:8787 discourse-nautas-avatars
```

The container binds `0.0.0.0:8787` internally (set via `ENV HOST` in the Dockerfile);
exposure to the host is controlled by the `-p` publish flag, same as any other
containerized service.

## Self-check

```sh
node --test
```

Covers: valid request → image with correct `Content-Type`; same username → identical
bytes (determinism, both for `beam` and for `notionists-neutral`); bad
size/variant/username → 400; unknown route/trailing slash → 404.

## Discourse settings

Set (Admin → Settings → search "avatar"):

```
external_system_avatars_url = https://avatars.criptonautas.co/beam/{size}/{username}
```

Discourse substitutes `{size}` and `{username}` (and `{color}`/`{first_letter}`, unused
here) in `User.system_avatar_template` — see
`app/models/user.rb` around line 1258-1270. The setting's validation regex
(`^((https?:)?\/)?\/.+[^\/]`) just requires it not end in a trailing slash, which this
URL satisfies.

**Turn off `automatically_download_gravatars`.** Gravatar lookups send the user's
*email address* (hashed, but still identifying) to Gravatar's servers — a third party —
which defeats the whole point of self-hosting avatars for a privacy-focused forum. With
it off, Discourse never attempts the Gravatar network call and falls back to
`external_system_avatars_url` for users without an uploaded avatar.

After testing, restore the original value:

```
external_system_avatars_url = /letter_avatar_proxy/v4/letter/{first_letter}/{color}/{size}.png
```

## SVG vs PNG — decision and evidence

**Decision: SVG.** No rasterizer, no extra dependency.

Evidence, `app/controllers/user_avatars_controller.rb`:

- `show_proxy_letter` (~line 36-50) is the *only* action that proxies/downloads an
  avatar URL server-side, and it only runs when
  `SiteSetting.external_system_avatars_url !~ %r{\A/letter_avatar_proxy}` is false —
  i.e. only for Discourse's own CDN letter-avatar path
  (`avatars.discourse-cdn.com/.../letter/...`). Our URL doesn't match that prefix, so
  this code path never touches it.
- For every other `external_system_avatars_url`, `User.system_avatar_template`
  (`app/models/user.rb` ~line 1258-1270) does plain string substitution
  (`url.gsub! "{username}", ...`) and returns the resulting URL as-is. Discourse never
  fetches, decodes, resizes, or re-encodes those bytes anywhere in the request path —
  the URL is embedded directly into `avatar_template` and sent to whatever consumes it
  (web UI `<img src>`, the JSON API, `avatar_template_url` for emails). The client
  fetches the image directly from our server; Discourse's Ruby process never sees the
  pixels.
- Push notifications use a static per-site icon
  (`app/services/push_notification_pusher.rb` ~line 19-20,
  `SiteSetting.site_push_notifications_icon_url`), not the user's avatar — so there's no
  PNG requirement from that path either.
- No code path was found where Discourse uses a user's `avatar_template` as an
  `og:image`/`twitter:image` (those use post/topic uploads instead,
  `app/helpers/application_helper.rb` ~line 357-568) — so no OpenGraph raster
  requirement applies to per-user avatars.

Since Discourse itself never rasterizes or validates the format, and the consumers are
modern browsers and the Discourse JSON API (both render SVG `<img>` fine), SVG is
sufficient. Risk accepted: very old email clients that don't render inline SVG
(e.g. legacy desktop Outlook) will just show a broken/missing image for the avatar in
digest emails — graceful degradation, not a functional break. Add `@resvg/resvg-js` and
rasterize to PNG later if that's measured to matter.

## `notionists-neutral` licence

Checked `node_modules/@dicebear/notionists-neutral`'s own source header and bundled
README (DiceBear ships the licence info inline, not as a separate `LICENSE` file in
this package):

- **Code**: MIT (`@dicebear/core` and `@dicebear/notionists-neutral` packages, copyright
  Florian Körner).
- **Design/artwork**: "Notionists" by Zoish (<https://heyzoish.gumroad.com/l/notionists>),
  licensed **CC0 1.0** (public domain dedication,
  <https://creativecommons.org/publicdomain/zero/1.0/>). The DiceBear style is a remix
  of the original. CC0 means no attribution is legally required, but DiceBear credits
  the original artist anyway (see <https://www.dicebear.com/licenses> for the full
  overview) — this project does the same, here.

Both licences permit this use (self-hosted, no code redistribution beyond the npm
dependency itself) with no restriction.

## Square vs circle

Discourse already clips avatars to a circle with CSS (`border-radius: 50%` on
`.avatar`), so a square source image works fine — this is why `square: false` was kept
rather than forced to `true`.

## Privacy

The server never logs usernames or request paths — only HTTP status and response time
per request (see `server.js`). It makes no outbound network calls of any kind.

## Reverse proxy

Run it behind your existing reverse proxy on its own hostname (e.g. `avatars.example.com`
→ `127.0.0.1:8787`), with long-lived caching and access logs off — request paths contain
usernames.

## Licence

MIT, see `LICENSE`. Avatar styles keep their own licences (above).
