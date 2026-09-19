import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { attachRawMessageHandlers } from '../src/raw-messages.js';
import { WIDGET_GET, WIDGET_GET_IMAGE, WIDGET_ACTION, SCENE_ACTION_RUN, COMMAND_RESULT } from '../src/message-types.js';

function fakeIntegration() {
  const emitter = new EventEmitter();
  const sent = [];
  return {
    ws: {
      on: (event, handler) => emitter.on(event, handler),
      send: (raw) => sent.push(JSON.parse(raw)),
    },
    emit: (message) => emitter.emit('message', JSON.stringify(message)),
    emitRaw: (raw) => emitter.emit('message', raw),
    sent,
  };
}

// Flush the microtask queue so the (async) reply handler has run.
async function tick() {
  await new Promise((resolve) => setImmediate(resolve));
}

test('widget.get replies with the widget content, acked by message_id', async () => {
  const integration = fakeIntegration();
  const content = { version: 1, ttl_seconds: 60, components: [] };
  attachRawMessageHandlers(integration, { getWidgetContent: () => content, handleSceneAction: () => {} });

  integration.emit({ type: WIDGET_GET, payload: { message_id: 'abc' } });
  await tick();

  assert.equal(integration.sent.length, 1);
  assert.deepEqual(integration.sent[0], {
    type: COMMAND_RESULT,
    payload: { message_id: 'abc', success: true, data: { content } },
  });
});

test('scene-action.run forwards the key and fields, and replies with the outputs', async () => {
  const integration = fakeIntegration();
  let received;
  attachRawMessageHandlers(integration, {
    getWidgetContent: () => {},
    handleSceneAction: (key, fields) => {
      received = { key, fields };
      return { found: true };
    },
  });

  integration.emit({ type: SCENE_ACTION_RUN, payload: { message_id: '42', key: 'next_pass', fields: {} } });
  await tick();

  assert.deepEqual(received, { key: 'next_pass', fields: {} });
  assert.deepEqual(integration.sent[0], {
    type: COMMAND_RESULT,
    payload: { message_id: '42', success: true, data: { outputs: { found: true } } },
  });
});

test('a handler that throws replies with success:false and the error message', async () => {
  const integration = fakeIntegration();
  attachRawMessageHandlers(integration, {
    getWidgetContent: () => {},
    handleSceneAction: () => {
      throw new Error('Unknown scene action: bogus');
    },
  });

  integration.emit({ type: SCENE_ACTION_RUN, payload: { message_id: '1', key: 'bogus' } });
  await tick();

  assert.deepEqual(integration.sent[0], {
    type: COMMAND_RESULT,
    payload: { message_id: '1', success: false, error: 'Unknown scene action: bogus' },
  });
});

test('malformed JSON is silently ignored', async () => {
  const integration = fakeIntegration();
  attachRawMessageHandlers(integration, { getWidgetContent: () => ({}), handleSceneAction: () => ({}) });

  integration.emitRaw('not json at all {');
  await tick();

  assert.equal(integration.sent.length, 0);
});

test('an unrecognized message type is silently ignored', async () => {
  const integration = fakeIntegration();
  attachRawMessageHandlers(integration, { getWidgetContent: () => ({}), handleSceneAction: () => ({}) });

  integration.emit({ type: 'external-integration.some-future-message', payload: {} });
  await tick();

  assert.equal(integration.sent.length, 0);
});

test('widget.action is accepted but produces no reply (no button component in this MVP widget)', async () => {
  const integration = fakeIntegration();
  attachRawMessageHandlers(integration, {
    getWidgetContent: () => ({}),
    getWidgetImage: () => '',
    handleSceneAction: () => ({}),
  });

  integration.emit({ type: WIDGET_ACTION, payload: { message_id: '2' } });
  await tick();

  assert.equal(integration.sent.length, 0);
});

test('widget.get-image forwards the image_key and replies with the base64 bytes, acked by message_id', async () => {
  const integration = fakeIntegration();
  let receivedKey;
  attachRawMessageHandlers(integration, {
    getWidgetContent: () => ({}),
    getWidgetImage: (imageKey) => {
      receivedKey = imageKey;
      return 'aGVsbG8=';
    },
    handleSceneAction: () => ({}),
  });

  integration.emit({ type: WIDGET_GET_IMAGE, payload: { message_id: 'img-1', image_key: 'iss-illustration' } });
  await tick();

  assert.equal(receivedKey, 'iss-illustration');
  assert.deepEqual(integration.sent[0], {
    type: COMMAND_RESULT,
    payload: { message_id: 'img-1', success: true, data: { image: 'aGVsbG8=' } },
  });
});

test('widget.get-image with an unknown key replies with success:false', async () => {
  const integration = fakeIntegration();
  attachRawMessageHandlers(integration, {
    getWidgetContent: () => ({}),
    getWidgetImage: (imageKey) => {
      throw new Error(`Unknown image key: ${imageKey}`);
    },
    handleSceneAction: () => ({}),
  });

  integration.emit({ type: WIDGET_GET_IMAGE, payload: { message_id: 'img-2', image_key: 'bogus' } });
  await tick();

  assert.deepEqual(integration.sent[0], {
    type: COMMAND_RESULT,
    payload: { message_id: 'img-2', success: false, error: 'Unknown image key: bogus' },
  });
});
