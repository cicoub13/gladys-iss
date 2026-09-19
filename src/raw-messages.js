// -----------------------------------------------------------------------------
// Handles the WebSocket message types @gladysassistant/integration-sdk does
// not wrap yet (see message-types.js for why and the sourcing).
//
// `integration.ws` is a real instance property of GladysIntegration (checked
// in node_modules/@gladysassistant/integration-sdk/lib/gladys-integration.js)
// but is not part of its public index.d.ts — this is an unofficial escape
// hatch onto an implementation detail, not a documented API, and may need
// revisiting if a future SDK version changes how the socket is stored.
//
// The SDK's own internal dispatcher (_handleMessage) silently ignores message
// types it does not recognize, so attaching a second listener here is safe
// and does not need to coordinate with it. `integration.ws` is replaced on
// every reconnection, so the caller must call `attachRawMessageHandlers`
// again from an `integration.on('connected', ...)` handler, not just once at
// startup.
//
// The `{ content }` / `{ outputs }` wrapping below is not a guess: verified
// against the actual (unmerged, PR #3109/#3110 branches) server code —
// externalIntegration.getWidgetContent.js reads `result.data.content`,
// externalIntegration.runSceneAction.js reads `result.data.outputs`.
// -----------------------------------------------------------------------------

import { WIDGET_GET, WIDGET_GET_IMAGE, WIDGET_ACTION, SCENE_ACTION_RUN, COMMAND_RESULT } from './message-types.js';

/**
 * Attach the handlers for the widget/scene-action messages not yet wrapped by
 * the SDK, on the integration's *current* WebSocket.
 * @param {{ws: {on: Function, send: Function}}} integration - The SDK's GladysIntegration instance (or a test double).
 * @param {object} handlers
 * @param {() => (object|Promise<object>)} handlers.getWidgetContent - Returns the current widget content envelope (bare, not wrapped in `{ content }`).
 * @param {(key: string, fields: object) => (object|Promise<object>)} handlers.handleSceneAction - Returns a scene action's outputs (bare, not wrapped in `{ outputs }`), or throws.
 * @param {{error: Function}} [handlers.logger] - Optional logger for handler failures.
 * @returns {void}
 * @example
 * integration.on('connected', () => attachRawMessageHandlers(integration, { getWidgetContent, handleSceneAction }));
 */
export function attachRawMessageHandlers(integration, { getWidgetContent, handleSceneAction, logger }) {
  integration.ws.on('message', (raw) => {
    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      // Not JSON we understand: ignore silently, same policy as the SDK's own dispatcher.
      return;
    }
    if (!message || typeof message.type !== 'string') {
      return;
    }

    switch (message.type) {
      case WIDGET_GET:
        reply(integration, message, async () => ({ content: await getWidgetContent() }), logger);
        break;
      case SCENE_ACTION_RUN:
        reply(
          integration,
          message,
          async () => ({ outputs: await handleSceneAction(message.payload?.key, message.payload?.fields) }),
          logger,
        );
        break;
      case WIDGET_GET_IMAGE:
      case WIDGET_ACTION:
        // Not used by this MVP widget: no image component, no button component.
        break;
      default:
        // Not one of ours: leave it to the SDK's own dispatcher (or a future one).
        break;
    }
  });
}

async function reply(integration, message, computeData, logger) {
  const messageId = message.payload?.message_id;
  try {
    const data = await computeData();
    integration.ws.send(
      JSON.stringify({ type: COMMAND_RESULT, payload: { message_id: messageId, success: true, data } }),
    );
  } catch (err) {
    logger?.error(`Failed to handle ${message.type}`, err);
    integration.ws.send(
      JSON.stringify({ type: COMMAND_RESULT, payload: { message_id: messageId, success: false, error: err.message } }),
    );
  }
}
