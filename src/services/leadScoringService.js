const { query } = require("../utils/db");
const logger = require("../utils/logger");

class LeadScoringService {
  constructor() {
    this.scoringConfig = null;
    this.loadScoringConfig();

    // Statistics
    this.stats = {
      usersScored: 0,
      scoresUpdated: 0,
      errors: 0,
    };
  }

  /**
   * Load scoring configuration from database
   */
  async loadScoringConfig() {
    // For now, always use the comprehensive default config
    // The database config is missing many ranges for larger companies
    this.useDefaultConfig();
    logger.info("[LeadScoring] Loaded scoring configuration");
    return;

    // TODO: Re-enable database config once it's updated with all ranges
    try {
      const result = await query(
        `SELECT scoring_type, criteria, value, points 
         FROM playmaker_lead_scoring 
         ORDER BY scoring_type, criteria, value`
      );

      // Organize config by type and criteria
      this.scoringConfig = {
        icp: {},
        behavior: {},
      };

      result.rows.forEach((row) => {
        if (!this.scoringConfig[row.scoring_type][row.criteria]) {
          this.scoringConfig[row.scoring_type][row.criteria] = {};
        }
        this.scoringConfig[row.scoring_type][row.criteria][row.value] =
          row.points;
      });

      logger.info("[LeadScoring] Loaded scoring configuration");
    } catch (error) {
      logger.error(
        "[LeadScoring] Failed to load scoring config:",
        error.message
      );
      // Use default config as fallback
      this.useDefaultConfig();
    }
  }

  /**
   * Use default configuration if database load fails
   */
  useDefaultConfig() {
    this.scoringConfig = {
      icp: {
        funding_stage: {
          // Early stage (lower points)
          bootstrapped: 10,
          Bootstrapped: 10,
          unfunded: 8,
          Unfunded: 8,
          "pre-seed": 12,
          "Pre-seed": 12,
          "Pre-Seed": 12,
          "Pre Seed": 12,
          preseed: 12,
          seed: 14,
          Seed: 14,
          angel: 13,
          Angel: 13,
          // Growth stage (aligned with your criteria)
          series_a: 15,
          "Series A": 15,
          "series a": 15,
          "series-a": 15,
          series_b: 20,
          "Series B": 20,
          "series b": 20,
          "series-b": 20,
          series_c: 25,
          "Series C": 25,
          "series c": 25,
          "series-c": 25,
          series_d: 30,
          "Series D": 30,
          "series d": 30,
          "series-d": 30,
          series_e: 35,
          "Series E": 35,
          "series e": 35,
          "series-e": 35,
          series_f: 35,
          "Series F": 35,
          "series f": 35,
          "series-f": 35,
          // Late stage
          ipo: 40,
          IPO: 40,
          acquired: 30,
          Acquired: 30,
          "private equity": 35,
          "Private Equity": 35,
          private_equity: 35,
          // Other common values
          funded: 12,
          Funded: 12,
          venture: 15,
          Venture: 15,
          grant: 11,
          Grant: 11,
          crowdfunding: 10,
          Crowdfunding: 10,
          debt_financing: 12,
          "Debt Financing": 12,
          other: 5,
          Other: 5,
        },
        arr_range: {
          "<$1M": 10,
          "$1M-$5M": 20, // $1M < ARR < $10M gets 20 points
          "$5M-$10M": 20, // $1M < ARR < $10M gets 20 points
          "$10M-$25M": 40, // $10M < ARR < $50M gets 40 points
          "$25M-$50M": 40, // $10M < ARR < $50M gets 40 points
          "$50M-$100M": 35,
          "$100M-$500M": 30,
          "$500M+": 25,
          "1M-10M": 20, // Legacy format
          "10M-50M": 40, // Legacy format
        },
        headcount: {
          "1-10": 10, // 1 < Headcount < 10 gets 10 points
          "11-50": 30, // 11 < Headcount < 50 gets 30 points
          "51-200": 40, // 51 < Headcount < 250 gets 40 points
          "201-500": 40, // Part of 51-250 range
          "501-1000": 35,
          "1001-5000": 30,
          "5000+": 25,
          "51-250": 40, // Legacy format matching your criteria
        },
      },
      behavior: {
        event_type: {
          // Email events
          "Email Sent": 0,
          "Email Opened": 5,
          "Email Clicked": 5,
          "Email Replied": 10,
          emailSent: 0,
          emailOpened: 5,
          emailClicked: 5,
          emailReplied: 10,

          // LinkedIn events - matching actual database event names
          "LinkedIn Message Sent": 0, // 1806 in DB
          "LinkedIn Message Replied": 10, // 450 in DB - high value
          "LinkedIn Profile Viewed": 5, // 441 in DB
          "LinkedIn Invite Accepted": 8, // 275 in DB - good signal
          linkedinVisitDone: 5, // 657 in DB - profile visit
          linkedinInviteDone: 3, // 590 in DB - invite sent
          linkedinInterested: 15, // 1 in DB - very high intent
          linkedinDone: 5, // 4 in DB - generic completion
          linkedinSendFailed: 0, // Failed events get 0
          linkedinInviteFailed: 0, // Failed events get 0
          linkedinVisitFailed: 0, // Failed events get 0

          // Legacy LinkedIn names for backwards compatibility
          "LinkedIn Message Opened": 5,
          "LinkedIn Opened": 5,
          "LinkedIn Replied": 10,

          // Product events
          "Website Visit": 20,
          "Signed Up": 50,
        },
      },
    };
  }

  /**
   * Calculate ICP score based on enriched data
   */
  calculateICPScore(user) {
    // Check for Hunter data first (if Apollo data is empty)
    const hasHunterData = user.hunter_data && user.hunter_data !== "{}";
    const hasApolloData = user.apollo_data && user.apollo_data !== "{}";

    if (!hasApolloData && !hasHunterData) {
      logger.debug(
        "[LeadScoring] No enrichment data available for ICP scoring"
      );
      return { score: 0, breakdown: {} };
    }

    // Parse the enrichment data (prefer Apollo, fallback to Hunter)
    let enrichmentData;
    let dataSource = "apollo";

    try {
      if (hasApolloData) {
        enrichmentData =
          typeof user.apollo_data === "string"
            ? JSON.parse(user.apollo_data)
            : user.apollo_data;
      } else if (hasHunterData) {
        enrichmentData =
          typeof user.hunter_data === "string"
            ? JSON.parse(user.hunter_data)
            : user.hunter_data;
        dataSource = "hunter";
        logger.debug("[LeadScoring] Using Hunter data for ICP scoring");
      }
    } catch (e) {
      logger.debug("[LeadScoring] Failed to parse enrichment data");
      return { score: 0, breakdown: {} };
    }

    // Rename for compatibility
    const apolloData = enrichmentData;

    let score = 0;
    const scoreBreakdown = {};

    // Extract company data from various locations
    const employeeCount =
      apolloData?.organization?.estimated_num_employees ||
      apolloData?.company_size ||
      apolloData?.estimated_num_employees ||
      null;

    const revenue =
      apolloData?.organization?.annual_revenue ||
      apolloData?.company_revenue ||
      apolloData?.annual_revenue ||
      null;

    const fundingStage =
      apolloData?.organization?.latest_funding_stage ||
      apolloData?.company_funding_stage ||
      apolloData?.latest_funding_stage ||
      apolloData?.funding_stage ||
      null;

    // Also check for total funding amount (Hunter provides this)
    const totalFunding =
      apolloData?.organization?.total_funding ||
      apolloData?.company_raised ||
      apolloData?.total_funding ||
      null;

    // Check if we have any company data
    const hasCompanyData = employeeCount || revenue || fundingStage;

    if (!hasCompanyData) {
      logger.debug(
        `[LeadScoring] ${dataSource} data exists but no company information available`
      );
      return {
        score: 0,
        breakdown: { note: "No company data available", source: dataSource },
      };
    }

    // Convert raw values to ranges for compatibility with scoring config
    if (employeeCount) {
      // Check if already a range string (from Hunter)
      if (typeof employeeCount === "string" && employeeCount.includes("-")) {
        apolloData.company_headcount_range = employeeCount;
        logger.debug(`[LeadScoring] Using existing range: ${employeeCount}`);
      } else {
        apolloData.company_headcount_range =
          this.getHeadcountRange(employeeCount);
        logger.debug(
          `[LeadScoring] Converted employee count ${employeeCount} to range: ${apolloData.company_headcount_range}`
        );
      }
    }
    if (revenue) {
      apolloData.company_arr_range = this.getArrRange(revenue);
      logger.debug(
        `[LeadScoring] Converted revenue $${revenue.toLocaleString()} to range: ${
          apolloData.company_arr_range
        }`
      );
    }
    if (fundingStage) {
      apolloData.company_funding_stage = fundingStage;
    }

    // Ensure scoring config is loaded
    if (!this.scoringConfig) {
      this.useDefaultConfig();
    }

    // Funding stage score
    if (
      apolloData.company_funding_stage &&
      this.scoringConfig?.icp?.funding_stage
    ) {
      // Try exact match first, then lowercase match
      let fundingPoints =
        this.scoringConfig.icp.funding_stage[apolloData.company_funding_stage];

      if (fundingPoints === undefined) {
        // Try lowercase match
        const lowerFunding = apolloData.company_funding_stage.toLowerCase();
        fundingPoints = this.scoringConfig.icp.funding_stage[lowerFunding] || 0;
      }

      score += fundingPoints;
      scoreBreakdown.funding_stage = fundingPoints;

      if (fundingPoints > 0) {
        logger.debug(
          `[LeadScoring] Funding stage: ${apolloData.company_funding_stage} = ${fundingPoints} points`
        );
      } else {
        logger.warn(
          `[LeadScoring] Unknown funding stage: "${apolloData.company_funding_stage}" - no points assigned`
        );
      }
    }

    // ARR range score
    if (apolloData.company_arr_range && this.scoringConfig?.icp?.arr_range) {
      const arrPoints =
        this.scoringConfig.icp.arr_range[apolloData.company_arr_range] || 0;
      score += arrPoints;
      scoreBreakdown.arr_range = arrPoints;
      logger.debug(
        `[LeadScoring] ARR range: ${apolloData.company_arr_range} = ${arrPoints} points`
      );
    }

    // Headcount score
    if (
      apolloData.company_headcount_range &&
      this.scoringConfig?.icp?.headcount
    ) {
      const headcountPoints =
        this.scoringConfig.icp.headcount[apolloData.company_headcount_range] ||
        0;
      score += headcountPoints;
      scoreBreakdown.headcount = headcountPoints;
      logger.debug(
        `[LeadScoring] Headcount: ${apolloData.company_headcount_range} = ${headcountPoints} points`
      );
    }

    // Log the raw company data for debugging
    if (score === 0 && hasCompanyData) {
      logger.warn("[LeadScoring] Company data exists but ICP score is 0", {
        company_size: apolloData.company_size,
        company_revenue: apolloData.company_revenue,
        company_funding_stage: apolloData.company_funding_stage,
        company_arr_range: apolloData.company_arr_range,
        company_headcount_range: apolloData.company_headcount_range,
      });
    }

    return {
      score: Math.min(score, 100), // Cap at 100
      breakdown: scoreBreakdown,
    };
  }

  /**
   * Convert employee count to headcount range
   */
  getHeadcountRange(count) {
    if (count <= 10) return "1-10";
    if (count <= 50) return "11-50";
    if (count <= 200) return "51-200";
    if (count <= 500) return "201-500";
    if (count <= 1000) return "501-1000";
    if (count <= 5000) return "1001-5000";
    return "5000+";
  }

  /**
   * Convert revenue to ARR range
   */
  getArrRange(revenue) {
    // Convert to millions for easier comparison
    const revenueM = revenue / 1000000;

    if (revenueM < 1) return "<$1M";
    if (revenueM <= 5) return "$1M-$5M";
    if (revenueM <= 10) return "$5M-$10M";
    if (revenueM <= 25) return "$10M-$25M";
    if (revenueM <= 50) return "$25M-$50M";
    if (revenueM <= 100) return "$50M-$100M";
    if (revenueM <= 500) return "$100M-$500M";
    return "$500M+";
  }

  /**
   * Calculate behavior score based on events
   */
  async calculateBehaviorScore(userId, userEmail) {
    try {
      // Get all events for this user
      // Note: user_id in event_source can be either the UUID or the email
      const eventsResult = await query(
        `SELECT event_type, COUNT(*) as count 
         FROM event_source 
         WHERE user_id = $1 OR user_id = $2
         GROUP BY event_type`,
        [String(userId), userEmail]
      );

      let score = 0;
      const scoreBreakdown = {};

      for (const event of eventsResult.rows) {
        const eventPoints =
          this.scoringConfig.behavior.event_type[event.event_type] || 0;
        const count = parseInt(event.count) || 0;
        const totalPoints = eventPoints * count;
        score += totalPoints;

        if (totalPoints > 0) {
          scoreBreakdown[event.event_type] = {
            count: count,
            points_per: eventPoints,
            total: totalPoints,
          };
        }
      }

      // Check for positive sentiment in replies (including LinkedIn)
      const repliesResult = await query(
        `SELECT COUNT(*) as positive_replies 
         FROM event_source 
         WHERE (user_id = $1 OR user_id = $2)
         AND event_type IN (
           'Email Replied', 'emailReplied', 
           'LinkedIn Replied', 'linkedinReplied',
           'LinkedIn Message Replied',  -- Actual event name in DB
           'linkedinInterested'  -- This is also a positive signal
         )
         AND (metadata->>'sentiment' = 'positive' OR event_type = 'linkedinInterested')`,
        [String(userId), userEmail]
      );

      const positiveReplies =
        parseInt(repliesResult.rows[0]?.positive_replies) || 0;
      if (positiveReplies > 0) {
        const bonusPoints = 5 * positiveReplies;
        score += bonusPoints;
        scoreBreakdown.positive_sentiment_bonus = bonusPoints;
      }

      return {
        score,
        breakdown: scoreBreakdown,
      };
    } catch (error) {
      logger.error(
        `[LeadScoring] Error calculating behavior score for user ${userId}:`,
        error.message
      );
      return { score: 0, breakdown: {} };
    }
  }

  /**
   * Calculate lead grade based on total score
   */
  calculateGrade(totalScore) {
    if (totalScore >= 120) return "A+";
    if (totalScore >= 100) return "A";
    if (totalScore >= 80) return "B+";
    if (totalScore >= 60) return "B";
    if (totalScore >= 40) return "C+";
    if (totalScore >= 20) return "C";
    if (totalScore >= 10) return "D";
    return "F";
  }

  /**
   * Score a single user
   */
  async scoreUser(user) {
    try {
      // Parse Apollo data if it exists
      const apolloData = user.apollo_data
        ? typeof user.apollo_data === "string"
          ? JSON.parse(user.apollo_data)
          : user.apollo_data
        : null;

      // Calculate ICP score - pass the full user object, not just apolloData
      const icpResult = this.calculateICPScore(user);

      // Calculate behavior score
      // Pass original_user_id which is what event_source uses
      const behaviorResult = await this.calculateBehaviorScore(
        user.original_user_id || user.id,
        user.email
      );

      // Calculate total score
      const icpScore = icpResult.score || 0;
      const behaviorScore = behaviorResult.score || 0;
      const totalScore = icpScore + behaviorScore;
      const grade = this.calculateGrade(totalScore);

      // Debug logging
      if (isNaN(icpScore) || isNaN(behaviorScore) || isNaN(totalScore)) {
        logger.error(`[LeadScoring] NaN detected for user ${user.id}:`, {
          icpScore,
          behaviorScore,
          totalScore,
          icpResult,
          behaviorResult,
        });
        throw new Error(
          `Invalid scores calculated: ICP=${icpScore}, Behavior=${behaviorScore}`
        );
      }

      // Update user record
      await query(
        `UPDATE playmaker_user_source 
         SET icp_score = $1,
             behaviour_score = $2,
             lead_score = $3,
             lead_grade = $4,
             last_scored_at = NOW(),
             updated_at = NOW()
         WHERE id = $5`,
        [icpScore, behaviorScore, totalScore, grade, user.id]
      );

      this.stats.usersScored++;
      this.stats.scoresUpdated++;

      logger.debug(
        `[LeadScoring] Scored user ${user.email}: ICP=${icpResult.score}, Behavior=${behaviorResult.score}, Total=${totalScore}, Grade=${grade}`
      );

      return {
        userId: user.id,
        email: user.email,
        icpScore: icpResult.score,
        icpBreakdown: icpResult.breakdown,
        behaviorScore: behaviorResult.score,
        behaviorBreakdown: behaviorResult.breakdown,
        totalScore,
        grade,
      };
    } catch (error) {
      logger.error(
        `[LeadScoring] Error scoring user ${user.id}:`,
        error.message
      );
      this.stats.errors++;
      throw error;
    }
  }

  /**
   * Score only behavior for a single user (no ICP/enrichment)
   */
  async scoreBehaviorOnly(user) {
    try {
      // Calculate behavior score only
      const behaviorResult = await this.calculateBehaviorScore(
        user.original_user_id || user.id,
        user.email
      );

      // Get existing ICP score
      const icpScore = user.icp_score || 0;
      const behaviorScore = behaviorResult.score || 0;
      const totalScore = icpScore + behaviorScore;
      const grade = this.calculateGrade(totalScore);

      // Update only behavior-related fields
      await query(
        `UPDATE playmaker_user_source 
         SET behaviour_score = $1,
             lead_score = $2,
             lead_grade = $3,
             last_scored_at = NOW(),
             updated_at = NOW()
         WHERE id = $4`,
        [behaviorScore, totalScore, grade, user.id]
      );

      this.stats.usersScored++;
      this.stats.scoresUpdated++;

      logger.debug(
        `[LeadScoring] Updated behavior score for ${user.email}: Behavior=${behaviorScore}, Total=${totalScore}, Grade=${grade}`
      );

      return {
        userId: user.id,
        email: user.email,
        icpScore,
        behaviorScore,
        behaviorBreakdown: behaviorResult.breakdown,
        totalScore,
        grade,
      };
    } catch (error) {
      logger.error(
        `[LeadScoring] Error scoring behavior for user ${user.id}:`,
        error.message
      );
      this.stats.errors++;
      throw error;
    }
  }

  /**
   * Score only ICP for a single user (with enrichment if needed)
   */
  async scoreICPOnly(user, apolloService = null) {
    try {
      let apolloData = user.apollo_data;
      let enrichmentFailed = false;

      // If no Apollo data and service provided, try to enrich
      if (!apolloData && apolloService) {
        logger.info(
          `[LeadScoring] Enriching user ${user.email} for ICP scoring`
        );
        const enrichedData = await apolloService.enrichPerson(user.email);

        if (enrichedData) {
          apolloData = enrichedData;
          // Store enriched data
          await query(
            `UPDATE playmaker_user_source 
             SET apollo_data = $1,
                 apollo_enriched_at = NOW()
             WHERE id = $2`,
            [JSON.stringify(enrichedData), user.id]
          );
        } else {
          enrichmentFailed = true;
        }
      }

      // Parse Apollo data if it exists
      apolloData = apolloData
        ? typeof apolloData === "string"
          ? JSON.parse(apolloData)
          : apolloData
        : null;

      // CRITICAL: Don't overwrite existing ICP score if enrichment failed
      if (!apolloData && enrichmentFailed) {
        // Check if user already has an ICP score
        if (user.icp_score !== null && user.icp_score !== 0) {
          logger.info(
            `[LeadScoring] Enrichment failed for ${user.email}, keeping existing ICP score: ${user.icp_score}`
          );
          // Don't update ICP score, just return existing values
          return {
            userId: user.id,
            email: user.email,
            icpScore: user.icp_score,
            icpBreakdown: {},
            behaviorScore: user.behaviour_score || 0,
            totalScore:
              user.lead_score || user.icp_score + (user.behaviour_score || 0),
            grade:
              user.lead_grade ||
              this.calculateGrade(
                user.lead_score || user.icp_score + (user.behaviour_score || 0)
              ),
            enrichmentFailed: true,
          };
        } else {
          logger.warn(
            `[LeadScoring] No enrichment data and no existing ICP score for ${user.email}`
          );
        }
      }

      // Calculate ICP score only if we have data
      const icpResult = apolloData
        ? this.calculateICPScore(user)
        : { score: 0, breakdown: {} };

      // Get existing behavior score
      const icpScore = icpResult.score || 0;
      const behaviorScore = user.behaviour_score || 0;
      const totalScore = icpScore + behaviorScore;
      const grade = this.calculateGrade(totalScore);

      // Update only ICP-related fields
      await query(
        `UPDATE playmaker_user_source 
         SET icp_score = $1,
             lead_score = $2,
             lead_grade = $3,
             last_scored_at = NOW(),
             updated_at = NOW()
         WHERE id = $4`,
        [icpScore, totalScore, grade, user.id]
      );

      this.stats.usersScored++;
      this.stats.scoresUpdated++;

      logger.debug(
        `[LeadScoring] Updated ICP score for ${user.email}: ICP=${icpScore}, Total=${totalScore}, Grade=${grade}`
      );

      return {
        userId: user.id,
        email: user.email,
        icpScore,
        icpBreakdown: icpResult.breakdown,
        behaviorScore,
        totalScore,
        grade,
      };
    } catch (error) {
      logger.error(
        `[LeadScoring] Error scoring ICP for user ${user.id}:`,
        error.message
      );
      this.stats.errors++;
      throw error;
    }
  }

  /**
   * Score multiple users in batch
   */
  async scoreUsers(users, options = {}) {
    const results = [];
    const {
      behaviorOnly = false,
      icpOnly = false,
      apolloService = null,
    } = options;

    for (const user of users) {
      try {
        let result;
        if (behaviorOnly) {
          result = await this.scoreBehaviorOnly(user);
        } else if (icpOnly) {
          result = await this.scoreICPOnly(user, apolloService);
        } else {
          result = await this.scoreUser(user);
        }
        results.push(result);
      } catch (error) {
        results.push({
          userId: user.id,
          email: user.email,
          error: error.message,
        });
      }
    }

    return results;
  }

  /**
   * Score all users in the database
   */
  async scoreAllUsers(batchSize = 100) {
    try {
      logger.info("[LeadScoring] Starting to score all users...");

      // Get total count
      const countResult = await query(
        `SELECT COUNT(*) as total FROM playmaker_user_source WHERE email IS NOT NULL`
      );
      const totalUsers = parseInt(countResult.rows[0].total);

      logger.info(`[LeadScoring] Found ${totalUsers} users to score`);

      let offset = 0;
      const allResults = [];

      while (offset < totalUsers) {
        // Get batch of users (including original_user_id for event matching)
        const usersResult = await query(
          `SELECT id, email, apollo_data, original_user_id 
           FROM playmaker_user_source 
           WHERE email IS NOT NULL
           ORDER BY id
           LIMIT $1 OFFSET $2`,
          [batchSize, offset]
        );

        if (usersResult.rows.length === 0) break;

        logger.info(
          `[LeadScoring] Processing batch ${
            Math.floor(offset / batchSize) + 1
          }, users ${offset + 1} to ${offset + usersResult.rows.length}`
        );

        // Score the batch
        const batchResults = await this.scoreUsers(usersResult.rows);
        allResults.push(...batchResults);

        offset += batchSize;

        // Small delay between batches
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      // Generate summary
      const summary = await this.generateScoringSummary();

      logger.info("[LeadScoring] Scoring complete!", this.stats);

      return {
        results: allResults,
        summary,
        stats: this.stats,
      };
    } catch (error) {
      logger.error("[LeadScoring] Error scoring all users:", error.message);
      throw error;
    }
  }

  /**
   * Generate scoring summary statistics
   */
  async generateScoringSummary() {
    try {
      const summaryResult = await query(`
        SELECT 
          COUNT(*) as total_scored,
          COUNT(CASE WHEN lead_grade = 'A+' THEN 1 END) as grade_a_plus,
          COUNT(CASE WHEN lead_grade = 'A' THEN 1 END) as grade_a,
          COUNT(CASE WHEN lead_grade = 'B+' THEN 1 END) as grade_b_plus,
          COUNT(CASE WHEN lead_grade = 'B' THEN 1 END) as grade_b,
          COUNT(CASE WHEN lead_grade = 'C+' THEN 1 END) as grade_c_plus,
          COUNT(CASE WHEN lead_grade = 'C' THEN 1 END) as grade_c,
          COUNT(CASE WHEN lead_grade = 'D' THEN 1 END) as grade_d,
          COUNT(CASE WHEN lead_grade = 'F' THEN 1 END) as grade_f,
          AVG(icp_score) as avg_icp_score,
          AVG(behaviour_score) as avg_behavior_score,
          AVG(lead_score) as avg_total_score,
          MAX(lead_score) as max_score,
          MIN(lead_score) as min_score
        FROM playmaker_user_source
        WHERE lead_score IS NOT NULL
      `);

      return summaryResult.rows[0];
    } catch (error) {
      logger.error("[LeadScoring] Error generating summary:", error.message);
      return null;
    }
  }

  /**
   * Get top leads by score
   */
  async getTopLeads(limit = 20) {
    try {
      const result = await query(
        `SELECT 
          id, 
          email, 
          icp_score, 
          behaviour_score, 
          lead_score, 
          lead_grade,
          apollo_data->>'company' as company,
          apollo_data->>'title' as title,
          last_scored_at
         FROM playmaker_user_source
         WHERE lead_score IS NOT NULL
         ORDER BY lead_score DESC
         LIMIT $1`,
        [limit]
      );

      return result.rows;
    } catch (error) {
      logger.error("[LeadScoring] Error getting top leads:", error.message);
      return [];
    }
  }

  /**
   * Get leads by grade
   */
  async getLeadsByGrade(grade) {
    try {
      const result = await query(
        `SELECT 
          id, 
          email, 
          icp_score, 
          behaviour_score, 
          lead_score, 
          lead_grade,
          apollo_data->>'company' as company,
          apollo_data->>'title' as title
         FROM playmaker_user_source
         WHERE lead_grade = $1
         ORDER BY lead_score DESC`,
        [grade]
      );

      return result.rows;
    } catch (error) {
      logger.error(
        `[LeadScoring] Error getting ${grade} leads:`,
        error.message
      );
      return [];
    }
  }

  /**
   * Get statistics
   */
  getStats() {
    return this.stats;
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      usersScored: 0,
      scoresUpdated: 0,
      errors: 0,
    };
  }
}

module.exports = LeadScoringService;
