'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { BatchBuffer } = require('../src/batch');

describe('BatchBuffer', () => {
  it('flushes when max size reached', async () => {
    const flushed = [];
    const buf = new BatchBuffer({
      max: 2,
      ms: 60_000,
      onFlush: async (key, items) => {
        flushed.push({ key, items });
      },
    });

    await buf.push('a|signup|discord', { id: 1 });
    assert.equal(flushed.length, 0);
    await buf.push('a|signup|discord', { id: 2 });
    assert.equal(flushed.length, 1);
    assert.equal(flushed[0].items.length, 2);
  });

  it('flushes on timer', async () => {
    const flushed = [];
    const buf = new BatchBuffer({
      max: 10,
      ms: 30,
      onFlush: async (_key, items) => {
        flushed.push(items);
      },
    });

    await buf.push('a|signup|discord', { id: 1 });
    await new Promise((r) => setTimeout(r, 80));
    assert.equal(flushed.length, 1);
    assert.equal(flushed[0][0].id, 1);
  });
});
