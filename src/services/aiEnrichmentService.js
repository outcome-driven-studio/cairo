const { getInstance } = require("./geminiService");
const logger = require("../utils/logger");
const { query } = require("../utils/db");

/**
 * AI-based enrichment service using Google Gemini
 * Much cheaper than Apollo/Hunter for company data enrichment
 * 
 * Cost comparison (per 1000 enrichments):
 * - Apollo: ~$100-200
 * - Hunter: ~$50-100
 * - Gemini 1.5 Pro: ~$2 per 1000 (much cheaper!)
 */
class AIEnrichmentService {
  constructor() {
    // Initialize Gemini service
    this.geminiService = getInstance();
    
    if (!this.geminiService.initialized) {
      logger.warn(
        "[AIEnrichment] Gemini service not initialized. Set GEMINI_API_KEY environment variable."
      );
    }

    // Cost tracking (approximate costs per enrichment in USD)
    this.costs = {
      gemini: 0.002, // ~$2 per 1000 (Gemini 1.5 Pro)
      apollo: 0.15, // ~$150 per 1000
      hunter: 0.08, // ~$80 per 1000
    };

    // Statistics
    this.stats = {
      enriched: 0,
      failed: 0,
      totalCost: 0,
      byProvider: {
        gemini: 0,
      },
    };
  }

  /**
   * Check if Gemini is available
   */
  get providers() {
    return this.geminiService.initialized
      ? [{ name: "gemini", available: true }]
      : [];
  }

  /**
   * Build enrichment prompt
   */
  buildEnrichmentPrompt(email, name = null, linkedinUrl = null) {
    const domain = email.split("@")[1];

    let prompt = `Research the company for this business email: ${email}\n`;

    if (domain) {
      prompt += `Company domain: ${domain}\n`;
    }

    if (name) {
      prompt += `Contact name: ${name}\n`;
    }

    if (linkedinUrl) {
      prompt += `LinkedIn profile: ${linkedinUrl}\n`;
    }

    prompt += `
Please provide the following company information in JSON format:
{
  "company_name": "string",
  "domain": "string",
  "industry": "string",
  "employee_count": number (estimate if needed),
  "revenue": number (annual revenue in USD, estimate if needed),
  "funding_stage": "string (seed/series-a/series-b/series-c/ipo/bootstrapped/unknown)",
  "total_funding": number (in USD if available),
  "technologies": ["array", "of", "tech", "stack"],
  "headquarters": "city, country",
  "description": "brief company description",
  "founded_year": number,
  "is_b2b": boolean,
  "target_market": "string (SMB/Mid-Market/Enterprise)",
  "confidence_score": number (0-100, how confident are you in this data?)
}

If you cannot find specific information, make reasonable estimates based on industry standards and clearly indicate the confidence level. For example, a 10-person startup likely has <$1M revenue, while a 100-person SaaS company might have $10-20M revenue.

Return ONLY the JSON object, no additional text.`;

    return prompt;
  }

  /**
   * Call Gemini API for enrichment
   */
  async callGemini(prompt) {
    try {
      const result = await this.geminiService.generateJSON(
        prompt,
        {
          company_name: "string",
          domain: "string",
          industry: "string",
          employee_count: "number",
          revenue: "number",
          funding_stage: "string",
          total_funding: "number",
          technologies: "array",
          headquarters: "string",
          description: "string",
          founded_year: "number",
          is_b2b: "boolean",
          target_market: "string",
          confidence_score: "number",
        },
        {
          model: "pro", // Use Pro for enrichment (complex reasoning)
          taskType: "enrichment",
          temperature: 0.3,
          maxTokens: 1000,
        }
      );

      if (result.json) {
        return this.normalizeGeminiResponse(result.json, result.cost);
      }

      return null;
    } catch (error) {
      logger.error("[AIEnrichment] Gemini API error:", error.message);
      throw error;
    }
  }

  /**
   * Normalize Gemini response to match Apollo format
   */
  normalizeGeminiResponse(parsed, cost) {
    try {
      return {
        organization: {
          name: parsed.company_name,
          website_url: parsed.domain,
          industry: parsed.industry,
          estimated_num_employees: parsed.employee_count,
          annual_revenue: parsed.revenue,
          latest_funding_stage: parsed.funding_stage,
          total_funding: parsed.total_funding,
          technologies: parsed.technologies || [],
          headquarters_location: parsed.headquarters,
          description: parsed.description,
          founded_year: parsed.founded_year,
        },
        enrichment_source: "gemini",
        confidence_score: parsed.confidence_score || 70,
        is_b2b: parsed.is_b2b,
        target_market: parsed.target_market,
        enrichment_cost: cost || this.costs.gemini,
      };
    } catch (error) {
      logger.error("[AIEnrichment] Error normalizing Gemini response:", error.message);
      return null;
    }
  }

  /**
   * Main enrichment method using Gemini
   */
  async enrichPerson(email, name = null, options = {}) {
    const { linkedinUrl = null } = options;

    if (!this.geminiService.initialized) {
      logger.warn("[AIEnrichment] Gemini service not available for enrichment");
      return null;
    }

    const prompt = this.buildEnrichmentPrompt(email, name, linkedinUrl);

    try {
      logger.info(`[AIEnrichment] Enriching ${email} using Gemini`);

      const enrichedData = await this.callGemini(prompt);

      if (enrichedData) {
        // Track statistics
        this.stats.enriched++;
        this.stats.byProvider.gemini++;
        this.stats.totalCost += enrichedData.enrichment_cost || this.costs.gemini;

        // Add metadata
        enrichedData.enrichment_provider = "gemini";
        enrichedData.enriched_at = new Date().toISOString();

        logger.info(
          `[AIEnrichment] Successfully enriched ${email} using Gemini`,
          {
            company: enrichedData.organization?.name,
            employees: enrichedData.organization?.estimated_num_employees,
            confidence: enrichedData.confidence_score,
            cost: enrichedData.enrichment_cost,
          }
        );

        return enrichedData;
      }

      this.stats.failed++;
      logger.warn(`[AIEnrichment] Gemini returned no data for ${email}`);
      return null;
    } catch (error) {
      this.stats.failed++;
      logger.error(`[AIEnrichment] Failed with Gemini:`, error.message);
      return null;
    }
  }

  /**
   * Batch enrichment with rate limiting
   */
  async enrichBatch(users, options = {}) {
    const results = [];
    const batchSize = options.batchSize || 10;
    const delayMs = options.delayMs || 1000;

    logger.info(
      `[AIEnrichment] Starting batch enrichment for ${users.length} users`
    );

    for (let i = 0; i < users.length; i += batchSize) {
      const batch = users.slice(i, i + batchSize);

      const batchPromises = batch.map((user) =>
        this.enrichPerson(user.email, user.name, {
          linkedinUrl: user.linkedin_profile,
        }).catch((error) => {
          logger.error(
            `[AIEnrichment] Batch error for ${user.email}:`,
            error.message
          );
          return null;
        })
      );

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // Rate limiting
      if (i + batchSize < users.length) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }

      logger.info(
        `[AIEnrichment] Processed ${Math.min(i + batchSize, users.length)}/${
          users.length
        } users`
      );
    }

    return results;
  }

  /**
   * Get enrichment statistics
   */
  getStats() {
    return {
      ...this.stats,
      averageCost:
        this.stats.enriched > 0
          ? (this.stats.totalCost / this.stats.enriched).toFixed(6)
          : 0,
      successRate:
        this.stats.enriched + this.stats.failed > 0
          ? (
              (this.stats.enriched /
                (this.stats.enriched + this.stats.failed)) *
              100
            ).toFixed(1)
          : 0,
      provider: "gemini",
      geminiStats: this.geminiService.getStats(),
    };
  }

  /**
   * Estimate cost for enrichment
   */
  estimateCost(userCount, provider = null) {
    // Always use Gemini (only provider now)
    return userCount * this.costs.gemini;
  }
}

module.exports = AIEnrichmentService;
