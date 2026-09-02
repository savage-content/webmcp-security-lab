import { env } from 'cloudflare:workers';

import {
  handleReportingReviewRecord,
  handleReportingReviewTransition,
  handleReportingReviewUnsupportedMethod,
} from '@/products/reporting-service/review';

function dependencies() {
  return {
    environment: env as unknown as Readonly<Record<string, unknown>>,
    database: env.DB,
  };
}

export function GET(request: Request) {
  return handleReportingReviewRecord(request, dependencies());
}

export function POST(request: Request) {
  return handleReportingReviewTransition(request, dependencies());
}

export function PUT(request: Request) {
  return handleReportingReviewUnsupportedMethod(
    request,
    dependencies(),
    'GET, POST',
  );
}

export const PATCH = PUT;
export const DELETE = PUT;
export const OPTIONS = PUT;
