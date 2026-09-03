import type { Metadata } from 'next';

import { LocalGuardPublicShell } from '@/components/local-guard/public-shell';

export const metadata: Metadata = {
  title: 'Local Guard privacy | LeftOut Security',
  description:
    'The data-handling and retention boundary for the experimental LeftOut Local Guard browser extension.',
};

export default function LocalGuardPrivacyPage() {
  return (
    <LocalGuardPublicShell
      eyebrow="Privacy notice · Version 0.3.0 · September 2, 2026"
      title="Local means this browser and your connector."
    >
      <p className="mt-6 text-lg leading-8 text-muted-foreground">
        Local Guard handles a small amount of selected-tab information so it can
        show WebMCP activity and relay one protected lab action. It does not
        transmit that information to LeftOut Security or any third party.
      </p>

      <section className="mt-10 space-y-8 leading-7 text-muted-foreground">
        <div>
          <h2 className="text-2xl font-semibold text-foreground">
            Information handled
          </h2>
          <ul className="mt-3 space-y-2">
            <li>The origin and path of the tab you explicitly select.</li>
            <li>
              The names, descriptions, input schemas, and safety annotations of
              WebMCP actions declared by that page.
            </li>
            <li>
              A short-lived local pairing identifier, connector credential,
              document identifier, and one-use capability metadata.
            </li>
            <li>
              The bounded result, state comparison, side-effect list, and
              receipt identifier for an approved synthetic lab run.
            </li>
          </ul>
        </div>

        <div>
          <h2 className="text-2xl font-semibold text-foreground">
            Information not handled
          </h2>
          <p className="mt-3">
            Local Guard does not read full page text, form entries, passwords,
            authentication cookies, payment information, personal messages, or
            browsing history from tabs you did not explicitly select.
          </p>
        </div>

        <div>
          <h2 className="text-2xl font-semibold text-foreground">
            Where information goes
          </h2>
          <p className="mt-3">
            The extension stores state in the current Chrome profile and sends
            selected-tab WebMCP metadata only to a connector on the same device
            at an allowlisted loopback address. Version 0.3.0 uses plain HTTP on
            loopback and is therefore a controlled developer preview, not a
            production transport. It has no telemetry, advertising, analytics,
            sale, or developer-operated collection endpoint.
          </p>
        </div>

        <div>
          <h2 className="text-2xl font-semibold text-foreground">
            Retention and control
          </h2>
          <p className="mt-3">
            Pairing state is removed when you disconnect, navigate, close the
            tab, or revoke the privacy choice. An unconsumed permit is removed
            with the pairing. A consumed permit digest may remain only until its
            stated expiry to prevent one-use authority from being replayed.
            Receipts remain in the user-controlled local connector until its
            local runtime data is removed.
          </p>
        </div>

        <div>
          <h2 className="text-2xl font-semibold text-foreground">
            Reporting boundary
          </h2>
          <p className="mt-3">
            Opening “Review receipt or report a concern” opens a private local
            workbench. A draft is not submitted to LeftOut Security, the site,
            or a security feed. The separate reporting-service source in this
            research repository is disabled by default and is not called by the
            extension.
          </p>
        </div>

        <div>
          <h2 className="text-2xl font-semibold text-foreground">
            Policy changes
          </h2>
          <p className="mt-3">
            A release that changes these practices must change the in-product
            consent version and disclose the new practice before handling data.
            Removing the extension deletes its Chrome-profile storage; local
            connector data remains under the user&apos;s control.
          </p>
        </div>
      </section>
    </LocalGuardPublicShell>
  );
}
