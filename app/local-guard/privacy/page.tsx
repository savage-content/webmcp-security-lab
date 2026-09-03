import type { Metadata } from 'next';

import { LocalGuardPublicShell } from '@/components/local-guard/public-shell';

export const metadata: Metadata = {
  title: 'Proposed Local Guard privacy boundary | Left Out Security',
  description:
    'The proposed privacy boundary for future Local Guard research; no public Local Guard release is available.',
};

export default function LocalGuardPrivacyPage() {
  return (
    <LocalGuardPublicShell
      eyebrow="Future-work privacy boundary · not active"
      title="A future release would require local, explicit control."
    >
      <p className="mt-6 text-lg leading-8 text-muted-foreground">
        No public Local Guard product or data-collection path is active. The
        points below are design requirements for any future release, not a
        description of the contest&apos;s native Site Tools flow.
      </p>

      <section className="mt-10 space-y-8 leading-7 text-muted-foreground">
        <div>
          <h2 className="text-2xl font-semibold text-foreground">
            Proposed minimum information
          </h2>
          <ul className="mt-3 space-y-2">
            <li>The origin and path of the tab you explicitly select.</li>
            <li>
              The names, descriptions, input schemas, and safety annotations of
              WebMCP actions declared by that page.
            </li>
            <li>
              A short-lived local document identifier and one-use capability
              metadata.
            </li>
            <li>
              The bounded result, state comparison, side-effect list, and
              receipt identifier for an approved synthetic lab run.
            </li>
          </ul>
        </div>

        <div>
          <h2 className="text-2xl font-semibold text-foreground">
            Information a future release must not collect
          </h2>
          <p className="mt-3">
            Full page text, form entries, passwords, authentication cookies,
            payment information, personal messages, and unrelated browsing
            history remain outside the proposed scope.
          </p>
        </div>

        <div>
          <h2 className="text-2xl font-semibold text-foreground">
            Proposed transport boundary
          </h2>
          <p className="mt-3">
            Any future implementation would need explicit local consent,
            authenticated same-device transport, no telemetry or advertising,
            and an independently reviewed retention design before release.
          </p>
        </div>

        <div>
          <h2 className="text-2xl font-semibold text-foreground">
            Proposed retention and control
          </h2>
          <p className="mt-3">
            Pairing state and unused authority would need to disappear on
            disconnect, navigation, tab close, or consent revocation. Any
            retained receipt would need a clear user-controlled deletion path.
          </p>
        </div>

        <div>
          <h2 className="text-2xl font-semibold text-foreground">
            Reporting boundary
          </h2>
          <p className="mt-3">
            The current public lab creates only private page-session drafts. A
            future guard must not submit anything to Left Out Security or a
            security feed without a separate, explicit human review and action.
          </p>
        </div>

        <div>
          <h2 className="text-2xl font-semibold text-foreground">
            Policy changes
          </h2>
          <p className="mt-3">
            Any release must publish a versioned privacy notice, pass security
            and accessibility review, and disclose changes before handling data.
            None of those release gates is satisfied here.
          </p>
        </div>
      </section>
    </LocalGuardPublicShell>
  );
}
