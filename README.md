# discourse-nautas-avatars

**ENGLISH** | [ESPAÑOL](README.es.md)

Maintained by Criptonautas. Not affiliated with or endorsed by Discourse (Civilized Discourse Construction Kit, Inc.).

Self-hosted avatar generator for Discourse's `external_system_avatars_url`.
Replaces letter avatars without sending usernames to any third party (everything
renders locally, server-side, with no outbound requests).

## What it does

`GET /:variant/:size/:username` returns a deterministic SVG avatar, rendered
server-side (no browser, no canvas, no calls to any third-party avatar API).

- `variant`: `patch`, the Criptonautas mission patch: a symmetric 7×7 pixel glyph on a
  flat field, both derived from the SHA-256 of the username. The retired set names
  (`beam`, `marble`, `pixel`, `sunset`, `ring`, `bauhaus`, `notionists-neutral`) still
  answer, with the patch, so avatars keep working while the Discourse setting moves to
  `/patch/`; they go once it has. Anything else → 400.
- `size`: integer 16–512. Anything else → 400.
- `username`: URL-decoded, max 60 chars, used only as the hash/seed (never logged). Anything else → 400.
- Any other path, or a trailing slash → 404. Non-GET/HEAD → 405.
- Colours from the brand Color System v0.3: the glyph in one of `#462C6D`, `#B24B38`,
  `#1F7A5C`, on paper `#E8E6E1`, lavender `#EFEAF6`, or the accent itself under a paper
  glyph — 9 colourings, evenly spread, so two posters in a thread rarely match.
- Every glyph fills 18–31 of its 49 cells: never a near-empty dot or a near-solid block.
- Flat on purpose: no border or shadow in the image. The forum theme draws the frame
  with CSS, so uploaded photos get the same one (see "Square vs circle").
- No dependencies: Node's own `http` and `crypto`.

## Run locally

```sh
pnpm install
node server.js            # PORT=8787 HOST=127.0.0.1 by default
curl -s http://127.0.0.1:8787/patch/128/satoshi -o avatar.svg
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
bytes; the retired set names answer with the patch; across 2000 usernames every glyph
stays within its density range and the patches are distinct; bad size/variant/username
→ 400; unknown route/trailing slash → 404.

## Discourse settings

Set (Admin → Settings → search "avatar"):

```
external_system_avatars_url = https://avatars.criptonautas.co/patch/{size}/{username}
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

## Design

The patch is this project's own design, under the same MIT licence as the code.

## Square vs circle

Discourse clips avatars to a circle with CSS (`border-radius: 50%` on `.avatar`). The
glyph sits in an 11×11 field so its corners stay inside that circle; the same image works
square if the theme drops the radius.

The border and hard shadow are the theme's, not the image's: one rule for every avatar,
uploaded or generated, and `box-shadow` follows the circle instead of being clipped by it.

## Privacy

The server never logs usernames or request paths — only HTTP status and response time
per request (see `server.js`). It makes no outbound network calls of any kind.

## Reverse proxy

Run it behind your existing reverse proxy on its own hostname (e.g. `avatars.example.com`
→ `127.0.0.1:8787`), with long-lived caching and access logs off — request paths contain
usernames.

## License

MIT. See [LICENSE](LICENSE).

Text of this README under [CC BY-NC-SA 4.0](CC-BY-NC-SA-4.0.txt).
