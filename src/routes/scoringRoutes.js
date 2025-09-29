const express = require("express");
const logger = require("../utils/logger");
const { query } = require("../utils/db");
const LeadScoringService = require("../services/leadScoringService");
const AttioService = require("../services/attioService");
const EnrichmentService = require("../services/enrichmentService");
const EventTrackingService = require("../services/eventTrackingService");

class ScoringRoutes {
  constructor() {
    this.leadScoringService = new LeadScoringService();
    this.attioService = process.env.ATTIO_API_KEY
      ? new AttioService(process.env.ATTIO_API_KEY)
      : null;
    // Use EnrichmentService for cost-optimized enrichment (AI first)
    this.enrichmentService = new EnrichmentService();
    this.eventTracking = new EventTrackingService();
  }

  /**
   * Fix zero ICP scores - convenience endpoint
   */
  async fixZeroScores(req, res) {
    try {
      const { limit = null } = req.query;

      // Count how many users have zero scores
      const countResult = await query(`
        SELECT COUNT(*) as count 
        FROM playmaker_user_source 
        WHERE apollo_enriched_at IS NOT NULL 
        AND apollo_data IS NOT NULL 
        AND icp_score = 0
      `);

      const zeroScoreCount = parseInt(countResult.rows[0].count);

      res.json({
        success: true,
        message: "Fixing zero ICP scores in background",
        zeroScoreUsers: zeroScoreCount,
        limit: limit || "all zero-score users",
        note: "This will recalculate ICP scores, update lead scores/grades, and sync to Attio",
      });

      // Run with onlyZeroScores=true and syncToAttio=true by default
      this.runRecalculation(limit, "true", "true").catch((error) => {
        logger.error("[Scoring] Fix zero scores failed:", error);
      });
    } catch (error) {
      logger.error("[Scoring] Failed to start zero score fix:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Recalculate ICP scores for all users with Apollo data
   */
  async recalculateAllScores(req, res) {
    try {
      const {
        limit = null,
        onlyZeroScores = "true",
        syncToAttio = "true",
      } = req.query;

      res.json({
        success: true,
        message: "Score recalculation started in background",
        parameters: {
          limit: limit || "all users",
          onlyZeroScores: onlyZeroScores === "true",
          syncToAttio: syncToAttio === "true" && !!this.attioService,
        },
        note: "Check logs for progress. Focusing on users with ICP score = 0 by default.",
      });

      this.runRecalculation(limit, onlyZeroScores, syncToAttio).catch(
        (error) => {
          logger.error("[Scoring] Recalculation failed:", error);
        }
      );
    } catch (error) {
      logger.error("[Scoring] Failed to start recalculation:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Recalculate scores for a specific user
   */
  async recalculateUserScore(req, res) {
    try {
      const { email } = req.params;

      if (!email) {
        return res.status(400).json({
          success: false,
          error: "Email parameter is required",
        });
      }

      // Get user from database
      const userResult = await query(
        "SELECT * FROM playmaker_user_source WHERE email = $1",
        [email]
      );

      if (userResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: "User not found",
        });
      }

      const user = userResult.rows[0];

      // Calculate new scores
      const icpResult = this.leadScoringService.calculateICPScore(user);
      const behaviorResult =
        await this.leadScoringService.calculateBehaviorScore(
          user.id,
          user.email
        );

      const newICPScore = icpResult.score;
      const newBehaviorScore = behaviorResult.score;
      const newLeadScore = newICPScore + newBehaviorScore;

      // Determine lead grade
      let leadGrade = "F";
      if (newLeadScore >= 80) leadGrade = "A";
      else if (newLeadScore >= 60) leadGrade = "B";
      else if (newLeadScore >= 40) leadGrade = "C";
      else if (newLeadScore >= 20) leadGrade = "D";

      // Update database
      await query(
        `UPDATE playmaker_user_source 
         SET icp_score = $1,
             behaviour_score = $2,
             lead_score = $3,
             lead_grade = $4,
             last_scored_at = NOW()
         WHERE id = $5`,
        [newICPScore, newBehaviorScore, newLeadScore, leadGrade, user.id]
      );

      res.json({
        success: true,
        email: user.email,
        previousScores: {
          icp: user.icp_score,
          behavior: user.behaviour_score,
          lead: user.lead_score,
          grade: user.lead_grade,
        },
        newScores: {
          icp: newICPScore,
          behavior: newBehaviorScore,
          lead: newLeadScore,
          grade: leadGrade,
        },
        breakdown: {
          icp: icpResult.breakdown,
          behavior: behaviorResult.breakdown,
        },
      });
    } catch (error) {
      logger.error(`[Scoring] Failed to recalculate score for user:`, error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Get scoring statistics
   */
  async getScoringStats(req, res) {
    try {
      const stats = await query(`
        SELECT 
          COUNT(*) as total_users,
          COUNT(CASE WHEN icp_score = 0 THEN 1 END) as zero_icp_count,
          COUNT(CASE WHEN icp_score > 0 THEN 1 END) as non_zero_icp_count,
          COUNT(CASE WHEN lead_score >= 80 THEN 1 END) as grade_a_count,
          COUNT(CASE WHEN lead_score >= 60 AND lead_score < 80 THEN 1 END) as grade_b_count,
          COUNT(CASE WHEN lead_score >= 40 AND lead_score < 60 THEN 1 END) as grade_c_count,
          COUNT(CASE WHEN lead_score >= 20 AND lead_score < 40 THEN 1 END) as grade_d_count,
          COUNT(CASE WHEN lead_score < 20 OR lead_score IS NULL THEN 1 END) as grade_f_count,
          AVG(icp_score) as avg_icp_score,
          AVG(behaviour_score) as avg_behavior_score,
          AVG(lead_score) as avg_lead_score,
          COUNT(CASE WHEN last_scored_at > NOW() - INTERVAL '24 hours' THEN 1 END) as scored_last_24h,
          COUNT(CASE WHEN last_scored_at > NOW() - INTERVAL '7 days' THEN 1 END) as scored_last_7d
        FROM playmaker_user_source
        WHERE apollo_enriched_at IS NOT NULL
      `);

      const stat = stats.rows[0];

      res.json({
        success: true,
        statistics: {
          totalUsers: parseInt(stat.total_users),
          icpScores: {
            zero: parseInt(stat.zero_icp_count),
            nonZero: parseInt(stat.non_zero_icp_count),
            average: parseFloat(stat.avg_icp_score || 0).toFixed(1),
          },
          behaviorScores: {
            average: parseFloat(stat.avg_behavior_score || 0).toFixed(1),
          },
          leadScores: {
            average: parseFloat(stat.avg_lead_score || 0).toFixed(1),
            gradeDistribution: {
              A: parseInt(stat.grade_a_count),
              B: parseInt(stat.grade_b_count),
              C: parseInt(stat.grade_c_count),
              D: parseInt(stat.grade_d_count),
              F: parseInt(stat.grade_f_count),
            },
          },
          recentActivity: {
            scoredLast24Hours: parseInt(stat.scored_last_24h),
            scoredLast7Days: parseInt(stat.scored_last_7d),
          },
        },
      });
    } catch (error) {
      logger.error("[Scoring] Failed to get statistics:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Background job to recalculate scores
   */
  async runRecalculation(limit, onlyZeroScores, syncToAttio) {
    logger.info("[Scoring] Starting score recalculation...");

    try {
      let whereClause =
        "WHERE apollo_enriched_at IS NOT NULL AND apollo_data IS NOT NULL";
      if (onlyZeroScores === "true") {
        whereClause += " AND icp_score = 0";
      }

      let limitClause = "";
      if (limit) {
        limitClause = ` LIMIT ${parseInt(limit)}`;
      }

      const users = await query(
        `SELECT * FROM playmaker_user_source ${whereClause} ORDER BY updated_at DESC${limitClause}`
      );

      logger.info(
        `[Scoring] Processing ${users.rows.length} users (onlyZeroScores: ${onlyZeroScores}, syncToAttio: ${syncToAttio})`
      );

      let updated = 0;
      let errors = 0;
      let attioSynced = 0;
      let attioErrors = 0;
      const updatedUsers = [];

      for (const user of users.rows) {
        try {
          // Calculate scores
          const icpResult = this.leadScoringService.calculateICPScore(user);
          const behaviorResult =
            await this.leadScoringService.calculateBehaviorScore(
              user.id,
              user.email
            );

          const newICPScore = icpResult.score;
          const newBehaviorScore = behaviorResult.score;
          const newLeadScore = newICPScore + newBehaviorScore;

          // Only update if scores changed
          if (
            newICPScore !== user.icp_score ||
            newBehaviorScore !== user.behaviour_score
          ) {
            let leadGrade = "F";
            if (newLeadScore >= 80) leadGrade = "A";
            else if (newLeadScore >= 60) leadGrade = "B";
            else if (newLeadScore >= 40) leadGrade = "C";
            else if (newLeadScore >= 20) leadGrade = "D";

            // Update database
            const prevScore = user.lead_score;
            await query(
              `UPDATE playmaker_user_source
               SET icp_score = $1,
                   behaviour_score = $2,
                   lead_score = $3,
                   lead_grade = $4,
                   last_scored_at = NOW()
               WHERE id = $5`,
              [newICPScore, newBehaviorScore, newLeadScore, leadGrade, user.id]
            );

            // Track scoring event
            await this.eventTracking.trackLeadScoring(user.email, {
              lead_score: newLeadScore,
              previous_score: prevScore,
              lead_grade: leadGrade,
              icp_score: newICPScore,
              behavior_score: newBehaviorScore
            });

            updated++;

            // Store updated user info for Attio sync
            updatedUsers.push({
              ...user,
              icp_score: newICPScore,
              behaviour_score: newBehaviorScore,
              lead_score: newLeadScore,
              lead_grade: leadGrade,
            });

            if (user.icp_score === 0 && newICPScore > 0) {
              logger.info(
                `[Scoring] Fixed zero score for ${user.email}: 0 → ${newICPScore} (Grade: ${leadGrade})`
              );
            }
          }
        } catch (error) {
          errors++;
          logger.error(
            `[Scoring] Failed to score ${user.email}:`,
            error.message
          );
        }
      }

      // Sync updated users to Attio if enabled
      if (
        syncToAttio === "true" &&
        this.attioService &&
        updatedUsers.length > 0
      ) {
        logger.info(
          `[Scoring] Syncing ${updatedUsers.length} updated users to Attio...`
        );

        for (const user of updatedUsers) {
          try {
            await this.attioService.upsertPersonWithScores(user);
            attioSynced++;

            // Log every 10th sync to show progress
            if (attioSynced % 10 === 0) {
              logger.info(
                `[Scoring] Synced ${attioSynced}/${updatedUsers.length} users to Attio`
              );
            }
          } catch (error) {
            attioErrors++;
            logger.error(
              `[Scoring] Failed to sync ${user.email} to Attio:`,
              error.message
            );
          }
        }

        logger.info(
          `[Scoring] Attio sync complete. Synced: ${attioSynced}, Errors: ${attioErrors}`
        );
      }

      logger.info(
        `[Scoring] Recalculation complete. Updated: ${updated}, Errors: ${errors}, Attio Synced: ${attioSynced}`
      );

      return {
        success: true,
        updated,
        errors,
        total: users.rows.length,
        attioSynced,
        attioErrors,
      };
    } catch (error) {
      logger.error("[Scoring] Recalculation failed:", error);
      throw error;
    }
  }

  /**
   * Health check endpoint
   */
  async health(req, res) {
    res.json({
      success: true,
      message: "Scoring routes are working",
      endpoints: [
        "POST /api/scoring/fix-zero-scores",
        "POST /api/scoring/recalculate",
        "POST /api/scoring/recalculate/:email",
        "GET /api/scoring/stats",
        "GET /api/scoring/health",
      ],
    });
  }

  setupRoutes() {
    const router = express.Router();

    // Health check
    router.get("/health", this.health.bind(this));

    // Define all routes
    router.post("/fix-zero-scores", this.fixZeroScores.bind(this));
    router.post("/recalculate", this.recalculateAllScores.bind(this));
    router.post("/recalculate/:email", this.recalculateUserScore.bind(this));
    router.get("/stats", this.getScoringStats.bind(this));

    return router;
  }
}

module.exports = ScoringRoutes;
