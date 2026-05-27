# CLAUDE.md

Context for working on **substrata** with Claude Code. Read this first.

## What this project is

substrata is a **living portfolio of interactive systems explainers** — working models of low-level computing concepts (CPU cache behaviour, chip anatomy, networking, etc.). Each topic is something you *poke at*, not just read: a real simulation or 3D model.

The guiding constraint: to add a topic, you must understand the concept well enough to **simulate it correctly**. The models must be genuinely accurate, not hand-wavy animations — that's the whole point of the project as a skills showcase.

Audience: anyone relevant (recruiters, peers, clients). Tone of the work: precise, close-to-the-metal, no filler.

## Stack

- **Next.js 14** (App Router, `14.2.35` — kept patched for security)
- **react-three-fiber** + **@react-three/drei** for 3D topics
- **TypeScript**, strict mode
- No MDX, no CMS. Topics live in a typed registry (see below). Keep it that way unless there's a real reason to add a content layer.
- Deployed on **Vercel** (auto-detects Next.js, no config/env vars needed).

## Architecture — the one thing to understand

Everything flows from a single source of truth: **`lib/topics.ts`**. It exports a `TOPICS` array; each entry is one explainer with its metadata, accent colour, status (`live` | `planned`), and a `Component`.

```
app/
  layout.tsx              shared header/footer, imports globals.css
  page.tsx                homepage: hero + topic index (maps over TOPICS)
  topics/[slug]/page.tsx  renders any LIVE topic from the registry
  globals.css             design tokens + dark-terminal theme
components/
  CacheSim.tsx            topic 01 — direct-mapped cache simulator (2D, "use client")
  ChipModel.tsx           topic 02 — IC anatomy (react-three-fiber, 3D, "use client")
lib/
  topics.ts               *** single source of truth for all topics ***
```

The dynamic route uses `generateStaticParams()` over the live topics, so each one is statically prerendered at build time. Add a registry entry → you automatically get an index card, a `/topics/<slug>` route, and SSG. There is no separate routing/nav to wire up.

## How to add a topic (the core workflow)

1. Build the interactive component in `components/`, e.g. `components/TcpHandshake.tsx`. Add `"use client"` at the top if it uses hooks/state/Three.js (it will). Scope its styles with an inlined `<style>` block — match the pattern in `CacheSim.tsx`.
2. In `lib/topics.ts`: import the component, add one object to `TOPICS`, set `status: "live"` and `Component`.
3. Done. No step 3.

A `planned` entry (no `Component`) renders a greyed-out, non-clickable "coming soon" card. **`tcp-handshake` is already stubbed as `planned`** — building it out is the intended next task and the best way to exercise this workflow.

## Conventions

- **Aesthetic is fixed: dark terminal.** Deep near-black surfaces, JetBrains Mono for code/labels, Space Grotesk for prose, neon accents (phosphor green primary `--neon`, plus cyan/amber/magenta/violet), CRT scanline + vignette overlay. All colours are CSS variables defined in `app/globals.css` — **use the tokens, never hardcode hex** in components.
- Each topic gets one `accent` token; use it consistently for that topic's highlights.
- Interactive components are client components and keep their CSS self-contained (inlined `<style>` string), so a topic is genuinely drop-in.
- **Correctness is non-negotiable.** If a model computes something (hit rates, sequence numbers, rounding), it must be right. The cache sim was verified against textbook results (sequential ≈75%, strided ≈0%, hot-loop ≈92% at 8 lines / 16B blocks). Hold new topics to the same bar — verify the logic independently before shipping.

## Commands

```bash
npm install        # first time
npm run dev        # local dev → http://localhost:3000
npm run build      # production build — MUST pass before committing/deploying
npm run lint       # next lint
```

`npm run build` is the real gate. Success looks like `✓ Compiled successfully` and a route table listing every live topic under `/topics/[slug]`.

## Known notes / gotchas

- Three.js is heavy; the topic routes are ~320 kB first-load JS. Fine for now; if it grows, consider lazy-loading 3D components with `next/dynamic` (`ssr: false`).
- Two **dev-only** transitive npm advisories remain (postcss/esbuild chain); the only "fix" is a major bump to Next 16 (breaking). Deferred deliberately — don't `npm audit fix --force` without discussing.
- The header's "source" link is a placeholder `https://github.com` — swap for the real repo URL.
- `next-env.d.ts` is gitignored per Next convention; it regenerates on build.