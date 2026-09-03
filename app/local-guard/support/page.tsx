import type { Metadata } from 'next';
import Link from 'next/link';

import { LocalGuardPublicShell } from '@/components/local-guard/public-shell';

export const metadata: Metadata = {
  title: 'Local Guard support | LeftOut Security',
  description:
    'Installation, connection, privacy, and safe issue-reporting guidance for the Local Guard developer preview.',
};

export default function LocalGuardSupportPage() {
  return (
    <LocalGuardPublicShell
      eyebrow="Controlled tester support"
      title="Recover safely without widening authority."
    >
      <p className="mt-6 text-lg leading-8 text-muted-foreground">
        These instructions apply to the unsigned 0.3.0 developer preview. Do not
        install files received from an untrusted source or bypass a browser
        warning to make the preview appear production-ready.
      </p>

      <section className="mt-10 space-y-8 leading-7 text-muted-foreground">
        <div>
          <h2 className="text-2xl font-semibold text-foreground">
            “Connect this practice tab” is unavailable
          </h2>
          <ol className="mt-3 list-decimal space-y-2 pl-6">
            <li>
              Use an ordinary HTTP(S) page, not the extension&apos;s own file.
            </li>
            <li>Read and accept the local data-handling notice.</li>
            <li>Start the matching local connector on an allowlisted port.</li>
            <li>
              Open the extension from the exact practice tab and reconnect.
            </li>
          </ol>
        </div>

        <div>
          <h2 className="text-2xl font-semibold text-foreground">
            The page or declaration changed
          </h2>
          <p className="mt-3">
            Stop. Disconnect and pair the new document explicitly. Never reuse
            an old permit, invent a tool name, or retry an invocation whose
            outcome is unknown.
          </p>
        </div>

        <div>
          <h2 className="text-2xl font-semibold text-foreground">
            Remove the preview
          </h2>
          <p className="mt-3">
            Choose “Disconnect and revoke pairing,” then remove the unpacked
            extension from Chrome&apos;s extension-management page. Delete the
            local connector runtime-data directory separately if you also want
            to remove retained local receipts.
          </p>
        </div>

        <div>
          <h2 className="text-2xl font-semibold text-foreground">
            Report a security concern
          </h2>
          <p className="mt-3">
            Start with the extension&apos;s private local concern draft. Review
            and redact it before sharing anything. Do not include credentials,
            cookies, source code, client evidence, customer records, production
            payloads, or other private material. Public intake and security-feed
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
          privacy boundary
        </Link>{' '}
        before reconnecting.
      </p>
    </LocalGuardPublicShell>
  );
}
