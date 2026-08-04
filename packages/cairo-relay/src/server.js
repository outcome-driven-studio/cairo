'use strict';

const http = require('http');
const { URL } = require('url');
const { BatchBuffer } = require('./batch');
const { formatDiscordContent, postDiscord } = require('./discord');
const { ackNotification } = require('./cairo');

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(new Error('invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

/**
 * @param {object} env
 */
function createApp(env = process.env) {
  const PORT = parseInt(env.PORT || '8787', 10);
  const CAIRO_HOST = env.CAIRO_HOST || '';
  const CAIRO_WRITE_KEY = env.CAIRO_WRITE_KEY || '';
  const HOOK_SECRET = env.HOOK_SECRET || '';
  const BATCH_MAX = parseInt(env.BATCH_MAX || '10', 10);
  const BATCH_MS = parseInt(env.BATCH_MS || '30000', 10);

  const buffer = new BatchBuffer({
    max: BATCH_MAX,
    ms: BATCH_MS,
    onFlush: async (_key, items) => {
      const content = formatDiscordContent(items);
      await postDiscord(env, content);
      for (const item of items) {
        const id = item.notification?.id || item.id;
        if (!id) continue;
        try {
          await ackNotification(CAIRO_HOST, CAIRO_WRITE_KEY, id, 'acked');
        } catch (err) {
          console.error(`[cairo-relay] ack failed for ${id}:`, err.message);
        }
      }
    },
  });

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

      if (req.method === 'GET' && url.pathname === '/health') {
        return sendJson(res, 200, { ok: true, service: 'cairo-relay' });
      }

      const hookMatch = url.pathname.match(/^\/hooks\/([^/]+)$/);
      if (req.method === 'POST' && hookMatch) {
        if (HOOK_SECRET) {
          const provided = req.headers['x-hook-secret'];
          if (provided !== HOOK_SECRET) {
            return sendJson(res, 401, { error: 'unauthorized' });
          }
        }

        const agentId = decodeURIComponent(hookMatch[1]);
        const body = await readJson(req);
        const notification = body.notification || body;
        if (!notification || (!notification.id && !notification.message)) {
          return sendJson(res, 400, { error: 'notification required' });
        }

        const event = notification.event || body.event || '_';
        const key = BatchBuffer.key(agentId, event, 'discord');
        const item = {
          agent_id: body.agent_id || agentId,
          namespace: body.namespace || 'default',
          notification,
          receivedAt: new Date().toISOString(),
        };

        // Respond immediately; flush is async (batch or timer)
        sendJson(res, 202, { accepted: true, agent_id: agentId, id: notification.id });
        buffer.push(key, item).catch((err) => {
          console.error('[cairo-relay] flush error:', err.message);
        });
        return;
      }

      sendJson(res, 404, { error: 'not found' });
    } catch (err) {
      console.error('[cairo-relay]', err.message);
      sendJson(res, 500, { error: err.message || 'internal error' });
    }
  });

  return {
    server,
    buffer,
    PORT,
    start() {
      return new Promise((resolve) => {
        server.listen(PORT, () => {
          console.log(`[cairo-relay] listening on :${PORT}`);
          resolve(server);
        });
      });
    },
    async stop() {
      await buffer.flushAll();
      await new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    },
  };
}

module.exports = { createApp };
