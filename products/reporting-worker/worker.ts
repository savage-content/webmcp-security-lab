import { loadReportingServiceConfiguration } from '../reporting-service/config';
import {
  handleReportingCorrection,
  handleReportingCorrectionUnsupportedMethod,
} from '../reporting-service/correct';
import {
  handleReportingDeletion,
  handleReportingDeletionUnsupportedMethod,
} from '../reporting-service/delete';
import {
  handleReportingFeed,
  handleReportingFeedUnsupportedMethod,
} from '../reporting-service/feed';
import { handleReportingIntake } from '../reporting-service/intake';
import {
  handleReportingLifecycleRead,
  handleReportingLifecycleTransition,
  handleReportingLifecycleUnsupportedMethod,
} from '../reporting-service/lifecycle';
import {
  handleReportingPublication,
  handleReportingPublicationUnsupportedMethod,
} from '../reporting-service/publish';
import {
  handleReportingReviewList,
  handleReportingReviewRecord,
  handleReportingReviewTransition,
  handleReportingReviewUnsupportedMethod,
} from '../reporting-service/review';

export interface ReportingWorkerEnvironment {
  DB: D1Database;
  [key: string]: unknown;
}

type ReportingRoute =
  | 'intake'
  | 'review-list'
  | 'review-record'
  | 'publication'
  | 'feed'
  | 'lifecycle'
  | 'deletion'
  | 'correction';

const RESPONSE_HEADERS = Object.freeze({
  'Cache-Control': 'no-store',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
});

function jsonError(message: string, status: number, allow?: string) {
  return Response.json(
    { error: message },
    {
      status,
      headers: allow ? { ...RESPONSE_HEADERS, Allow: allow } : RESPONSE_HEADERS,
    },
  );
}

function routeFor(pathname: string): ReportingRoute | null {
  if (pathname === '/api/reports/intake') return 'intake';
  if (pathname === '/api/reports/review') return 'review-list';
  if (/^\/api\/reports\/review\/[^/]+$/u.test(pathname)) {
    return 'review-record';
  }
  if (/^\/api\/reports\/publish\/[^/]+$/u.test(pathname)) {
    return 'publication';
  }
  if (pathname === '/api/reports/feed') return 'feed';
  if (/^\/api\/reports\/lifecycle\/[^/]+$/u.test(pathname)) {
    return 'lifecycle';
  }
  if (/^\/api\/reports\/lifecycle\/[^/]+\/delete$/u.test(pathname)) {
    return 'deletion';
  }
  if (/^\/api\/reports\/corrections\/[^/]+$/u.test(pathname)) {
    return 'correction';
  }
  return null;
}

function queryAllowed(route: ReportingRoute) {
  return route === 'review-list' || route === 'feed';
}

function routeEnabled(
  route: ReportingRoute,
  gates: Readonly<{
    intake: boolean;
    moderation: boolean;
    publication: boolean;
    feed: boolean;
    lifecycle: boolean;
    correction: boolean;
  }>,
) {
  if (route === 'intake') return gates.intake;
  if (route === 'review-list' || route === 'review-record') {
    return gates.moderation;
  }
  if (route === 'publication') return gates.publication;
  if (route === 'feed') return gates.feed;
  if (route === 'lifecycle' || route === 'deletion') return gates.lifecycle;
  return gates.correction;
}

function dependencies(environment: ReportingWorkerEnvironment) {
  return {
    environment: environment as Readonly<Record<string, unknown>>,
    database: environment.DB,
  };
}

function intakeUnsupported(environment: ReportingWorkerEnvironment) {
  try {
    const configuration = loadReportingServiceConfiguration(environment);
    return configuration.mode === 'invited' && configuration.gates.intake
      ? jsonError('Method not allowed.', 405, 'POST')
      : jsonError('Not found.', 404);
  } catch {
    return jsonError('Reporting service unavailable.', 503);
  }
}

async function dispatch(
  route: ReportingRoute,
  request: Request,
  environment: ReportingWorkerEnvironment,
) {
  const method = request.method.toUpperCase();
  const input = dependencies(environment);

  if (route === 'intake') {
    return method === 'POST'
      ? handleReportingIntake(request, input)
      : intakeUnsupported(environment);
  }
  if (route === 'review-list') {
    return method === 'GET'
      ? handleReportingReviewList(request, input)
      : handleReportingReviewUnsupportedMethod(request, input, 'GET');
  }
  if (route === 'review-record') {
    if (method === 'GET') return handleReportingReviewRecord(request, input);
    if (method === 'POST') {
      return handleReportingReviewTransition(request, input);
    }
    return handleReportingReviewUnsupportedMethod(request, input, 'GET, POST');
  }
  if (route === 'publication') {
    return method === 'POST'
      ? handleReportingPublication(request, input)
      : handleReportingPublicationUnsupportedMethod(request, input);
  }
  if (route === 'feed') {
    return method === 'GET'
      ? handleReportingFeed(request, input)
      : handleReportingFeedUnsupportedMethod(request, input);
  }
  if (route === 'lifecycle') {
    if (method === 'GET') return handleReportingLifecycleRead(request, input);
    if (method === 'POST') {
      return handleReportingLifecycleTransition(request, input);
    }
    return handleReportingLifecycleUnsupportedMethod(request, input);
  }
  if (route === 'deletion') {
    return method === 'POST'
      ? handleReportingDeletion(request, input)
      : handleReportingDeletionUnsupportedMethod(request, input);
  }
  return method === 'POST'
    ? handleReportingCorrection(request, input)
    : handleReportingCorrectionUnsupportedMethod(request, input);
}

export async function handleReportingWorkerRequest(
  request: Request,
  environment: ReportingWorkerEnvironment,
) {
  const url = new URL(request.url);
  const route = routeFor(url.pathname);
  if (!route) return jsonError('Not found.', 404);

  let configuration;
  try {
    configuration = loadReportingServiceConfiguration(environment);
  } catch {
    return jsonError('Reporting service unavailable.', 503);
  }
  if (configuration.mode === 'disabled') {
    return jsonError('Not found.', 404);
  }
  if (!routeEnabled(route, configuration.gates)) {
    return jsonError('Not found.', 404);
  }
  if (!queryAllowed(route) && url.search !== '') {
    return jsonError('Request query is not allowed.', 400);
  }
  return dispatch(route, request, environment);
}

const reportingWorker = {
  fetch(request: Request, environment: ReportingWorkerEnvironment) {
    return handleReportingWorkerRequest(request, environment);
  },
};

export default reportingWorker;
