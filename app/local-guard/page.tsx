import type { Metadata } from 'next';
import Link from 'next/link';

import { LocalGuardPublicShell } from '@/components/local-guard/public-shell';

export const metadata: Metadata = {
  title: 'Experimental Local Guard research | Left Out Security',
  description:
    'Review the future-work boundary for an experimental browser guard that is not part of the public WebMCP lesson.',
};

export default function LocalGuardPage() {
  return (
    <LocalGuardPublicShell
      eyebrow="Advanced · experimental developer preview"
      title="Future work: a browser-owned WebMCP guard."
    >
      <p className="mt-6 text-lg leading-8 text-muted-foreground">
        Research code explores a browser-owned heads-up display that could
        observe WebMCP declarations and enforce a closed, one-use policy. It is
        not used by the contest&apos;s public native Site Tools flow.
      </p>

      <div className="mt-8 rounded-xl border border-amber-500/40 bg-amber-500/8 p-5">
        <h2 className="text-lg font-semibold">No public release</h2>
        <p className="mt-2 leading-7 text-muted-foreground">
          The prototype is unsigned research for controlled local development.
          It is not a public setup choice, Chrome Web Store release, hosted
          service, or ordinary-user security boundary. There are intentionally
          no public pairing or installation instructions here.
        </p>
      </div>

      <section className="mt-10" aria-labelledby="scope-heading">
        <h2 id="scope-heading" className="text-2xl font-semibold">
          What a future release would need to do
        </h2>
        <ul className="mt-4 space-y-3 leading-7 text-muted-foreground">
          <li>
            Observe WebMCP action declarations on one explicitly selected tab.
          </li>
          <li>
            Show whether nothing, one exact protected action, a declaration
            change, or a receipt was observed.
          </li>
          <li>Enforce a closed, document-bound, no-retry policy.</li>
          <li>
            Keep receipt review and concern drafting on the user&apos;s
            computer.
          </li>
        </ul>
      </section>

      <section className="mt-10" aria-labelledby="limits-heading">
        <h2 id="limits-heading" className="text-2xl font-semibold">
          What this page does not claim
        </h2>
        <ul className="mt-4 space-y-3 leading-7 text-muted-foreground">
          <li>No Local Guard release is available to public learners.</li>
          <li>No extension or connector is required for the native lesson.</li>
          <li>
            No production security, privacy, or compatibility claim is made.
          </li>
          <li>
            No browsing or receipt data is collected by this future-work page.
          </li>
        </ul>
      </section>

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        <Link
          href="/local-guard/privacy"
          className="rounded-xl border border-border bg-card p-5 font-semibold underline-offset-4 hover:underline"
        >
          Read the proposed privacy boundary →
        </Link>
        <Link
          href="/local-guard/support"
          className="rounded-xl border border-border bg-card p-5 font-semibold underline-offset-4 hover:underline"
        >
          Why there is no public setup path →
        </Link>
      </div>
    </LocalGuardPublicShell>
  );
}
