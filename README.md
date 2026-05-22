# substrata

**Interactive systems explainers**
A showapedia of computer science (and cybersecurity) topics that are best shown with a diagram or simulation. These give users an opportunity to see *how* different variables can affect performance or operation. For example, how the different cache block sizes affect hit/miss rates.

This project is built around one fundamental idea - **to add a topic and simulation, I need to understand it**. To understand it, I need to research it thoroughly. This leads to an effective development feedback loop which will only improve my own personal ability.

## Local development

```bash
npm install
npm run dev      # http://localhost:3000
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

## Roadmap / homework

- [x] TCP handshake (registry entry already stubbed as `planned`)
- [x] Replace chip with the M1 silicon chip
- [x] Improve functionality of the 3D chip model, including UI
- [x] Introduce an initial side-channel attack (possibly GoFetch)
- [ ] Improve user experience and styling
- [ ] Add a flow of data simulation to accompany the side-channel attack simulation to aid understanding
- [ ] Add some other cyber/computer science topics - encryption, ARP poisoning, ping flood etc 
