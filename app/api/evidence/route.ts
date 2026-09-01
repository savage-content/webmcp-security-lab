import { appendEvidenceReceipt, listEvidenceReceipts } from '@/db/evidence';
import {
  assertDurableEvidenceReceipt,
  parseEvidenceReceipt,
} from '@/lib/lab/schemas';
import type { ScenarioId } from '@/lib/lab/types';

const MAX_RECEIPT_BYTES = 128 * 1024;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getSessionId(request: Request) {
  const value = request.headers.get('x-lab-session') ?? '';
  return UUID_PATTERN.test(value) ? value : null;
}

export async function GET(request: Request) {
  try {
    const sessionId = getSessionId(request);
    if (!sessionId) {
      return Response.json(
        { error: 'A valid lab session identifier is required.' },
        { status: 400 },
      );
    }
    const url = new URL(request.url);
    const scenarioId = url.searchParams.get('scenario') as ScenarioId | null;
    const requestedLimit = Number(url.searchParams.get('limit') ?? 20);
    const receipts = await listEvidenceReceipts({
      limit: Number.isFinite(requestedLimit) ? requestedLimit : 20,
      scenarioId: scenarioId ?? undefined,
      sessionId,
    });

    return Response.json(
      { receipts },
      {
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  } catch (error) {
    console.error('Unable to read evidence ledger', error);
    return Response.json(
      { error: 'Evidence ledger unavailable.' },
      { status: 503 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const sessionId = getSessionId(request);
    if (!sessionId) {
      return Response.json(
        { error: 'A valid lab session identifier is required.' },
        { status: 400 },
      );
    }

    const contentLength = Number(request.headers.get('content-length') ?? 0);
    if (contentLength > MAX_RECEIPT_BYTES) {
      return Response.json(
        { error: 'Evidence receipt is too large.' },
        { status: 413 },
      );
    }

    const bodyText = await request.text();
    if (new TextEncoder().encode(bodyText).byteLength > MAX_RECEIPT_BYTES) {
      return Response.json(
        { error: 'Evidence receipt is too large.' },
        { status: 413 },
      );
    }

    const receipt = assertDurableEvidenceReceipt(
      parseEvidenceReceipt(JSON.parse(bodyText)),
    );
    if (receipt.sessionId !== sessionId) {
      return Response.json(
        { error: 'Receipt session does not match the request session.' },
        { status: 400 },
      );
    }
    await appendEvidenceReceipt(receipt);

    return Response.json(
      { receipt, persisted: true },
      {
        status: 201,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  } catch (error) {
    const isConflict =
      error instanceof Error &&
      (error.message.includes('UNIQUE constraint failed') ||
        error.message.includes('PRIMARY KEY'));

    console.error('Unable to append evidence receipt', error);
    return Response.json(
      {
        error: isConflict
          ? 'Evidence receipt already exists.'
          : 'Evidence receipt could not be persisted.',
      },
      { status: isConflict ? 409 : 400 },
    );
  }
}
