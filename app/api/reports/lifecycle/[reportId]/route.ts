import { env } from 'cloudflare:workers';

import {
  handleReportingLifecycleRead,
  handleReportingLifecycleTransition,
  handleReportingLifecycleUnsupportedMethod,
} from '@/products/reporting-service/lifecycle';

function dependencies() {
  return {
    environment: env as unknown as Readonly<Record<string, unknown>>,
    database: env.DB,
  };
}

export function GET(request: Request) {
  return handleReportingLifecycleRead(request, dependencies());
}

export function POST(request: Request) {
  return handleReportingLifecycleTransition(request, dependencies());
}

export function PUT(request: Request) {
  return handleReportingLifecycleUnsupportedMethod(request, dependencies());
}

export const PATCH = PUT;
export const DELETE = PUT;
export const OPTIONS = PUT;
