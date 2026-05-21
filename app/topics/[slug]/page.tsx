import Link from "next/link";
import { notFound } from "next/navigation";
import { TOPICS, getTopic } from "@/lib/topics";

export function generateStaticParams() {
  return TOPICS.filter((t) => t.status === "live").map((t) => ({ slug: t.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }) {
  const topic = getTopic(params.slug);
  return { title: topic ? `${topic.title} — substrata` : "substrata" };
}

export default function TopicPage({ params }: { params: { slug: string } }) {
  const topic = getTopic(params.slug);
  if (!topic || topic.status !== "live" || !topic.Component) notFound();

  const { Component } = topic;

  return (
    <main className="wrap" style={{ paddingTop: 48, paddingBottom: 64 }}>
      <Link href="/#index" className="mono" style={{ fontSize: 13, color: "var(--dim)" }}>
        ← all topics
      </Link>

      <div style={{ marginTop: 28 }}>
        <div className="kicker" style={{ color: `var(${topic.accent})` }}>
          topic {topic.index} — {topic.kicker}
        </div>
        <h2 style={{
          fontFamily: "var(--mono)", fontSize: 34, fontWeight: 800,
          letterSpacing: "-0.02em", marginTop: 12, maxWidth: "20ch",
        }}>
          {topic.title}
        </h2>
        {topic.lede && (
          <p style={{ fontSize: 17, color: "var(--dim)", marginTop: 14, maxWidth: "60ch" }}>
            {topic.lede}
          </p>
        )}
      </div>

      <div style={{ marginTop: 32 }}>
        <Component />
      </div>

      {topic.takeaway && (
        <div style={{
          marginTop: 26, padding: "16px 20px",
          borderLeft: `2px solid var(${topic.accent})`,
          background: "rgba(255,255,255,0.02)", fontSize: 14, lineHeight: 1.7,
        }}>
          <b style={{ color: `var(${topic.accent})`, fontFamily: "var(--mono)" }}>
            why this matters &nbsp;
          </b>
          {topic.takeaway}
        </div>
      )}
    </main>
  );
}
