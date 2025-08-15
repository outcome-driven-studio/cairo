const logger = require("../utils/logger");
const { query } = require("../utils/db");
const LeadScoringService = require("../services/leadScoringService");
const EnrichmentService = require("../services/enrichmentService");

class ExternalProfileRoutes {
  constructor() {
    this.leadScoringService = new LeadScoringService();
    // Use EnrichmentService for cost-optimized enrichment (AI first)
    this.enrichmentService = new EnrichmentService();
  }

  /**
   * Process external LinkedIn profiles
   * These are profiles from scrapers that should be enriched and scored
   * but NOT added to Attio until they show engagement (behavior > 0)
   */
  async processLinkedInProfiles(req, res) {
    try {
      const { profiles } = req.body;

      if (!profiles || !Array.isArray(profiles)) {
        return res.status(400).json({
          success: false,
          error: "Please provide an array of profiles",
        });
      }

      logger.info(
        `[ExternalProfiles] Processing ${profiles.length} LinkedIn profiles`
      );

      const results = {
        processed: 0,
        enriched: 0,
        scored: 0,
        errors: [],
        profiles: [],
      };

      for (const profile of profiles) {
        try {
          // Validate profile data
          if (!profile.linkedin_url && !profile.email) {
            results.errors.push({
              profile,
              error: "Profile must have either linkedin_url or email",
            });
            continue;
          }

          // Step 1: Check if user already exists
          let user = null;
          if (profile.email) {
            const existingUser = await query(
              `SELECT * FROM playmaker_user_source WHERE email = $1`,
              [profile.email]
            );
            user = existingUser.rows[0];
          }

          // Step 2: Create or update user in database
          if (!user) {
            // Create new user
            const insertResult = await query(
              `INSERT INTO playmaker_user_source (
                email, 
                linkedin_profile, 
                name,
                company,
                title,
                created_at,
                updated_at,
                source
              ) VALUES ($1, $2, $3, $4, $5, NOW(), NOW(), $6)
              RETURNING *`,
              [
                profile.email || null,
                profile.linkedin_url || null,
                profile.name || null,
                profile.company || null,
                profile.title || null,
                "external_scraper",
              ]
            );
            user = insertResult.rows[0];
            logger.info(
              `[ExternalProfiles] Created new user: ${
                user.email || user.linkedin_profile
              }`
            );
          } else {
            // Update existing user with new data
            const updateResult = await query(
              `UPDATE playmaker_user_source 
               SET linkedin_profile = COALESCE($1, linkedin_profile),
                   name = COALESCE($2, name),
                   company = COALESCE($3, company),
                   title = COALESCE($4, title),
                   updated_at = NOW()
               WHERE id = $5
               RETURNING *`,
              [
                profile.linkedin_url,
                profile.name,
                profile.company,
                profile.title,
                user.id,
              ]
            );
            user = updateResult.rows[0];
            logger.info(
              `[ExternalProfiles] Updated existing user: ${user.email}`
            );
          }
          results.processed++;

          // Step 3: Enrich if we have email (using cost-optimized strategy: AI first)
          let enrichmentData = null;
          if (user.email && !user.apollo_data) {
            try {
              // Use EnrichmentService with cost-optimized strategy (AI → Hunter → Apollo)
              const enrichResult = await this.enrichmentService.enrichUser(
                {
                  ...user,
                  linkedin_profile: profile.linkedin_url,
                  company_name: profile.company,
                },
                {
                  strategy: "cost_optimized", // AI first, then Hunter, then Apollo
                  updateDb: true, // Let the service handle DB updates
                }
              );

              if (enrichResult.success) {
                enrichmentData = enrichResult.data;
                user.apollo_data = enrichmentData; // Update local user object
                results.enriched++;
                logger.info(
                  `[ExternalProfiles] Enriched ${user.email} via ${enrichResult.source} (cost: $${enrichResult.cost})`
                );
              } else {
                logger.debug(
                  `[ExternalProfiles] No enrichment data found for ${user.email}`
                );
              }
            } catch (enrichError) {
              logger.error(
                `[ExternalProfiles] Enrichment failed for ${user.email}:`,
                enrichError
              );
            }
          }

          // Step 4: Calculate ICP score (but NOT behavior score since no engagement yet)
          try {
            const scoreResult = await this.leadScoringService.scoreICPOnly(
              user
            );
            results.scored++;

            // Add to results
            results.profiles.push({
              id: user.id,
              email: user.email,
              linkedin_profile: user.linkedin_profile,
              name: user.name,
              company: user.company,
              title: user.title,
              icp_score: scoreResult.icpScore,
              behavior_score: 0, // No engagement yet
              lead_score: scoreResult.icpScore, // Only ICP for now
              lead_grade: scoreResult.grade,
              enriched: !!enrichmentData,
              in_attio: false, // NOT synced to Attio yet
            });

            logger.info(
              `[ExternalProfiles] Scored ${
                user.email || user.linkedin_profile
              }: ICP=${scoreResult.icpScore}, Grade=${scoreResult.grade}`
            );
          } catch (scoreError) {
            logger.error(
              `[ExternalProfiles] Scoring failed for ${user.email}:`,
              scoreError
            );
            results.errors.push({
              email: user.email,
              error: scoreError.message,
            });
          }
        } catch (error) {
          logger.error(`[ExternalProfiles] Failed to process profile:`, error);
          results.errors.push({
            profile,
            error: error.message,
          });
        }
      }

      // Summary
      logger.info(
        `[ExternalProfiles] Completed: ${results.processed} processed, ${results.enriched} enriched, ${results.scored} scored`
      );

      res.json({
        success: true,
        summary: {
          total: profiles.length,
          processed: results.processed,
          enriched: results.enriched,
          scored: results.scored,
          errors: results.errors.length,
        },
        profiles: results.profiles,
        errors: results.errors,
        note: "Profiles are stored in database but NOT synced to Attio. They will sync automatically once they show engagement (behavior score > 0).",
      });
    } catch (error) {
      logger.error("[ExternalProfiles] Processing failed:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Get status of external profiles
   */
  async getExternalProfileStatus(req, res) {
    try {
      // Get counts of external profiles
      const stats = await query(`
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN email IS NOT NULL THEN 1 END) as with_email,
          COUNT(CASE WHEN apollo_data IS NOT NULL THEN 1 END) as enriched,
          COUNT(CASE WHEN icp_score > 0 THEN 1 END) as scored,
          COUNT(CASE WHEN behaviour_score > 0 THEN 1 END) as engaged,
          AVG(icp_score) as avg_icp_score
        FROM playmaker_user_source
        WHERE source = 'external_scraper'
      `);

      res.json({
        success: true,
        stats: {
          total_profiles: parseInt(stats.rows[0].total),
          with_email: parseInt(stats.rows[0].with_email),
          enriched: parseInt(stats.rows[0].enriched),
          scored: parseInt(stats.rows[0].scored),
          engaged: parseInt(stats.rows[0].engaged),
          average_icp_score: parseFloat(stats.rows[0].avg_icp_score) || 0,
        },
        note: "Engaged profiles (behavior > 0) will be synced to Attio in the next periodic sync",
      });
    } catch (error) {
      logger.error("[ExternalProfiles] Status check failed:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Register routes
   */
  registerRoutes(router) {
    router.post(
      "/process-linkedin-profiles",
      this.processLinkedInProfiles.bind(this)
    );
    router.get(
      "/external-profiles/status",
      this.getExternalProfileStatus.bind(this)
    );

    logger.info("External profile routes registered");
  }
}

module.exports = ExternalProfileRoutes;
