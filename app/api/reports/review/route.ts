import { env } from 'cloudflare:workers';

import {
  handleReportingReviewList,
  handleReportingReviewUnsupportedMethod,
} from '@/products/reporting-service/review';

function dependencies() {
  return {
    environment: env as unknown as Readonly<Record<string, unknown>>,
    database: env.DB,
  };
}

export function GET(request: Request) {
  return handleReportingReviewList(request, dependencies());
}

export function POST(request: Request) {
  return handleReportingReviewUnsupportedMethod(request, dependencies(), 'GET');
}

export const PUT = POST;
export const PATCH = POST;
export const DELETE = POST;
export const OPTIONS = POST;
