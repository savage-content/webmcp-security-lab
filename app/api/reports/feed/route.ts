import { env } from 'cloudflare:workers';

import {
  handleReportingFeed,
  handleReportingFeedUnsupportedMethod,
} from '@/products/reporting-service/feed';

function dependencies() {
  return {
    environment: env as unknown as Readonly<Record<string, unknown>>,
    database: env.DB,
  };
}

export function GET(request: Request) {
  return handleReportingFeed(request, dependencies());
}

export function POST(request: Request) {
  return handleReportingFeedUnsupportedMethod(request, dependencies());
}

export const PUT = POST;
export const PATCH = POST;
export const DELETE = POST;
export const OPTIONS = POST;
