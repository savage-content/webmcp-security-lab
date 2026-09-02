import { env } from 'cloudflare:workers';

import { loadReportingServiceConfiguration } from '@/products/reporting-service/config';
import { handleReportingIntake } from '@/products/reporting-service/intake';

const headers = Object.freeze({
  'Cache-Control': 'no-store',
  'Content-Security-Policy': "default-src 'none'",
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
});

function environment() {
  return env as unknown as Readonly<Record<string, unknown>>;
}

function unsupportedMethod() {
  try {
    const configuration = loadReportingServiceConfiguration(environment());
    if (configuration.mode !== 'invited' || !configuration.gates.intake) {
      return Response.json(
        { error: 'Not found.' },
        { status: 404, headers },
      );
    }
    return Response.json(
      { error: 'Method not allowed.' },
      { status: 405, headers: { ...headers, Allow: 'POST' } },
    );
  } catch {
    return Response.json(
      { error: 'Reporting service unavailable.' },
      { status: 503, headers },
    );
  }
}

export function GET() {
  return unsupportedMethod();
}

export function PUT() {
  return unsupportedMethod();
}

export function PATCH() {
  return unsupportedMethod();
}

export function DELETE() {
  return unsupportedMethod();
}

export function OPTIONS() {
  return unsupportedMethod();
}

export function POST(request: Request) {
  return handleReportingIntake(request, {
    environment: environment(),
    database: env.DB,
  });
}
