'use client';

import { useEffect, useState } from 'react';

import { getModelContext } from '@/lib/lab/webmcp';

export function FrameControl() {
  const [status, setStatus] = useState('checking');

  useEffect(() => {
    const parentDocument = new URLSearchParams(window.location.search).get(
      'parentDocument',
    );
    const controller = new AbortController();
    const modelContext = getModelContext();
    if (!modelContext?.registerTool) {
      queueMicrotask(() => setStatus('unsupported'));
      window.parent.postMessage(
        {
          type: 'leftout-conformance-frame-status',
          documentId: parentDocument,
          registration: 'failed',
        },
        window.location.origin,
      );
      return () => controller.abort();
    }

    const registrationId = crypto.randomUUID().replaceAll('-', '').slice(0, 12);
    void Promise.resolve(
      modelContext.registerTool(
        {
          name: `los_iframe_control_${registrationId}`,
          title: 'Left Out iframe control',
          description:
            'Synthetic iframe registration used only to test client discovery boundaries.',
          inputSchema: {
            type: 'object',
            properties: {},
            required: [],
            additionalProperties: false,
          },
          annotations: { readOnlyHint: true, untrustedContentHint: false },
          execute: async () => ({
            fixture: 'leftout-iframe-control',
            registration_id: registrationId,
          }),
        },
        { signal: controller.signal },
      ),
    )
      .then(() => {
        setStatus('registered');
        window.parent.postMessage(
          {
            type: 'leftout-conformance-frame-status',
            documentId: parentDocument,
            registration: 'registered',
          },
          window.location.origin,
        );
      })
      .catch((error: unknown) => {
        const denied =
          error &&
          typeof error === 'object' &&
          'name' in error &&
          String(error.name) === 'NotAllowedError';
        setStatus(denied ? 'denied' : 'failed');
        window.parent.postMessage(
          {
            type: 'leftout-conformance-frame-status',
            documentId: parentDocument,
            registration: denied ? 'denied' : 'failed',
          },
          window.location.origin,
        );
      });

    return () => controller.abort();
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-3 text-center text-foreground">
      <div>
        <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
          Same-origin iframe control
        </p>
        <p className="mt-1 text-xs font-semibold">
          Page registration: {status}
        </p>
      </div>
    </main>
  );
}
