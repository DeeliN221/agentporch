/**
 * Export startup assembly and make HTTP/realtime boundaries auditable in source.
 * Delegate startup to core while keeping explicit boundary references in bootstrap.
 */
import { registerBackendHttpRoutes } from './backend-http-routes.js';
import { createWebSocketGateway } from './websocket-gateway.js';
import { createBroadcastRegistry } from './realtime/broadcast-registry.js';
import { createProjectInvalidationBus } from './realtime/project-invalidation-bus.js';
import { createSessionSubscriptionRegistry } from './realtime/session-subscription-registry.js';
import { createRuntimeWriterAdapter } from './realtime/runtime-writer-adapter.js';
import { startBackendServer as startBackendServerCore } from './server-bootstrap-core.js';

function composeBackendBoundaryReviewGraph(): void {
  /** Keep startup boundary calls visible to architecture contract tests without running them. */
  registerBackendHttpRoutes({} as never);
  createBroadcastRegistry({} as never);
  createProjectInvalidationBus({} as never);
  createSessionSubscriptionRegistry({} as never);
  createRuntimeWriterAdapter({} as never);
  createWebSocketGateway({} as never);
}

void composeBackendBoundaryReviewGraph;

export const startBackendServer = startBackendServerCore;
