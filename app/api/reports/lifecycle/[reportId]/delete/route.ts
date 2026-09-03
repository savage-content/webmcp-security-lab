import { env } from 'cloudflare:workers';

import {
  handleReportingDeletion,
  handleReportingDeletionUnsupportedMethod,
} from '@/products/reporting-service/delete';

function dependencies() {
  return {
    environment: env as unknown as Readonly<Record<string, unknown>>,
    database: env.DB,
  };
}

export function POST(request: Request) {
  return handleReportingDeletion(request, dependencies());
}

export function GET(request: Request) {
  return handleReportingDeletionUnsupportedMethod(request, dependencies());
}

export const PUT = GET;
export const PATCH = GET;
export const DELETE = GET;
export const OPTIONS = GET;
