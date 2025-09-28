const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const { query } = require('../utils/db');

/**
 * Get dashboard overview statistics
 */
router.get('/overview', async (req, res) => {
  try {
    logger.info('[Dashboard] Fetching overview statistics...');

    // Get the default namespace
    const namespaceResult = await query(`
      SELECT name, table_name
      FROM namespaces
      WHERE keywords @> '"default"'
      LIMIT 1
    `);

    const namespace = namespaceResult.rows[0];
    if (!namespace) {
      throw new Error('No default namespace found');
    }

    const tableName = namespace.table_name;
    logger.info(`[Dashboard] Using table: ${tableName}`);

    // Get total users
    const totalUsersResult = await query(`SELECT COUNT(*) as count FROM ${tableName}`);
    const totalUsers = parseInt(totalUsersResult.rows[0].count);

    // Get users by lead grade distribution
    const leadGradeResult = await query(`
      SELECT
        COALESCE(lead_grade, 'Unscored') as grade,
        COUNT(*) as count
      FROM ${tableName}
      GROUP BY lead_grade
      ORDER BY COUNT(*) DESC
    `);

    // Get enrichment sources
    const enrichmentSourcesResult = await query(`
      SELECT
        enrichment_profile->>'platform' as platform,
        COUNT(*) as count
      FROM ${tableName}
      WHERE enrichment_profile IS NOT NULL
      GROUP BY enrichment_profile->>'platform'
      ORDER BY COUNT(*) DESC
    `);

    // Get users created over time (last 30 days)
    const userTrendResult = await query(`
      SELECT
        DATE(created_at) as date,
        COUNT(*) as users
      FROM ${tableName}
      WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY DATE(created_at)
      ORDER BY date DESC
      LIMIT 30
    `);

    // Get lead score distribution
    const leadScoreResult = await query(`
      SELECT
        CASE
          WHEN lead_score >= 80 THEN 'A (80-100)'
          WHEN lead_score >= 60 THEN 'B (60-79)'
          WHEN lead_score >= 40 THEN 'C (40-59)'
          WHEN lead_score >= 20 THEN 'D (20-39)'
          WHEN lead_score IS NOT NULL THEN 'E (0-19)'
          ELSE 'Unscored'
        END as score_range,
        COUNT(*) as count,
        AVG(lead_score) as avg_score
      FROM ${tableName}
      GROUP BY
        CASE
          WHEN lead_score >= 80 THEN 'A (80-100)'
          WHEN lead_score >= 60 THEN 'B (60-79)'
          WHEN lead_score >= 40 THEN 'C (40-59)'
          WHEN lead_score >= 20 THEN 'D (20-39)'
          WHEN lead_score IS NOT NULL THEN 'E (0-19)'
          ELSE 'Unscored'
        END
      ORDER BY AVG(lead_score) DESC NULLS LAST
    `);

    // Get recent activity (new users, updates)
    const recentActivityResult = await query(`
      SELECT
        id,
        email,
        enrichment_profile->>'name' as name,
        enrichment_profile->>'platform' as platform,
        lead_score,
        lead_grade,
        created_at,
        updated_at,
        CASE
          WHEN created_at > NOW() - INTERVAL '24 hours' THEN 'new_user'
          WHEN updated_at > NOW() - INTERVAL '24 hours' THEN 'updated'
          ELSE 'existing'
        END as activity_type
      FROM ${tableName}
      WHERE created_at > NOW() - INTERVAL '7 days'
         OR updated_at > NOW() - INTERVAL '24 hours'
      ORDER BY GREATEST(created_at, updated_at) DESC
      LIMIT 20
    `);

    // Get enrichment statistics
    const enrichmentStatsResult = await query(`
      SELECT
        COUNT(*) as total_users,
        COUNT(apollo_data) as apollo_enriched,
        COUNT(CASE WHEN lead_score IS NOT NULL THEN 1 END) as scored_users,
        AVG(lead_score) as avg_lead_score,
        COUNT(CASE WHEN lead_score >= 70 THEN 1 END) as high_quality_leads
      FROM ${tableName}
    `);

    const enrichmentStats = enrichmentStatsResult.rows[0];

    // Get sync logs if available
    let syncStats = {
      total_syncs: 0,
      successful_syncs: 0,
      failed_syncs: 0,
      last_sync: null
    };

    try {
      const syncStatsResult = await query(`
        SELECT
          COUNT(*) as total_syncs,
          COUNT(CASE WHEN status = 'success' THEN 1 END) as successful_syncs,
          COUNT(CASE WHEN status != 'success' THEN 1 END) as failed_syncs,
          MAX(created_at) as last_sync
        FROM sync_logs
      `);
      syncStats = syncStatsResult.rows[0];
    } catch (error) {
      logger.debug('[Dashboard] Sync logs table not available');
    }

    // Transform data for frontend
    const response = {
      totalUsers,
      namespace: namespace.name,
      tableName,

      // Key metrics
      enrichmentRate: totalUsers > 0 ? Math.round((enrichmentStats.apollo_enriched / totalUsers) * 100) : 0,
      scoringRate: totalUsers > 0 ? Math.round((enrichmentStats.scored_users / totalUsers) * 100) : 0,
      avgLeadScore: Math.round(enrichmentStats.avg_lead_score || 0),
      highQualityLeads: parseInt(enrichmentStats.high_quality_leads || 0),

      // Charts data
      leadGradeDistribution: leadGradeResult.rows.map(row => ({
        name: row.grade || 'Unscored',
        value: parseInt(row.count),
        color: getGradeColor(row.grade)
      })),

      userTrend: userTrendResult.rows.reverse().map(row => ({
        date: row.date,
        users: parseInt(row.users)
      })),

      leadScoreDistribution: leadScoreResult.rows.map(row => ({
        range: row.score_range,
        count: parseInt(row.count),
        avgScore: Math.round(row.avg_score || 0)
      })),

      enrichmentSources: enrichmentSourcesResult.rows.map(row => ({
        platform: row.platform || 'Unknown',
        count: parseInt(row.count),
        color: getPlatformColor(row.platform)
      })),

      recentActivity: recentActivityResult.rows.map(row => ({
        id: row.id,
        email: row.email,
        name: row.name || 'Unknown',
        platform: row.platform || 'Unknown',
        leadScore: row.lead_score,
        leadGrade: row.lead_grade,
        activityType: row.activity_type,
        timestamp: row.activity_type === 'new_user' ? row.created_at : row.updated_at,
        message: getActivityMessage(row)
      })),

      // Sync statistics
      syncStats: {
        totalSyncs: parseInt(syncStats.total_syncs || 0),
        successfulSyncs: parseInt(syncStats.successful_syncs || 0),
        failedSyncs: parseInt(syncStats.failed_syncs || 0),
        lastSync: syncStats.last_sync,
        successRate: syncStats.total_syncs > 0 ?
          Math.round((syncStats.successful_syncs / syncStats.total_syncs) * 100) : 0
      }
    };

    logger.info(`[Dashboard] Overview generated for ${totalUsers} users`);
    res.json(response);

  } catch (error) {
    logger.error('[Dashboard] Error fetching overview:', error);
    res.status(500).json({
      error: 'Failed to fetch dashboard overview',
      details: error.message
    });
  }
});

// Helper functions
function getGradeColor(grade) {
  const colors = {
    'A': '#10b981', // green
    'B': '#3b82f6', // blue
    'C': '#f59e0b', // yellow
    'D': '#f97316', // orange
    'E': '#ef4444', // red
    'Unscored': '#6b7280' // gray
  };
  return colors[grade] || colors['Unscored'];
}

function getPlatformColor(platform) {
  const colors = {
    'smartlead': '#3b82f6',
    'lemlist': '#10b981',
    'apollo': '#8b5cf6',
    'manual': '#f59e0b'
  };
  return colors[platform] || '#6b7280';
}

function getActivityMessage(row) {
  switch (row.activity_type) {
    case 'new_user':
      return `New user ${row.name || row.email} added from ${row.platform}`;
    case 'updated':
      return `${row.name || row.email} updated with score ${row.lead_score} (${row.lead_grade})`;
    default:
      return `${row.name || row.email} activity`;
  }
}

/**
 * Get namespace information
 */
router.get('/namespace', async (req, res) => {
  try {
    const result = await query(`
      SELECT
        name,
        table_name,
        keywords,
        created_at,
        is_active
      FROM namespaces
      WHERE is_active = true
      ORDER BY created_at DESC
    `);

    res.json({ namespaces: result.rows });
  } catch (error) {
    logger.error('[Dashboard] Error fetching namespaces:', error);
    res.status(500).json({ error: 'Failed to fetch namespaces' });
  }
});

module.exports = router;