// -----------------------------------------------------------------------------
// WebSocket message types not yet wrapped by @gladysassistant/integration-sdk
// (checked against the installed 0.13.0: its EXTERNAL_INTEGRATION message
// enum in lib/constants.js has no WIDGET_* or SCENE_ACTION_* entries).
//
// Source: docs/specs/external-integrations/capabilities/{dashboard-widgets,
// scene-triggers-and-actions}.md on the (unmerged, as of writing) branches of
// GladysAssistant/Gladys PR #3109 and #3110. These names may still change
// before merge — this is the one file to update if they do. COMMAND_RESULT is
// the one exception: it is verified against lib/constants.js
// (EXTERNAL_INTEGRATION.COMMAND_RESULT = 'external-integration.command-result'),
// since it is the same generic ack the SDK already uses for setValue/poll/
// getImage/action — this integration's widget/scene-action replies reuse it.
// -----------------------------------------------------------------------------

// Core -> integration: return the current content for a widget.
export const WIDGET_GET = 'external-integration.widget.get';

// Core -> integration: return image bytes for a widget's image component.
// Unused for now: the MVP widget has no image component.
export const WIDGET_GET_IMAGE = 'external-integration.widget.get-image';

// Core -> integration: a user tapped a widget button.
// Unused for now: the MVP widget has no button component.
export const WIDGET_ACTION = 'external-integration.widget.action';

// Integration -> core: tell the core new widget content is ready (nudge).
// Unused for now: the default 60s content TTL is enough for this widget.
export const WIDGET_REFRESH = 'external-integration.widget.refresh';

// Core -> integration: run a declared scene action.
export const SCENE_ACTION_RUN = 'external-integration.scene-action.run';

// Integration -> core: the standard reply envelope for an acked request.
export const COMMAND_RESULT = 'external-integration.command-result';
