import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';

export function LocalGuardPublicShell({
  children,
  eyebrow,
  title,
}: {
  children: ReactNode;
  eyebrow: string;
  title: string;
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <a
        href="#main"
        className="sr-only rounded-md bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50"
      >
        Skip to content
      </a>
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-5 py-4">
          <Link href="/" className="flex items-center gap-3">
            <Image src="/favicon.svg" alt="" width={38} height={38} priority />
            <span>
              <span className="block font-mono text-[10px] font-semibold tracking-[0.16em] uppercase text-muted-foreground">
                Left Out Security
              </span>
              <span className="block font-semibold">
                Experimental developer preview
              </span>
            </span>
          </Link>
          <nav aria-label="Local Guard">
            <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
              <li>
                <Link
                  className="underline-offset-4 hover:underline"
                  href="/local-guard"
                >
                  Overview
                </Link>
              </li>
              <li>
                <Link
                  className="underline-offset-4 hover:underline"
                  href="/local-guard/privacy"
                >
                  Privacy
                </Link>
              </li>
              <li>
                <Link
                  className="underline-offset-4 hover:underline"
                  href="/local-guard/support"
                >
                  Support
                </Link>
              </li>
              <li>
                <Link className="underline-offset-4 hover:underline" href="/">
                  Security lab
                </Link>
              </li>
            </ul>
          </nav>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-3xl px-5 py-12 sm:py-16">
        <p className="font-mono text-xs font-semibold tracking-[0.16em] uppercase text-muted-foreground">
          {eyebrow}
        </p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">
          {title}
        </h1>
        {children}
      </main>
      <footer className="border-t border-border bg-card">
        <div className="mx-auto max-w-5xl px-5 py-7 text-sm leading-6 text-muted-foreground">
          Local Guard is future research, not a public product, setup path,
          certification, endorsement, managed service, or security guarantee.
        </div>
      </footer>
    </div>
  );
}
