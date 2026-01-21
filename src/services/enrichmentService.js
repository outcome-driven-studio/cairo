const ApolloService = require("./apolloService");
const HunterService = require("./hunterService");
const AIEnrichmentService = require("./aiEnrichmentService");
const logger = require("../utils/logger");
const { query } = require("../utils/db");

class EnrichmentService {
  constructor() {
    // Initialize Apollo if API key exists
    this.apolloService = process.env.APOLLO_API_KEY
      ? new ApolloService(process.env.APOLLO_API_KEY)
      : null;

    // Initialize Hunter if API key exists
    this.hunterService = process.env.HUNTER_API_KEY
      ? new HunterService(process.env.HUNTER_API_KEY)
      : null;

    // Initialize AI enrichment (GPT/Claude/Perplexity) - much cheaper!
    this.aiService = new AIEnrichmentService();

    this.stats = {
      apollo: { attempted: 0, succeeded: 0, failed: 0, cost: 0 },
      hunter: { attempted: 0, succeeded: 0, failed: 0, cost: 0 },
      ai: { attempted: 0, succeeded: 0, failed: 0, cost: 0 },
      total: { enriched: 0, failed: 0, totalCost: 0 },
    };

    // Strategy for enrichment (configurable via env)
    // Options: "traditional" (Apollo/Hunter first), "ai_first", "cost_optimized"
    this.strategy = process.env.ENRICHMENT_STRATEGY || "cost_optimized";

    logger.info("[Enrichment] Service initialized", {
      apollo: !!this.apolloService,
      hunter: !!this.hunterService,
      ai: this.aiService.geminiService?.initialized || false,
      strategy: this.strategy,
      aiProvider: "gemini",
    });
  }

  /**
   * Enrich a user with configurable strategy
   * Strategies:
   * - "traditional": Apollo → Hunter → AI
   * - "ai_first": AI → Apollo → Hunter
   * - "cost_optimized": AI → Hunter → Apollo
   */
  async enrichUser(user, options = {}) {
    const {
      forceProvider = null, // Force specific provider: "apollo", "hunter", "ai"
      skipProviders = [], // Skip specific providers
      updateDb = true, // Update database with enriched data
      strategy = this.strategy, // Override default strategy
    } = options;

    let enrichedData = null;
    let source = null;
    let cost = 0;

    // Determine enrichment order based on strategy
    let enrichmentOrder = [];

    if (forceProvider) {
      enrichmentOrder = [forceProvider];
    } else if (strategy === "ai_first") {
      enrichmentOrder = ["ai", "apollo", "hunter"];
    } else if (strategy === "cost_optimized") {
      enrichmentOrder = ["ai", "hunter", "apollo"];
    } else {
      // traditional or default
      enrichmentOrder = ["apollo", "hunter", "ai"];
    }

    // Filter out skipped providers
    enrichmentOrder = enrichmentOrder.filter((p) => !skipProviders.includes(p));

    // Try each provider in order
    for (const provider of enrichmentOrder) {
      if (enrichedData) break; // Already got data

      switch (provider) {
        case "apollo":
          if (this.apolloService) {
            logger.debug(
              `[Enrichment] Attempting Apollo enrichment for ${user.email}`
            );
            this.stats.apollo.attempted++;

            try {
              enrichedData = await this.apolloService.enrichPerson(
                user.email,
                user.first_name && user.last_name
                  ? `${user.first_name} ${user.last_name}`
                  : null,
                null // company_name not available in database
              );

              if (enrichedData && Object.keys(enrichedData).length > 0) {
                this.stats.apollo.succeeded++;
                cost = 0.15; // Apollo cost per enrichment
                this.stats.apollo.cost += cost;
                source = "apollo";
                logger.info(
                  `[Enrichment] Apollo enrichment successful for ${user.email} (cost: $${cost})`
                );
              } else {
                this.stats.apollo.failed++;
                logger.debug(
                  `[Enrichment] Apollo returned no data for ${user.email}`
                );
              }
            } catch (apolloError) {
              this.stats.apollo.failed++;
              logger.debug(
                `[Enrichment] Apollo failed for ${user.email}: ${apolloError.message}`
              );
            }
          }
          break;

        case "hunter":
          if (this.hunterService) {
            logger.debug(
              `[Enrichment] Attempting Hunter enrichment for ${user.email}`
            );
            this.stats.hunter.attempted++;

            try {
              enrichedData = await this.hunterService.enrichPerson(
                user.email,
                user.first_name && user.last_name
                  ? `${user.first_name} ${user.last_name}`
                  : null,
                null // company_name not available in database
              );

              if (enrichedData && Object.keys(enrichedData).length > 0) {
                this.stats.hunter.succeeded++;
                cost = 0.08; // Hunter cost per enrichment
                this.stats.hunter.cost += cost;
                source = "hunter";
                logger.info(
                  `[Enrichment] Hunter enrichment successful for ${user.email} (cost: $${cost})`
                );
              } else {
                this.stats.hunter.failed++;
                logger.debug(
                  `[Enrichment] Hunter returned no data for ${user.email}`
                );
              }
            } catch (hunterError) {
              this.stats.hunter.failed++;
              logger.debug(
                `[Enrichment] Hunter failed for ${user.email}: ${hunterError.message}`
              );
            }
          }
          break;

        case "ai":
          if (this.aiService.geminiService?.initialized) {
            logger.debug(
              `[Enrichment] Attempting Gemini enrichment for ${user.email}`
            );
            this.stats.ai.attempted++;

            try {
              const name =
                user.first_name && user.last_name
                  ? `${user.first_name} ${user.last_name}`
                  : user.name;

              const aiData = await this.aiService.enrichPerson(
                user.email,
                name,
                {
                  linkedinUrl: user.linkedin_profile,
                }
              );

              // Check confidence threshold (default 60%)
              const minConfidence = parseInt(
                process.env.AI_MIN_CONFIDENCE || "60"
              );

              if (aiData && Object.keys(aiData).length > 0) {
                const confidence = aiData.confidence_score || 70;

                if (confidence >= minConfidence) {
                  // Good confidence, use AI data
                  enrichedData = aiData;
                  this.stats.ai.succeeded++;
                  cost = aiData.enrichment_cost || 0.002;
                  this.stats.ai.cost += cost;
                  source = "ai_gemini";
                  logger.info(
                    `[Enrichment] Gemini enrichment successful for ${user.email} (confidence: ${confidence}%, cost: $${cost})`
                  );
                } else {
                  // Low confidence, log but don't use
                  logger.warn(
                    `[Enrichment] Gemini confidence too low for ${user.email}: ${confidence}% < ${minConfidence}%. Will try next provider.`
                  );
                  this.stats.ai.failed++;
                  // Don't set enrichedData, so it tries next provider
                }
              } else {
                this.stats.ai.failed++;
                logger.debug(
                  `[Enrichment] Gemini returned no data for ${user.email}`
                );
              }
            } catch (aiError) {
              this.stats.ai.failed++;
              logger.debug(
                `[Enrichment] Gemini failed for ${user.email}: ${aiError.message}`
              );
            }
          }
          break;
      }
    }

    // Update statistics
    if (enrichedData) {
      this.stats.total.enriched++;
      this.stats.total.totalCost += cost;
    } else {
      this.stats.total.failed++;
      logger.warn(
        `[Enrichment] Failed to enrich ${
          user.email
        } from any source (tried: ${enrichmentOrder.join(", ")})`
      );
    }

    // Update database if requested and we got data
    if (updateDb && enrichedData && user.id) {
      await this.updateUserEnrichmentData(user.id, enrichedData, source);
    }

    return {
      data: enrichedData,
      source: source,
      success: !!enrichedData,
      cost: cost,
    };
  }

  /**
   * Update user's enrichment data in database
   */
  async updateUserEnrichmentData(userId, enrichedData, source) {
    try {
      let updateQuery;
      let params;

      // Add source information to the enriched data itself
      const dataWithSource = {
        ...enrichedData,
        _enrichment_source: source,
        _enriched_at: new Date().toISOString(),
      };

      if (source === "apollo") {
        updateQuery = `
          UPDATE playmaker_user_source 
          SET apollo_data = $1,
              apollo_enriched_at = NOW()
          WHERE id = $2
        `;
        params = [JSON.stringify(dataWithSource), userId];
      } else if (source === "hunter") {
        updateQuery = `
          UPDATE playmaker_user_source 
          SET hunter_data = $1,
              hunter_enriched_at = NOW()
          WHERE id = $2
        `;
        params = [JSON.stringify(dataWithSource), userId];
      } else if (source && source.startsWith("ai_")) {
        // Store AI enrichment data in apollo_data field (since it has same structure)
        // But the source info is included in the JSON data
        updateQuery = `
          UPDATE playmaker_user_source 
          SET apollo_data = $1,
              apollo_enriched_at = NOW()
          WHERE id = $2
        `;
        params = [JSON.stringify(dataWithSource), userId];
      }

      if (updateQuery) {
        await query(updateQuery, params);
        logger.debug(`[Enrichment] Updated ${source} data for user ${userId}`);
      }
    } catch (error) {
      logger.error(
        `[Enrichment] Failed to update database for user ${userId}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Bulk enrich multiple users
   */
  async bulkEnrich(users, options = {}) {
    const results = [];
    const { batchSize = 10, delayMs = 500 } = options;

    logger.info(
      `[Enrichment] Starting bulk enrichment for ${users.length} users`
    );

    for (let i = 0; i < users.length; i += batchSize) {
      const batch = users.slice(i, i + batchSize);

      // Process batch in parallel
      const batchResults = await Promise.all(
        batch.map((user) => this.enrichUser(user, options))
      );

      results.push(...batchResults);

      // Rate limiting delay between batches
      if (i + batchSize < users.length) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }

      // Log progress
      const processed = Math.min(i + batchSize, users.length);
      logger.info(
        `[Enrichment] Progress: ${processed}/${users.length} users processed`
      );
    }

    return results;
  }

  /**
   * Check available credits for all services
   */
  async checkCredits() {
    const credits = {};

    if (this.apolloService) {
      credits.apollo = await this.apolloService.checkCredits();
    }

    if (this.hunterService) {
      credits.hunter = await this.hunterService.checkCredits();
    }

    // Gemini service (pay-per-use)
    if (this.aiService.geminiService?.initialized) {
      credits.ai = {
        available: true,
        provider: "gemini",
        estimatedCostPer1000: this.aiService.estimateCost(1000),
        message: "Gemini enrichment available (pay-per-use)",
      };
    }

    return credits;
  }

  /**
   * Get enrichment statistics
   */
  getStats() {
    const aiStats = this.aiService ? this.aiService.getStats() : null;

    return {
      apollo: this.stats.apollo,
      hunter: this.stats.hunter,
      ai: {
        ...this.stats.ai,
        providers: aiStats?.byProvider || {},
        averageCost: aiStats?.averageCost || 0,
      },
      total: this.stats.total,
      services: {
        apollo: !!this.apolloService,
        hunter: !!this.hunterService,
        ai: this.aiService.geminiService?.initialized || false,
        aiProvider: "gemini",
      },
      costComparison: {
        apollo: "$150 per 1000 enrichments",
        hunter: "$80 per 1000 enrichments",
        ai: `$${(this.aiService.estimateCost(1000) || 0).toFixed(
          2
        )} per 1000 enrichments (Gemini 1.5 Pro)`,
        savings: `${Math.round(
          (1 - (this.aiService.estimateCost(1000) || 2) / 150) * 100
        )}% cheaper than Apollo`,
      },
      strategy: this.strategy,
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      apollo: { attempted: 0, succeeded: 0, failed: 0, cost: 0 },
      hunter: { attempted: 0, succeeded: 0, failed: 0, cost: 0 },
      ai: { attempted: 0, succeeded: 0, failed: 0, cost: 0 },
      total: { enriched: 0, failed: 0, totalCost: 0 },
    };

    if (this.aiService) {
      this.aiService.stats = {
        enriched: 0,
        failed: 0,
        totalCost: 0,
        byProvider: {
          gemini: 0,
        },
      };
    }
  }
}

module.exports = EnrichmentService;
