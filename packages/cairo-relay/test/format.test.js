'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { formatMessage } = require('../src/format');

describe('formatMessage', () => {
  it('uses message for a single notification', () => {
    const out = formatMessage([
      { notification: { id: '1', event: 'signup', message: 'New signup: u1' } },
    ]);
    assert.equal(out, 'New signup: u1');
  });

  it('coalesces multiple into a batch summary', () => {
    const items = [1, 2, 3].map((i) => ({
      notification: { id: String(i), event: 'signup', message: `user ${i} signed up` },
    }));
    const out = formatMessage(items);
    assert.match(out, /3 new signup/);
    assert.match(out, /user 1 signed up/);
  });
});
