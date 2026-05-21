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
];

export function getTopic(slug: string): Topic | undefined {
  return TOPICS.find((t) => t.slug === slug);
}

export function liveTopics(): Topic[] {
  return TOPICS.filter((t) => t.status === "live");
}
