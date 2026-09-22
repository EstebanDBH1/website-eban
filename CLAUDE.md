# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Personal website for Esteban Blanco (content in Spanish). Astro 7, no UI framework, no client-side routing. It was migrated from a Claude Design export, which is archived in `_diseno-original/` for visual reference only (not part of the build).

**Content lives in Supabase and is read on every request.** Esteban writes articles and uploads projects from the admin panel at `/admin`; what he saves shows up on the site as soon as the page is reloaded — no rebuild, no deploy.

Deployed on **Netlify** from GitHub (`EstebanDBH1/website-eban`, branch `main`). No `netlify.toml` — Netlify auto-detects Astro.

## Commands

- `npm run dev`: dev server at http://localhost:4321
- `npm run build`: build to `dist/` plus the Netlify SSR function
- `npm run preview`: serve the build
- `npm run check`: type-check `.astro`/TS files (`astro check`)

All of them need `.env` and a reachable Supabase project.

## Rendering model

`output: 'static'` **with the Netlify adapter**, so pages are static by default and opt into on-demand rendering one by one:

| Route | Mode | Why |
|---|---|---|
| `/` | `prerender = false` | reads posts and projects live |
| `/posts/[slug]` | `prerender = false` | reads the post live; no `getStaticPaths` |
| `/404` | `prerender = false` | so it can return a real 404 status, not a 200 |
| `/og/[slug].png` | `prerender = false` | renders the share card for that post |
| `/sitemap.xml` | `prerender = false` | lists posts straight from the database |
| `/admin` | `prerender = true` | pure client-side; all its work happens in the browser |

The trade this buys and costs: publishing is instant, but **the site now depends on Supabase being up**. `src/lib/content.ts` throws when a query fails, on purpose — an error page is better than a blank homepage that looks like nothing was ever written.

## Environment

`.env` (gitignored, template in `.env.example`):

- `PUBLIC_SUPABASE_URL`
- `PUBLIC_SUPABASE_ANON_KEY`

Both must also be set in **Netlify → Site configuration → Environment variables**, with the **Builds** scope enabled. Without them the build dies in `astro sync`, before generating anything, because `src/live.config.ts` imports the client.

The anon key is public by design — it ships in the `/admin` bundle. **RLS is what guards the data**, not the key. Never put the `service_role` key in this repo.

If a deploy ever fails with *"Secrets scanning found secrets in build output"*, that is Netlify finding the anon key in the JS where it is supposed to be; add `SECRETS_SCAN_OMIT_KEYS=PUBLIC_SUPABASE_URL,PUBLIC_SUPABASE_ANON_KEY`.

## Content

### Where it lives

Two tables in the Supabase project `eban-db` (ref `gsfnqihfthshajlenrhd`, org `esteban-db`):

- **`public.posts`** — `slug` (the URL, `/posts/<slug>/`), `title`, `excerpt`, `year`, `image_url`, `body` (Markdown), `sort_order`, `draft`.
- **`public.projects`** — `slug`, `name`, `year`, `description`, `stack`, `status`, `role`, `href`, `image_url`, `body` (Markdown), `sort_order`, `draft`.

Both carry `id`, `created_at` and `updated_at` (kept fresh by the `set_updated_at` trigger).

`draft` defaults to **`false`**: writing is publishing, and a draft is something you mark on purpose. It started out the other way around and that was wrong for a one-author site — new posts kept silently not appearing.

`sort_order` is named that way because `order` is a reserved word in Postgres.

**There is no `reading_time` column.** It is derived from the body by `src/lib/reading-time.ts` (200 wpm, ignoring code blocks, image syntax and link URLs, minimum 1 min), so it can never drift from the text.

Both tables have an `image_url`: on `projects` it is the screenshot in the modal, on `posts` the cover shown under the title (distinct from images pasted inside the body, which live in the Markdown). Those files go to the public **`project-images`** Storage bucket (5 MB cap, image MIME types only); `image_url` holds the public URL.

### How it reaches the pages

The collections are named `posts` and `proyectos`. `src/live.config.ts` defines them as **live collections** (`defineLiveCollection`). They are queried per request, not at build time. Pages never call them directly — everything goes through `src/lib/content.ts` (`getPosts`, `getProjects`, `getPost`) so ordering and error handling stay in one place.

Two things worth knowing before editing that file:

- **Markdown is rendered with `marked`, not Astro's pipeline.** A live loader gets no `renderMarkdown()`. A small `marked` renderer override adds `id` attributes to headings so the anchors Astro used to generate are preserved.
- **`getLiveEntry` reports "not found" as an error**, not as an empty entry, and `astro:content` does not export the error class. `getPost` therefore checks `error.name === 'LiveEntryNotFoundError'` and returns `null`; anything else is re-thrown.

Drafts never need filtering in code: the anon key plus RLS only ever returns `draft = false`.

### Images

`image` is a Supabase Storage URL. `ProjectModal.astro` uses a plain `<img>`, **not `<Image>` from `astro:assets`** — with per-request rendering, a remote image with `inferSize` would be downloaded on every visit just to measure it. The `.frame` wrapper fixes the 16/9 ratio so nothing shifts. To get optimization back, store width and height in the table at upload time and pass them explicitly.

`loading="eager"` is deliberate: inside a closed `<dialog>` (`display: none`) a lazy image does not start downloading until you open it, and the curtain animation assumes the photo is already there.

## Sharing and SEO

`BaseLayout.astro` emits canonical, Open Graph and Twitter tags on every page; post pages also carry `BlogPosting` JSON-LD. URLs are built from `Astro.url.origin`, not from a constant, so previews and local dev produce correct absolute URLs too.

**Share cards are generated on the fly** by `src/lib/og.ts` (satori → SVG, resvg-wasm → PNG), so a post has a proper card even with no cover image. If it does have one, `image_url` is used instead and the generator is never called.

Two decisions in there that are load-bearing:

- **The font is a static WOFF, not the variable TTF.** Satori cannot parse variable fonts — it throws `Cannot read properties of undefined`. `public/fonts/newsreader-600.woff` is a single-weight instance (30 KB, from Fontsource).
- **The font and `public/resvg.wasm` are fetched over HTTP from the site's own origin**, not imported, so nothing depends on how the adapter bundles binary files. Both are cached in module scope, so they only cost on a cold start. `initWasm` accepts one call per process, which is why its promise is cached too.

The sitemap is generated per request rather than with `@astrojs/sitemap`: that integration walks build-time routes, and posts do not exist until someone asks for them.

## Admin panel (`/admin`)

`src/pages/admin.astro` (markup + styles), `src/scripts/admin.ts` (logic), `src/scripts/editor.ts` (rich text). Log in, create/edit/delete articles and projects, upload screenshots, reorder, publish or keep as draft.

Things that are deliberate and easy to break:

- **It does not use `BaseLayout`.** It mounts its own `<html>`: no `<ClientRouter />`, no GSAP, no reveals. It also carries `noindex`.
- **Its `<style>` is `is:global`.** Astro scopes CSS by stamping `data-astro-cid-*` on template elements, and the panel builds most of its DOM in JavaScript — scoped rules would never match those nodes.
- **`admin.ts` initializes at module top level**, the opposite of the rule below. That rule exists because `<ClientRouter />` swaps the DOM on navigation; this page has no router.
- **There is no sign-up.** One owner, whose user is created from the Supabase dashboard. Public sign-up should also be off in Supabase Auth — hiding the button does not close the endpoint.

Form fields are data, not markup: `RESOURCES` describes each table's fields (`text`, `number`, `textarea`, `checkbox`, `image`, `richtext`, `publish`) and one renderer builds both forms. The `publish` type is the Publicado/Borrador selector and sits first, because it is the decision people forget.

Reordering swaps `sort_order` with the neighbour (two updates) rather than renumbering. Deleting a project also deletes its screenshot. Postgres errors are translated into plain Spanish by `explain()`.

### Rich text editor

TipTap with the official `@tiptap/markdown` extension. You edit WYSIWYG but **Markdown is what gets stored**, which is what keeps the rest of the pipeline unchanged.

- **The toolbar is built before the `Editor` is constructed, and `editor` is a `let` initialized to `null`.** Opening an existing entry runs `setContent()`, which fires `onUpdate` → `paint()`; if what `paint()` reads does not exist yet, the `ReferenceError` is swallowed inside TipTap and the dialog silently never opens. This exact bug shipped once — creating worked, editing did nothing.
- Images are inserted immediately with a local `blob:` URL and uploaded in the background; the `src` is swapped when the upload lands, and the node is removed if it fails. Same idea in the project screenshot dropzone.
- The toolbar offers H2 and H3, not H1: the article title is already the page's `<h1>`.
- Images inside an article body are plain `<img>` — they do not go through `astro:assets`. Upload them already sized and in webp.

## Security model

Editing rights come from **`public.admin_emails`**, a table with no RLS policies at all — only `service_role` (the Supabase dashboard) can change it. `public.is_admin()` (`security definer`) checks the caller's JWT email against it.

Policies on both content tables:

- `select` for `anon` and `authenticated`: `draft = false or public.is_admin()`.
- `all` for `authenticated`: gated on `public.is_admin()`.

Storage `project-images`: public read, writes gated on `is_admin()`.

**Do not widen these back to plain `authenticated`.** Supabase allows public sign-up by default, so `to authenticated` alone would let anyone who registers edit the site. To add an editor, add their email to `admin_emails`.

Verified against the live API: anonymous reads return only published rows, anonymous insert gets `401`, anonymous upload gets `403`, `is_admin()` returns `false`.

## Architecture

- **Site-wide settings** are in `src/config/site.ts`: name, footer text, social links, `defaultTheme`, `accent`, `showYears`.
- **Theming** uses CSS custom properties in `src/styles/global.css`, keyed on `html[data-theme]`.
  - `BaseLayout.astro` sets the default theme and `--accent`, and an inline head script applies the saved `localStorage['eb-theme']` value before first paint.
  - `ThemeToggle.astro` flips the theme and saves it. It also sets `data-theme-switching` on `<html>` for ~320 ms, which is what enables the color transitions in `global.css`: they're scoped to the switch so the page doesn't carry that cost the rest of the time, and so every element changes at the same speed (a transition on `body` alone reads as a flicker). `transform` is deliberately excluded there — it would fight GSAP.
  - Use the tokens (`--bg`, `--ink`, `--muted`, `--rule`, `--danger`, …) rather than hard-coded colors.
  - `global.css` re-declares `[hidden] { display: none !important }`. Its own `img { display: block }` is an author rule and beats the browser's `[hidden]`, so without this a hidden `<img>` would still show.
- **Page transitions** combine Astro's `<ClientRouter />` with GSAP (`src/scripts/page-transitions.ts`). The router's own animations are turned off with `transition:animate="none"` on `<html>`; GSAP handles all the motion.
  - **Leaving a page:** the exit animation runs in parallel with the fetch, by wrapping `event.loader` in `astro:before-preparation`.
  - **Swapping:** the incoming document gets `data-page-enter`, which hides its blocks via CSS, and keeps the current theme.
  - **Entering a page:** on `astro:page-load`, GSAP staggers in every `[data-reveal]` element.

  Mark top-level page blocks with `data-reveal` to include them in the animation.
- **Text reveal** (`src/scripts/text-reveal.ts`) is shared by the home page and the project modal. `createTextReveal(root?)` splits `[data-split]` elements (and the children of `[data-split-group]`, for Markdown we can't annotate) into masked lines and returns a controller: `reveal()`, `showNow()`, `hideAll()`, `destroy()`. Text inside a `<dialog>` is only split when that dialog is the root — a closed dialog has no line metrics.
  - **Modal:** `ProjectList.astro` splits on first open, with the dialog already open and its text hidden by `.is-preparing`, then replays the reveal on every open via `hideAll()`.
- **Project modal motion** lives in `ProjectList.astro`'s script, not in CSS (only the `::backdrop` fade stays in CSS, since a pseudo-element can't be animated by GSAP). Opening builds one timeline: the card, the curtain over the image (a `<span>` that scales down from `transform-origin: bottom`, uncovering top to bottom), a slow counter-zoom on the photo, and then the text cascade. Reduced motion skips all of it.
  - **Curtain easing:** a `CustomEase` (`0.33, 0, 0.12, 1`), not a built-in. The `expo`/`power` `inOut` eases spike in velocity mid-way, which reads as an abrupt snap on a large moving edge; this curve starts gently and decelerates over a long tail. Keep the photo's zoom longer than the curtain so the image is still drifting once uncovered.
- **Scroll lock:** while a modal is open, `html[data-modal-open]` in `global.css` freezes the page and pads it by `--scrollbar-gap` (measured in JS) so nothing shifts sideways. `overscroll-behavior: contain` on the dialog keeps the scroll from chaining to the page.
- **Home text reveal:** pages containing `[data-split]` elements (currently only the home page) use `setupHomeTextReveal()` instead of the block reveal. This happens on every entry, whether the page is opened directly or reached by client navigation.
  - **Split:** it waits for fonts, capped at 300 ms (`autoSplit` re-splits if they land later), then splits into masked lines in two phases — what's on screen first, so the first paint isn't blocked, and the rest on the next frame. Not-yet-split elements are hidden by `[data-text-pending]`.
  - **Reveal:** `ScrollTrigger.batch` queues elements as they cross `top 92%`. Whatever is on screen at load is queued at once in document order; the rest is queued while scrolling. `data-split="hero"` elements (name, intro) animate slower.
  - **Queue:** reveals are serialized through a promise chain, so fast scrolling can never make a lower element animate before (or on top of) the one above it. Each element hands off when its last line starts, capped at `MAX_HANDOFF`.
  - **No revert:** splits are **never reverted**. The browser's own line breaking (e.g. `text-wrap: pretty`) can differ from SplitText's, so restoring the original HTML makes words jump lines. Once an element is revealed, its masks switch from `overflow: clip` to `visible`, which doesn't affect layout, and `autoSplit` stays active so resizes re-split correctly.
  - **Cleanup:** `setupTextReveal()` returns a cleanup function that `page-transitions.ts` calls when leaving the page, which kills the triggers and splits.

  Put `data-split` on leaf text elements (headings, paragraphs, links), never on flex/grid containers, because the line wrappers would become layout items.
- **Client scripts must initialize inside `document.addEventListener('astro:page-load', …)`**, not at module top level. With the ClientRouter the DOM is swapped on navigation, but bundled scripts only execute once. (`/admin` is the exception — see above.)
- **Shared keyframes** (`card-in/out`, `veil-in/out`) are global in `global.css`. Astro scopes component styles but not keyframe names, so keep them there.
- **Components** are grouped by role: `components/layout` (page chrome), `components/home` (home sections), `components/ui` (generic pieces). The project modal's open/close logic (animated close on Esc, backdrop click and the ✕ button) is the `<script>` in `ProjectList.astro`.
- Markdown bodies arrive as HTML strings and are injected with `set:html`. Style them with `:global(...)` under a scoped wrapper class.
- Import from `src` using the `@/` alias (defined in `tsconfig.json`).

## Known gaps

- `src/content/` and `src/assets/proyectos/` still hold the original placeholder Markdown and image. Nothing reads them — there is no `content.config.ts` any more. They should be deleted.
- `SOCIAL_LINKS` in `src/config/site.ts` are all still `href: '#'`.
- `.page` in `BaseLayout.astro` uses `min-height: 100vh`; `100dvh` would avoid the mobile browser-chrome gap.
- `ThemeToggle.astro` has no `aria-pressed` or state in its label.
- Project screenshots lost `astro:assets` optimization (see Images above).
