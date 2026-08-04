'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { formatDiscordContent } = require('../src/discord');

describe('formatDiscordContent', () => {
  it('uses message for a single notification', () => {
    const out = formatDiscordContent([
      { notification: { id: '1', event: 'signup', message: 'New signup: u1' } },
    ]);
    assert.equal(out, 'New signup: u1');
  });

  it('coalesces multiple into a batch summary', () => {
    const items = [1, 2, 3].map((i) => ({
      notification: { id: String(i), event: 'signup', message: `user ${i} signed up` },
    }));
    const out = formatDiscordContent(items);
    assert.match(out, /3 new signup/);
    assert.match(out, /user 1 signed up/);
  });
});
