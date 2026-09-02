import { env } from 'cloudflare:workers';

import {
  handleReportingPublication,
  handleReportingPublicationUnsupportedMethod,
} from '@/products/reporting-service/publish';

function dependencies() {
  return {
    environment: env as unknown as Readonly<Record<string, unknown>>,
    database: env.DB,
  };
}

export function POST(request: Request) {
  return handleReportingPublication(request, dependencies());
}

export function GET(request: Request) {
  return handleReportingPublicationUnsupportedMethod(request, dependencies());
}

export const PUT = GET;
export const PATCH = GET;
export const DELETE = GET;
export const OPTIONS = GET;
