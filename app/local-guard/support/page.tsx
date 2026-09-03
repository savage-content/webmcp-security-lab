import type { Metadata } from 'next';
import Link from 'next/link';

import { LocalGuardPublicShell } from '@/components/local-guard/public-shell';

export const metadata: Metadata = {
  title: 'Local Guard future-work status | Left Out Security',
  description:
    'Why the experimental Local Guard research has no public installation or connection path.',
};

export default function LocalGuardSupportPage() {
  return (
    <LocalGuardPublicShell
      eyebrow="Advanced · experimental developer preview"
      title="There is no public Local Guard setup path."
    >
      <p className="mt-6 text-lg leading-8 text-muted-foreground">
        The contest experience uses the public page and native Site Tools only.
        Local Guard remains future research, so this site does not ask learners
        to install an extension, start a connector, pair a tab, or use
        localhost.
      </p>

      <section className="mt-10 space-y-8 leading-7 text-muted-foreground">
        <div>
          <h2 className="text-2xl font-semibold text-foreground">
            Why setup is intentionally absent
          </h2>
          <p className="mt-3">
            Signed distribution, authenticated native transport, independent
            privacy review, accessibility acceptance, updates, recovery, and
            incident response must be completed before any public setup journey
            could be offered.
          </p>
        </div>

        <div>
          <h2 className="text-2xl font-semibold text-foreground">
            Use the judged path instead
          </h2>
          <p className="mt-3">
            Return to the public lab, select the detected native Site Tools
            option, approve one exact synthetic action, ask the agent to invoke
            it once, and verify the receipt on the same page.
          </p>
        </div>

        <div>
          <h2 className="text-2xl font-semibold text-foreground">
            Do not install research artifacts
          </h2>
          <p className="mt-3">
            Repository research artifacts are not a signed consumer release. Do
            not bypass browser warnings or present them as a production control.
          </p>
        </div>

        <div>
          <h2 className="text-2xl font-semibold text-foreground">
            Report a security concern
          </h2>
          <p className="mt-3">
            Use only the public lab&apos;s private page-session draft. Review
            and redact it before sharing. Public intake and security-feed
            publication are not enabled.
          </p>
        </div>
      </section>

      <p className="mt-10 rounded-xl border border-border bg-card p-5 leading-7 text-muted-foreground">
        Return to the{' '}
        <Link className="font-semibold text-foreground underline" href="/">
          WebMCP Security Lab
        </Link>{' '}
        for the synthetic lesson, or read the{' '}
        <Link
          className="font-semibold text-foreground underline"
          href="/local-guard/privacy"
        >
          proposed privacy boundary
        </Link>{' '}
        for the future research track.
      </p>
    </LocalGuardPublicShell>
  );
}
