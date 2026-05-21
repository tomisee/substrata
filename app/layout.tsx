import type { Metadata } from "next";
import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";
import "./globals.css";

export const metadata: Metadata = {
  title: "substrata — interactive systems explainers",
  description:
    "A living portfolio of working models for low-level computing concepts. Each topic is something you can poke at, not just read.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Prevent flash of wrong theme on load */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{if(localStorage.getItem('theme')==='light')document.documentElement.setAttribute('data-theme','light')}catch(e){}})()` }} />
      </head>
      <body>
        <header className="site-header">
          <div className="wrap">
            <Link href="/" className="logo">
              sub<span className="blink">strata_</span>
            </Link>
            <nav className="site-nav">
              <Link href="/#index">topics</Link>
              <Link href="/#about">about</Link>
              <a href="https://github.com" target="_blank" rel="noreferrer">source</a>
              <ThemeToggle />
            </nav>
          </div>
        </header>
        {children}
        <footer className="site-footer">
          <div className="wrap">
            built as a living portfolio — each topic is a self-contained interactive model.<br />
            stack: <code>Next.js</code> · <code>react-three-fiber</code> · <code>TypeScript</code> — deploy on <code>Vercel</code>
          </div>
        </footer>
      </body>
    </html>
  );
}
