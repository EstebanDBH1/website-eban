# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Personal website for Esteban Blanco (content in Spanish). Static Astro 7 site, no UI framework, no client-side routing. It was migrated from a Claude Design export, which is archived in `_diseno-original/` for visual reference only (not part of the build).

**Content lives in Supabase, not in the repo.** Esteban writes articles and uploads projects from the admin panel at `/admin`; the build pulls them in. See "Content" below.

Deployed on **Netlify** from GitHub (`EstebanDBH1/website-eban`, branch `main`). No `netlify.toml` — Netlify auto-detects Astro (`npm run build` → `dist/`).

## Commands

- `npm run dev`: dev server at http://localhost:4321
- `npm run build`: static build to `dist/`
- `npm run preview`: serve the build
- `npm run check`: type-check `.astro`/TS files (`astro check`)

There are no tests or linter.

`dev`, `build` and `check` all reach out to Supabase to sync content, so they need network and a live project.

## Environment

`.env` (gitignored, template in `.env.example`) holds:

- `PUBLIC_SUPABASE_URL`
- `PUBLIC_SUPABASE_ANON_KEY`

Both must also be set in **Netlify → Site settings → Environment variables**, or the deploy build fails.

The anon key is public by design — it ships in the `/admin` bundle. It protects nothing on its own; **RLS is what guards the data**. Never put the `service_role` key in this repo.

## Content

### Where it lives

Two tables in the Supabase project `eban-db` (ref `gsfnqihfthshajlenrhd`, org `esteban-db`):

- **`public.posts`** — articles. `slug` (the URL, `/articulos/<slug>/`), `title`, `excerpt`, `year`, `reading_time`, `body` (Markdown), `sort_order`, `draft`.
- **`public.projects`** — projects. `slug`, `name`, `year`, `description`, `stack`, `status`, `role`, `href`, `image_url`, `body` (Markdown), `sort_order`, `draft`.

Both carry `id`, `created_at` and `updated_at` (kept fresh by the `set_updated_at` trigger). Rows are **born as drafts** (`draft` defaults to `true`) so nothing half-written goes live. `sort_order` is named that way because `order` is a reserved word in Postgres.

Project screenshots go to the public **`project-images`** Storage bucket (5 MB cap, image MIME types only); `image_url` is the resulting public URL.

### How it reaches the pages

`src/lib/supabase-loader.ts` is a Content Layer loader — the source changed, but everything downstream did not. `getCollection`, `render()`, `<Content />` and `<Image />` behave exactly as they did when the content was Markdown files.

- It renders `body` through Astro's own **`renderMarkdown()`** (from `LoaderContext`), so Markdown is processed with the same config the `.md` files used — including heading anchors.
- It reads with the anon key, so **RLS filters drafts out before they ever reach the build**.
- If Supabase can't be reached it **throws and breaks the build**, rather than quietly publishing an empty site. Free Supabase projects pause after a stretch of inactivity, so this is a real scenario — the error message says to go reactivate it.
- `digest` is `updated_at`, which the trigger bumps on every edit.

`src/content.config.ts` defines the collections (still named `articulos` and `proyectos`) and maps snake_case columns onto the field names the components already used — `reading_time` → `readingTime`, `sort_order` → `order`, `image_url` → `image`. **Keep that mapping** so components never need to know the column names.

Always read collections through `src/lib/content.ts` (`getPosts`, `getProjects`), not `getCollection` directly, so sorting and draft filtering stay consistent.

### Images are remote now

`image` is a Supabase Storage URL, not a local asset. `astro.config.mjs` allowlists the Supabase host under `image.domains` — **without it Astro refuses to optimize remote images**. `ProjectModal.astro` passes `inferSize` (Astro can't know a remote image's dimensions) and `loading="eager"` (inside a closed `<dialog>`, `display: none` means a lazy image doesn't start downloading until you open it — and the curtain animation assumes the photo is already there).

### Publishing is not instant

The site is a static build: a row saved in the panel appears on the web only after a rebuild. **There is no deploy hook yet** — for now a publish means triggering a Netlify build by hand. The intended fix is a Supabase Database Webhook on `posts`/`projects` calling a Netlify build hook.

## Admin panel (`/admin`)

`src/pages/admin.astro` (markup + styles) and `src/scripts/admin.ts` (all the logic). Log in, create/edit/delete articles and projects, upload screenshots, reorder, toggle draft.

Three things about it are deliberate and easy to break:

- **It does not use `BaseLayout`.** It mounts its own `<html>`: no `<ClientRouter />`, no GSAP, no reveals. It is a tool, not a page you read. It also carries `noindex`.
- **Its `<style>` is `is:global`.** Astro scopes CSS by stamping `data-astro-cid-*` on elements in the template, and the panel builds most of its DOM in JavaScript — scoped rules would never match those nodes.
- **`admin.ts` initializes at module top level**, which is the opposite of the rule below. That rule exists because `<ClientRouter />` swaps the DOM on navigation; this page has no router, so there is nothing to re-bind.

The form fields are data, not markup: `RESOURCES` describes each table's fields (`text`, `number`, `textarea`, `checkbox`, `image`) and one renderer builds both forms. Add a column → add a descriptor.

Reordering swaps `sort_order` with the neighbour (two updates) instead of renumbering the list. Deleting a project also deletes its screenshot from the bucket. Postgres errors are translated into plain Spanish by `explain()` before they reach the status bar.

## Security model

Editing rights come from **`public.admin_emails`**, a table with no RLS policies at all — only `service_role` (i.e. the Supabase dashboard) can change it. The `public.is_admin()` function (`security definer`) checks the caller's JWT email against it.

Policies on both content tables:

- `select` for `anon` and `authenticated`: `draft = false or public.is_admin()` — the public sees published rows, the admin also sees drafts in the panel.
- `all` for `authenticated`: gated on `public.is_admin()`.

Storage `project-images`: public read, writes gated on `is_admin()`.

**Do not widen these back to plain `authenticated`.** Supabase allows public signup by default, so `to authenticated` alone would let anyone who registers edit the site. If Esteban needs a second editor, add their email to `admin_emails`.

Verified against the live API: anonymous reads return only published rows, anonymous insert gets `401`, anonymous upload gets `403`, and `is_admin()` returns `false`.

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
- Markdown bodies render through `<Content />`. Style their elements with `:global(p)` under a scoped wrapper class.
- Import from `src` using the `@/` alias (defined in `tsconfig.json`).

## Known gaps

Open items, roughly by weight:

- No deploy hook: publishing from the panel needs a manual Netlify rebuild.
- `src/content/` and `src/assets/proyectos/` still hold the old placeholder Markdown and image. Nothing reads them — they should be deleted.
- `SOCIAL_LINKS` in `src/config/site.ts` are all still `href: '#'`.
- No `src/pages/404.astro`.
- `astro.config.mjs` has no `site`, so there's no canonical URL and no sitemap.
- No Open Graph / Twitter meta in `BaseLayout.astro`.
- `.page` in `BaseLayout.astro` uses `min-height: 100vh`; `100dvh` would avoid the mobile browser-chrome gap.
- `ThemeToggle.astro` has no `aria-pressed` or state in its label.
