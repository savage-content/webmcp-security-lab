import { z } from 'zod';

import {
  errorNativeBridgeResponse,
  type NativeBridgeRequest,
  type NativeBridgeResponse,
  successNativeBridgeResponse,
} from '../native-host/native-messaging';
import {
  type BridgeCommandResult,
  BridgeCoordinator,
} from './bridge-coordinator';

const commandResultSchema = z
  .object({
    command_id: z.uuid(),
    observed_at: z.iso.datetime({ offset: true }),
    observed_origin: z.url(),
    ok: z.boolean(),
    payload: z.unknown().optional(),
    error: z.string().min(1).max(300).optional(),
  })
  .strict();

export interface NativeBridgeAdapterOptions {
  coordinator: BridgeCoordinator;
  createReportLaunch(sessionId: string): {
    url: string;
    expiresAt: string;
  };
  revokeSessionResources?(sessionId: string): void;
}

function commandResult(value: unknown): BridgeCommandResult {
  const parsed = commandResultSchema.parse(value);
  return {
    commandId: parsed.command_id,
    observedAt: parsed.observed_at,
    observedOrigin: parsed.observed_origin,
    ok: parsed.ok,
    ...(parsed.payload === undefined ? {} : { payload: parsed.payload }),
    ...(parsed.error === undefined ? {} : { error: parsed.error }),
  };
}

function boundedError(error: unknown) {
  const message = error instanceof Error ? error.message : 'Bridge rejected.';
  return (
    message.replaceAll(/[\r\n\t]+/gu, ' ').slice(0, 300) || 'Bridge rejected.'
  );
}

export class NativeBridgeAdapter {
  readonly #coordinator: BridgeCoordinator;
  readonly #createReportLaunch: NativeBridgeAdapterOptions['createReportLaunch'];
  readonly #revokeSessionResources?: NativeBridgeAdapterOptions['revokeSessionResources'];
  readonly #bridgeTokens = new Map<string, string>();

  constructor(options: NativeBridgeAdapterOptions) {
    this.#coordinator = options.coordinator;
    this.#createReportLaunch = (sessionId) =>
      options.createReportLaunch(sessionId);
    this.#revokeSessionResources = options.revokeSessionResources
      ? (sessionId) => options.revokeSessionResources?.(sessionId)
      : undefined;
  }

  async handle(request: NativeBridgeRequest): Promise<NativeBridgeResponse> {
    try {
      if (request.action === 'pair') {
        const paired = this.#coordinator.pair({
          pairCode: this.#coordinator.pairCode,
          origin: request.payload.origin,
          pageUrl: request.payload.page_url,
          clientLabel: request.payload.client_label,
        });
        this.#bridgeTokens.set(paired.sessionId, paired.bridgeToken);
        return successNativeBridgeResponse(request.requestId, 200, {
          session_id: paired.sessionId,
          origin: paired.origin,
          page_url: paired.pageUrl,
          paired_at: paired.pairedAt,
        });
      }

      const sessionId = request.payload.session_id;
      const bridgeToken = this.#bridgeTokens.get(sessionId);
      if (!bridgeToken) {
        throw new Error('Native bridge session authentication failed.');
      }

      if (request.action === 'poll') {
        const command = this.#coordinator.poll(sessionId, bridgeToken);
        return successNativeBridgeResponse(
          request.requestId,
          command ? 200 : 204,
          command
            ? {
                command_id: command.id,
                kind: command.kind,
                issued_at: command.issuedAt,
                ...('toolName' in command
                  ? {
                      tool_name: command.toolName,
                      arguments: command.arguments,
                    }
                  : {}),
              }
            : null,
        );
      }

      if (request.action === 'result') {
        await this.#coordinator.complete(
          sessionId,
          bridgeToken,
          commandResult(request.payload.result),
        );
        return successNativeBridgeResponse(request.requestId, 202, {
          accepted: true,
        });
      }

      if (request.action === 'report-link') {
        this.#coordinator.authenticate(sessionId, bridgeToken);
        const launch = this.#createReportLaunch(sessionId);
        return successNativeBridgeResponse(request.requestId, 200, {
          report_url: launch.url,
          expires_at: launch.expiresAt,
        });
      }

      this.#coordinator.revoke(sessionId, bridgeToken);
      this.#bridgeTokens.delete(sessionId);
      this.#revokeSessionResources?.(sessionId);
      return successNativeBridgeResponse(request.requestId, 200, {
        revoked: true,
      });
    } catch (error) {
      return errorNativeBridgeResponse(
        request.requestId,
        400,
        boundedError(error),
      );
    }
  }

  revokeAll() {
    for (const [sessionId, bridgeToken] of this.#bridgeTokens) {
      try {
        this.#coordinator.revoke(sessionId, bridgeToken);
        this.#revokeSessionResources?.(sessionId);
      } catch {
        // Teardown is fail-closed even if the coordinator already removed it.
      }
      this.#bridgeTokens.delete(sessionId);
    }
  }
}
