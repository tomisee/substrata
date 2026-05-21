# substrata

**Interactive systems explainers** — a living portfolio of working models for low-level computing concepts. Each topic is something you can *poke at*, not just read: a real simulation or 3D model, built to demonstrate genuine understanding of the layer beneath the one most people work in.

The project is built around a deliberate constraint: to add a topic, you have to understand the concept well enough to **simulate it correctly**. You can't fake a working model. That makes the repo a portfolio piece and a personal learning loop at the same time.

## Stack

- **Next.js 14** (App Router) — Vercel-native, static where possible
- **react-three-fiber** + **drei** — declarative Three.js for the 3D topics
- **TypeScript** throughout
- No CMS, no MDX build step — topics are a typed registry (see below). Simple, type-safe, trivial to extend.

> Note on MDX: an earlier plan used MDX for topic content. It was dropped because these topics are *interactive components with a little surrounding text*, not prose articles — a typed registry is cleaner for that shape. If you later want to write long-form prose per topic, MDX can be layered back in for the body while keeping the registry for metadata.

## Local development

```bash
npm install
npm run dev      # http://localhost:3000
```

## Deploy to Vercel

1. Push this repo to GitHub.
2. In Vercel, **Add New → Project**, import the repo.
3. Framework preset auto-detects as **Next.js**. No env vars needed.
4. Deploy. Every push to `main` redeploys automatically.

(Or from the CLI: `npm i -g vercel && vercel`.)

## How to add a new topic  ← the important part

This is the whole workflow, start to finish:

**1. Build the interactive component** in `components/`, e.g. `components/TcpHandshake.tsx`. Mark it `"use client"` if it uses hooks/state/Three.js. Keep its styles scoped (the existing components inline a scoped `<style>` block — same pattern works fine).

**2. Register it** in `lib/topics.ts`. Import the component and add one entry to the `TOPICS` array:

```ts
import TcpHandshake from "@/components/TcpHandshake";

{
  slug: "tcp-handshake",
  index: "03",
  title: "The TCP handshake",
  blurb: "Step through SYN / SYN-ACK / ACK …",
  lede: "A three-way handshake …",
  kicker: "networking",
  tag: "interactive · 2D",
  accent: "--cyan",
  status: "live",          // flip from "planned" → "live"
  takeaway: "Why this matters …",
  Component: TcpHandshake,
}
```

**3. There is no step 3.** The index card, the route at `/topics/tcp-handshake`, the metadata, and the static-params build all derive from that single entry. A `"planned"` status renders a greyed-out "coming soon" card with no link; flipping it to `"live"` (with a `Component`) turns it on.

## Project layout

```
app/
  layout.tsx              shared header/footer + globals
  page.tsx                homepage: hero + topic index
  topics/[slug]/page.tsx  renders any live topic from the registry
  globals.css             design tokens + dark-terminal theme
components/
  CacheSim.tsx            topic 01 — direct-mapped cache simulator (2D)
  ChipModel.tsx           topic 02 — IC anatomy (react-three-fiber, 3D)
lib/
  topics.ts               the single source of truth for all topics
```

## Correctness

The cache simulator implements a real direct-mapped cache (address → tag/index/offset, line lookup, hit/miss/evict). Its output matches textbook results — sequential ≈ 75%, strided ≈ 0%, hot-loop ≈ 92% on 8 lines / 16-byte blocks — because the point of the project is that the models are *actually right*.

## Roadmap / homework

- [ ] TCP handshake (registry entry already stubbed as `planned`)
- [ ] Floating-point rounding visualizer
- [ ] The stack frame during a function call
- [ ] Animate the chip layers sliding apart on toggle
- [ ] More accurate die proportions / flip-chip bump layout
