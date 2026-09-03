import { describe, expect, it, vi } from 'vitest';

import { ISSUE_DRAFT_ASSURANCE_LIMITATION } from '../products/connector/issue-draft';
import { createReportingLedgerIntake } from '../products/reporting-service/ledger';
import { startReportingReviewerServer } from '../products/reporting-operator/reviewer-server';

const reportId = '028753de-0cba-4643-806a-4d0dcd5033a8';
const receivedAt = '2026-09-03T02:00:00.000Z';

function ledger() {
  const intake = createReportingLedgerIntake(
    {
      context: 'public-web',
      category: 'excess-authority',
      severity: 'high',
      siteOrigin: 'https://shop.example.com',
      stage: 'approval',
    },
    {
      actor: { id: 'invitation.alpha', role: 'intake' },
      requestId: 'c8984d0a-0e01-47bf-a022-5992f131354d',
    },
    {
      id: () => reportId,
      eventId: () => '374c0a2c-e3f9-4435-b383-f9d43980a62e',
      now: () => Date.parse(receivedAt),
    },
  );
  return { record: intake.record, events: [intake.event] };
}

function listPage() {
  const value = ledger().record;
  return {
    reports: [
      {
        reportId,
        state: value.moderation.state,
        revision: value.revision,
        receivedAt: value.moderation.receivedAt,
        updatedAt: value.moderation.updatedAt,
        draft: value.moderation.draft,
      },
    ],
    nextCursor: null,
    assuranceLimitation: ISSUE_DRAFT_ASSURANCE_LIMITATION,
  } as const;
}

describe('loopback reporting reviewer server', () => {
  it('uses one launch, view, and transition action without browser credentials or retry', async () => {
    const detailValue = {
      ...ledger(),
      assuranceLimitation: ISSUE_DRAFT_ASSURANCE_LIMITATION,
    } as const;
    const transitionReceipt = {
      disposition: 'updated' as const,
      reportId,
      state: 'under_review' as const,
      revision: 2,
      updatedAt: '2026-09-03T02:01:00.000Z',
      assuranceLimitation: ISSUE_DRAFT_ASSURANCE_LIMITATION,
    } as const;
    const transition = vi.fn(async () => transitionReceipt);
    const client = {
      status: () => ({
        connected: true as const,
        serviceOrigin: 'https://reports.leftout.example',
      }),
      list: vi.fn(async () => listPage()),
      detail: vi.fn(async () => detailValue),
      transition,
    };
    const server = await startReportingReviewerServer({
      host: '127.0.0.1',
      port: 0,
      client,
      log: () => undefined,
    });
    try {
      const open = await fetch(server.launchUrl, { redirect: 'manual' });
      expect(open.status).toBe(303);
      expect(open.headers.get('location')).toBe('/reviews');
      const cookie = open.headers.get('set-cookie')?.split(';', 1)[0];
      expect(cookie).toMatch(/^leftout_reporting_reviewer_session=/u);
      expect(open.headers.get('set-cookie')).toContain('HttpOnly');
      expect(open.headers.get('set-cookie')).toContain('SameSite=Strict');

      const replayedOpen = await fetch(server.launchUrl, {
        redirect: 'manual',
      });
      expect(replayedOpen.status).toBe(401);

      const queue = await fetch(`${server.baseUrl}/reviews`, {
        headers: { Cookie: cookie ?? '' },
      });
      expect(queue.status).toBe(200);
      const queueHtml = await queue.text();
      expect(queueHtml).toContain('https://shop.example.com');
      expect(queueHtml).not.toContain(reportId);
      expect(queueHtml).not.toContain('reviewer-token');
      const viewToken = /\/reviews\/view\?token=([^"&]+)/u.exec(queueHtml)?.[1];
      expect(viewToken).toBeTruthy();

      const detail = await fetch(
        `${server.baseUrl}/reviews/view?token=${encodeURIComponent(decodeURIComponent(viewToken ?? ''))}`,
        { headers: { Cookie: cookie ?? '' } },
      );
      expect(detail.status).toBe(200);
      const detailHtml = await detail.text();
      expect(detailHtml).toContain('Begin human review');
      expect(detailHtml).not.toContain(reportId);
      const actionToken = /name="action_token" value="([^"]+)"/u.exec(
        detailHtml,
      )?.[1];
      expect(actionToken).toBeTruthy();

      const crossOrigin = await fetch(`${server.baseUrl}/reviews/transition`, {
        method: 'POST',
        headers: {
          Cookie: cookie ?? '',
          Origin: 'https://evil.example',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ action_token: actionToken ?? '' }),
      });
      expect(crossOrigin.status).toBe(403);
      expect(transition).not.toHaveBeenCalled();

      const applied = await fetch(`${server.baseUrl}/reviews/transition`, {
        method: 'POST',
        headers: {
          Cookie: cookie ?? '',
          Origin: server.baseUrl,
          'Sec-Fetch-Site': 'same-origin',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ action_token: actionToken ?? '' }),
      });
      expect(applied.status).toBe(200);
      expect(await applied.text()).toContain('The private state changed once');
      expect(transition).toHaveBeenCalledOnce();
      expect(transition).toHaveBeenCalledWith({
        reportId,
        expectedRevision: 1,
        to: 'under_review',
      });

      const replay = await fetch(`${server.baseUrl}/reviews/transition`, {
        method: 'POST',
        headers: {
          Cookie: cookie ?? '',
          Origin: server.baseUrl,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ action_token: actionToken ?? '' }),
      });
      expect(replay.status).toBe(400);
      expect(transition).toHaveBeenCalledOnce();
    } finally {
      await server.close();
    }
  });

  it('refuses to start without an explicitly connected reviewer client', async () => {
    await expect(
      startReportingReviewerServer({
        port: 0,
        client: {
          status: () => ({ connected: false as const }),
          list: vi.fn(),
          detail: vi.fn(),
          transition: vi.fn(),
        },
        log: () => undefined,
      }),
    ).rejects.toThrow('disabled');
  });
});
