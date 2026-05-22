# substrata

**Interactive systems explainers**
A showapedia of computer science (and cybersecurity) topics that are best shown with a diagram or simulation. These give users an opportunity to see *how* different variables can affect performance or operation. For example, how the different cache block sizes affect hit/miss rates.

This project is built around one fundamental idea - **to add a topic and simulation, I need to understand it**. To understand it, I need to research it thoroughly. This leads to an effective development feedback loop which will only improve my own personal ability.

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
4. Deploy. Every push to `main` will be a public facing deployment
     i. If pushing to an alternative branch - ie `testing`, this will start a pre-prod deployment instance for testing purposes.

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

- [x] TCP handshake (registry entry already stubbed as `planned`)
- [x] Replace chip with the M1 silicon chip
- [x] Improve functionality of the 3D chip model, including UI
- [x] Introduce an initial side-channel attack (possibly GoFetch)
- [ ] Improve user experience and styling
- [ ] Add a flow of data simulation to accompany the side-channel attack simulation to aid understanding
- [ ] Add some other cyber/computer science topics - encryption, ARP poisoning, ping flood etc 
