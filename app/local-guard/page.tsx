import type { Metadata } from 'next';
import Link from 'next/link';

import { LocalGuardPublicShell } from '@/components/local-guard/public-shell';

export const metadata: Metadata = {
  title: 'Local Guard developer preview | Left Out Security',
  description:
    'Review the exact scope, privacy boundary, and release status of the experimental Left Out Local Guard browser extension.',
};

export default function LocalGuardPage() {
  return (
    <LocalGuardPublicShell
      eyebrow="Experimental desktop protection"
      title="Know what a site offers your agent before anything runs."
    >
      <p className="mt-6 text-lg leading-8 text-muted-foreground">
        Local Guard is a browser-owned heads-up display for the WebMCP Security
        Lab. It can observe declarations on one tab and enforce the lab&apos;s
        closed, one-use practice policy. It cannot make a site or agent safe.
      </p>

      <div className="mt-8 rounded-xl border border-amber-500/40 bg-amber-500/8 p-5">
        <h2 className="text-lg font-semibold">Current release status</h2>
        <p className="mt-2 leading-7 text-muted-foreground">
          Version 0.3.0 is an unsigned developer preview for controlled testing.
          It is not Chrome Web Store reviewed or signed, and its local connector
          still uses a loopback HTTP development channel. Do not present it as
          an ordinary-user security boundary.
        </p>
      </div>

      <section className="mt-10" aria-labelledby="scope-heading">
        <h2 id="scope-heading" className="text-2xl font-semibold">
          Its narrow purpose
        </h2>
        <ul className="mt-4 space-y-3 leading-7 text-muted-foreground">
          <li>
            Observe WebMCP action declarations on one explicitly selected tab.
          </li>
          <li>
            Show whether nothing, one exact protected action, a declaration
            change, or a receipt was observed.
          </li>
          <li>
            Relay one already approved synthetic lab action through a closed,
            document-bound, no-retry policy.
          </li>
          <li>
            Keep receipt review and concern drafting on the user&apos;s
            computer.
          </li>
        </ul>
      </section>

      <section className="mt-10" aria-labelledby="limits-heading">
        <h2 id="limits-heading" className="text-2xl font-semibold">
          What it does not do
        </h2>
        <ul className="mt-4 space-y-3 leading-7 text-muted-foreground">
          <li>It does not approve an action for a person.</li>
          <li>
            It does not automatically retry or invoke arbitrary site tools.
          </li>
          <li>
            It does not read full page text, forms, passwords, or cookies.
          </li>
          <li>
            It does not send browsing or receipt data to Left Out Security or a
            public reporting feed.
          </li>
        </ul>
      </section>

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        <Link
          href="/local-guard/privacy"
          className="rounded-xl border border-border bg-card p-5 font-semibold underline-offset-4 hover:underline"
        >
          Read the exact privacy boundary →
        </Link>
        <Link
          href="/local-guard/support"
          className="rounded-xl border border-border bg-card p-5 font-semibold underline-offset-4 hover:underline"
        >
          Troubleshoot the developer preview →
        </Link>
      </div>
    </LocalGuardPublicShell>
  );
}
