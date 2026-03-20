const { query } = require('../utils/db');
const logger = require('../utils/logger');

class EventReplayService {
  async storeRawEvent(event, namespace = 'default', writeKey = null) {
    try {
      await query(
        `INSERT INTO raw_events (message_id, event_type, payload, namespace, write_key)
         VALUES ($1, $2, $3, $4, $5)`,
        [event.messageId || null, event.type || 'track', JSON.stringify(event), namespace, writeKey]
      );
    } catch (error) {
      logger.error('Failed to store raw event:', error.message);
    }
  }

  async replayEvents({ namespace = 'default', startTime, endTime, destinationTypes, limit = 10000 }) {
    const result = await query(
      `UPDATE raw_events SET replayed = true
       WHERE namespace = $1 AND received_at >= $2 AND received_at <= $3 AND replayed = false
       RETURNING *
       LIMIT $4`,
      [namespace, startTime, endTime, limit]
    );

    logger.info(`Replaying ${result.rows.length} events for namespace ${namespace}`);
    return {
      eventsReplayed: result.rows.length,
      events: result.rows.map(r => r.payload),
      destinationTypes: destinationTypes || 'all',
    };
  }

  async countReplayableEvents(namespace = 'default', startTime, endTime) {
    const result = await query(
      `SELECT COUNT(*) as count FROM raw_events
       WHERE namespace = $1 AND received_at >= $2 AND received_at <= $3 AND replayed = false`,
      [namespace, startTime, endTime]
    );
    return parseInt(result.rows[0].count);
  }

  async getReplayHistory(namespace = 'default') {
    const result = await query(
      `SELECT
         DATE(received_at) as date,
         COUNT(*) as total_events,
         COUNT(*) FILTER (WHERE replayed = true) as replayed_events
       FROM raw_events
       WHERE namespace = $1
       GROUP BY DATE(received_at)
       ORDER BY date DESC
       LIMIT 30`,
      [namespace]
    );
    return result.rows;
  }
}

module.exports = EventReplayService;
