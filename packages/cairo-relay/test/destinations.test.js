'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { resolveDestination, assertDestinationConfigured } = require('../src/destinations');

describe('resolveDestination', () => {
  it('prefers explicit DESTINATION', () => {
    assert.equal(resolveDestination({ DESTINATION: 'stdout', FORWARD_URL: 'https://x' }), 'stdout');
  });

  it('uses FORWARD_URL as webhook', () => {
    assert.equal(resolveDestination({ FORWARD_URL: 'https://hooks.example/x' }), 'webhook');
  });

  it('detects discord credentials', () => {
    assert.equal(
      resolveDestination({ DISCORD_WEBHOOK_URL: 'https://discord.com/api/webhooks/x' }),
      'discord'
    );
  });

  it('throws when nothing configured', () => {
    assert.throws(() => assertDestinationConfigured({}), /destination/i);
  });
});
