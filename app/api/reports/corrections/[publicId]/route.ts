import { env } from 'cloudflare:workers';

import {
  handleReportingCorrection,
  handleReportingCorrectionUnsupportedMethod,
} from '@/products/reporting-service/correct';

function dependencies() {
  return {
    environment: env as unknown as Readonly<Record<string, unknown>>,
    database: env.DB,
  };
}

export function POST(request: Request) {
  return handleReportingCorrection(request, dependencies());
}

export function GET(request: Request) {
  return handleReportingCorrectionUnsupportedMethod(request, dependencies());
}

export const PUT = GET;
export const PATCH = GET;
export const DELETE = GET;
export const OPTIONS = GET;
