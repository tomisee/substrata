import type { ComponentType } from "react";

/**
 * A Topic is one interactive explainer.
 *
 * Adding a new topic = three steps:
 *   1. build the interactive component in /components (e.g. TcpHandshake.tsx)
 *   2. add an entry to the TOPICS array below
 *   3. that's it — the index card, the route /topics/<slug>, and the
 *      "planned" → "live" status all flow from this single source of truth.
 */
export type TopicStatus = "live" | "planned";

export interface Topic {
  slug: string;
  index: string;          // "01", "02" — display order marker
  title: string;
  blurb: string;          // short description for the index card
  lede: string;           // one-sentence intro on the topic page
  kicker: string;         // small overline label, e.g. "memory hierarchy"
  tag: string;            // "interactive · 2D" etc.
  accent: string;         // CSS var name for this topic's neon accent
  status: TopicStatus;
  takeaway: string;       // the "why this matters" callout
  /** The interactive component. Loaded lazily on the topic page. */
  Component?: ComponentType;
}

import CacheSim from "@/components/CacheSim";
import ChipModel from "@/components/ChipModel";
import TcpHandshake from "@/components/TcpHandshake";
import GoFetch from "@/components/GoFetch";

export const TOPICS: Topic[] = [
  {
    slug: "cpu-cache",
    index: "01",
    title: "How a CPU cache works",
    blurb:
      "Watch memory addresses map to cache lines in real time. See why stride and locality decide whether your loop flies or crawls.",
    lede:
      "A direct-mapped cache. Every address splits into a tag, an index (which line it may live in), and an offset. Change the access pattern and watch the hit rate move.",
    kicker: "memory hierarchy",
    tag: "interactive · 2D",
    accent: "--neon",
    status: "live",
    takeaway:
      "A sequential walk reuses each fetched block, so most accesses hit. A stride larger than the block size touches a new block every time — every access misses, and the cache buys you nothing. This is the difference between iterating an array row-major vs column-major: often a 10× swing for identical-looking code.",
    Component: CacheSim,
  },
  {
    slug: "chip-anatomy",
    index: "02",
    title: "Anatomy of a chip",
    blurb:
      "A rotatable IC package. Peel back the lid, the die, and the functional blocks to see what's actually inside the black rectangle.",
    lede:
      "The black rectangle on a board is mostly packaging. The part that computes is a sliver of silicon in the middle. Drag to rotate; toggle layers to peel it apart.",
    kicker: "silicon",
    tag: "interactive · 3D",
    accent: "--violet",
    status: "live",
    takeaway:
      "When people say 'the chip,' they usually mean the package — but the die inside is often smaller than a fingernail, and its functional blocks (cores, cache, memory controller, I/O) are laid out like districts in a city. Cache takes up a huge fraction of die area on a modern CPU — which loops right back to topic 01.",
    Component: ChipModel,
  },
  {
    slug: "tcp-handshake",
    index: "03",
    title: "The TCP handshake",
    blurb:
      "Step through SYN / SYN-ACK / ACK and watch sequence numbers and connection state transition on both ends.",
    lede:
      "Two hosts, three packets, one agreed state. Drag a client and server onto the canvas, then step through the handshake and watch sequence numbers and TCP state evolve on both sides.",
    kicker: "networking",
    tag: "interactive · 2D",
    accent: "--cyan",
    status: "live",
    takeaway:
      "The handshake establishes shared state before a single byte of data flows: both sides exchange and acknowledge initial sequence numbers (ISNs), proving the channel is bidirectional. ISNs are randomised to prevent collisions with stale packets from old connections — after the handshake, each side tracks the other's position in the byte stream using these numbers.",
    Component: TcpHandshake,
  },
  {
    slug: "gofetch-attack",
    index: "04",
    title: "The GoFetch attack",
    blurb:
      "Watch a DMP side-channel strip key bits from a victim process one probe at a time. Prime the cache, craft the input, time the access — the hardware does the rest.",
    lede:
      "Apple M-series chips have a Data Memory-dependent Prefetcher that watches data values, not just access patterns. Feed it the right inputs and it leaks your secrets into shared cache lines — no kernel code, no speculative execution needed.",
    kicker: "hardware security",
    tag: "interactive · 2D",
    accent: "--magenta",
    status: "live",
    takeaway:
      "GoFetch shows why 'constant-time' code is no longer a sufficient defence: even if your code takes the same execution path regardless of secret values, the hardware may still broadcast those values through the cache. The DMP observes data values, not just addresses — if an intermediate result looks like a pointer, the prefetcher fetches it. Mitigations require either CPU-level changes (disabled DMP via special register, only available to certain processes) or algorithmic blinding so that intermediate values never fall into the pointer range.",
    Component: GoFetch,
  },
  {
    slug: "stack-frame",
    index: "05",
    title: "The stack frame",
    blurb:
      "Watch the call stack grow and shrink. See how the CPU tracks return addresses, local variables, and saved registers across function calls.",
    lede:
      "Every function call allocates a frame on the stack. Step through a call sequence and watch the stack pointer, base pointer, and saved registers move in real time.",
    kicker: "execution model",
    tag: "interactive · 2D",
    accent: "--amber",
    status: "planned",
    takeaway:
      "The stack is the data structure that makes recursive functions possible — and the one that makes buffer overflows dangerous. Understanding the frame layout is the prerequisite for reading crash dumps, writing debuggers, and reasoning about exploit mitigations like stack canaries and ASLR.",
  },
  {
    slug: "float-rounding",
    index: "06",
    title: "Floating-point rounding",
    blurb:
      "Why does 0.1 + 0.2 ≠ 0.3? Step through IEEE 754 representation and see exactly which bits get rounded and why.",
    lede:
      "Floating-point numbers can't represent most decimals exactly. Dial in a value, watch it snap to the nearest representable float, and see the rounding error accumulate across operations.",
    kicker: "numeric representation",
    tag: "interactive · 2D",
    accent: "--violet",
    status: "planned",
    takeaway:
      "Floating-point errors aren't random noise — they're deterministic consequences of representing infinite real numbers in 64 bits. The same representable-number lattice that explains 0.1 + 0.2 also explains why summation order matters in numerical algorithms and why financial software avoids floats entirely.",
  },
];

export function getTopic(slug: string): Topic | undefined {
  return TOPICS.find((t) => t.slug === slug);
}

export function liveTopics(): Topic[] {
  return TOPICS.filter((t) => t.status === "live");
}
