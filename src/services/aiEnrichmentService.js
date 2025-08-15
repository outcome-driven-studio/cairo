const axios = require("axios");
const logger = require("../utils/logger");
const { query } = require("../utils/db");

/**
 * AI-based enrichment service using GPT, Claude, or Perplexity
 * Much cheaper than Apollo/Hunter for company data enrichment
 *
 * Cost comparison (per 1000 enrichments):
 * - Apollo: ~$100-200
 * - Hunter: ~$50-100
 * - GPT-4: ~$5-10
 * - Claude: ~$3-8
 * - Perplexity: ~$2-5
 */
class AIEnrichmentService {
  constructor() {
    // Initialize API clients based on available keys
    this.providers = this.initializeProviders();

    // Cost tracking (approximate costs per enrichment in USD)
    this.costs = {
      openai: 0.01, // ~$10 per 1000
      anthropic: 0.008, // ~$8 per 1000
      perplexity: 0.005, // ~$5 per 1000
      apollo: 0.15, // ~$150 per 1000
      hunter: 0.08, // ~$80 per 1000
    };

    // Statistics
    this.stats = {
      enriched: 0,
      failed: 0,
      totalCost: 0,
      byProvider: {
        openai: 0,
        anthropic: 0,
        perplexity: 0,
      },
    };
  }

  /**
   * Initialize available AI providers
   */
  initializeProviders() {
    const providers = [];

    if (process.env.OPENAI_API_KEY) {
      providers.push({
        name: "openai",
        apiKey: process.env.OPENAI_API_KEY,
        model: process.env.OPENAI_MODEL || "gpt-4-turbo-preview",
        baseUrl: "https://api.openai.com/v1/chat/completions",
      });
      logger.info("[AIEnrichment] OpenAI provider initialized");
    }

    if (process.env.ANTHROPIC_API_KEY) {
      providers.push({
        name: "anthropic",
        apiKey: process.env.ANTHROPIC_API_KEY,
        model: process.env.ANTHROPIC_MODEL || "claude-3-sonnet-20240229",
        baseUrl: "https://api.anthropic.com/v1/messages",
      });
      logger.info("[AIEnrichment] Anthropic (Claude) provider initialized");
    }

    if (process.env.PERPLEXITY_API_KEY) {
      providers.push({
        name: "perplexity",
        apiKey: process.env.PERPLEXITY_API_KEY,
        model:
          process.env.PERPLEXITY_MODEL || "llama-3.1-sonar-small-128k-online",
        baseUrl: "https://api.perplexity.ai/chat/completions",
      });
      logger.info("[AIEnrichment] Perplexity provider initialized");
    }

    if (providers.length === 0) {
      logger.warn(
        "[AIEnrichment] No AI providers configured. Add OPENAI_API_KEY, ANTHROPIC_API_KEY, or PERPLEXITY_API_KEY"
      );
    }

    return providers;
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
   * Call OpenAI API
   */
  async callOpenAI(provider, prompt) {
    try {
      const response = await axios.post(
        provider.baseUrl,
        {
          model: provider.model,
          messages: [
            {
              role: "system",
              content:
                "You are a business intelligence assistant specializing in company research and ICP scoring.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          temperature: 0.3,
          max_tokens: 500,
        },
        {
          headers: {
            Authorization: `Bearer ${provider.apiKey}`,
            "Content-Type": "application/json",
          },
        }
      );

      const content = response.data.choices[0].message.content;
      return this.parseAIResponse(content);
    } catch (error) {
      logger.error(
        "[AIEnrichment] OpenAI API error:",
        error.response?.data || error.message
      );
      throw error;
    }
  }

  /**
   * Call Anthropic (Claude) API
   */
  async callAnthropic(provider, prompt) {
    try {
      const response = await axios.post(
        provider.baseUrl,
        {
          model: provider.model,
          messages: [
            {
              role: "user",
              content: prompt,
            },
          ],
          max_tokens: 500,
          temperature: 0.3,
        },
        {
          headers: {
            "x-api-key": provider.apiKey,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
          },
        }
      );

      const content = response.data.content[0].text;
      return this.parseAIResponse(content);
    } catch (error) {
      logger.error(
        "[AIEnrichment] Anthropic API error:",
        error.response?.data || error.message
      );
      throw error;
    }
  }

  /**
   * Call Perplexity API
   */
  async callPerplexity(provider, prompt) {
    try {
      const response = await axios.post(
        provider.baseUrl,
        {
          model: provider.model,
          messages: [
            {
              role: "system",
              content:
                "You are a business intelligence assistant. Provide accurate company information based on current web data.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          temperature: 0.1, // Lower temperature for more factual responses
          max_tokens: 500,
        },
        {
          headers: {
            Authorization: `Bearer ${provider.apiKey}`,
            "Content-Type": "application/json",
          },
        }
      );

      const content = response.data.choices[0].message.content;
      return this.parseAIResponse(content);
    } catch (error) {
      logger.error(
        "[AIEnrichment] Perplexity API error:",
        error.response?.data || error.message
      );
      throw error;
    }
  }

  /**
   * Parse AI response to extract JSON
   */
  parseAIResponse(content) {
    try {
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);

        // Normalize the data structure to match Apollo format
        return {
          organization: {
            name: parsed.company_name,
            website_url: parsed.domain,
            industry: parsed.industry,
            estimated_num_employees: parsed.employee_count,
            annual_revenue: parsed.revenue,
            latest_funding_stage: parsed.funding_stage,
            total_funding: parsed.total_funding,
            technologies: parsed.technologies,
            headquarters_location: parsed.headquarters,
            description: parsed.description,
            founded_year: parsed.founded_year,
          },
          enrichment_source: "ai",
          confidence_score: parsed.confidence_score || 70,
          is_b2b: parsed.is_b2b,
          target_market: parsed.target_market,
        };
      }

      logger.warn("[AIEnrichment] Could not parse JSON from AI response");
      return null;
    } catch (error) {
      logger.error("[AIEnrichment] Error parsing AI response:", error.message);
      return null;
    }
  }

  /**
   * Main enrichment method with fallback chain
   */
  async enrichPerson(email, name = null, options = {}) {
    const { linkedinUrl = null, preferredProvider = null } = options;

    if (this.providers.length === 0) {
      logger.warn("[AIEnrichment] No AI providers available for enrichment");
      return null;
    }

    const prompt = this.buildEnrichmentPrompt(email, name, linkedinUrl);

    // Try preferred provider first if specified
    let providers = [...this.providers];
    if (preferredProvider) {
      providers = providers.sort((a, b) =>
        a.name === preferredProvider ? -1 : b.name === preferredProvider ? 1 : 0
      );
    }

    // Try each provider in order
    for (const provider of providers) {
      try {
        logger.info(`[AIEnrichment] Enriching ${email} using ${provider.name}`);

        let enrichedData = null;

        switch (provider.name) {
          case "openai":
            enrichedData = await this.callOpenAI(provider, prompt);
            break;
          case "anthropic":
            enrichedData = await this.callAnthropic(provider, prompt);
            break;
          case "perplexity":
            enrichedData = await this.callPerplexity(provider, prompt);
            break;
        }

        if (enrichedData) {
          // Track statistics
          this.stats.enriched++;
          this.stats.byProvider[provider.name]++;
          this.stats.totalCost += this.costs[provider.name];

          // Add metadata
          enrichedData.enrichment_provider = provider.name;
          enrichedData.enrichment_cost = this.costs[provider.name];
          enrichedData.enriched_at = new Date().toISOString();

          logger.info(
            `[AIEnrichment] Successfully enriched ${email} using ${provider.name}`,
            {
              company: enrichedData.organization?.name,
              employees: enrichedData.organization?.estimated_num_employees,
              confidence: enrichedData.confidence_score,
              cost: this.costs[provider.name],
            }
          );

          return enrichedData;
        }
      } catch (error) {
        logger.error(
          `[AIEnrichment] Failed with ${provider.name}:`,
          error.message
        );
        continue; // Try next provider
      }
    }

    // All providers failed
    this.stats.failed++;
    logger.warn(`[AIEnrichment] All providers failed for ${email}`);
    return null;
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
          ? (this.stats.totalCost / this.stats.enriched).toFixed(4)
          : 0,
      successRate:
        this.stats.enriched + this.stats.failed > 0
          ? (
              (this.stats.enriched /
                (this.stats.enriched + this.stats.failed)) *
              100
            ).toFixed(1)
          : 0,
    };
  }

  /**
   * Estimate cost for enrichment
   */
  estimateCost(userCount, provider = null) {
    if (provider && this.costs[provider]) {
      return userCount * this.costs[provider];
    }

    // Use cheapest available provider
    const availableProviders = this.providers.map((p) => p.name);
    const cheapestProvider = availableProviders.reduce(
      (min, p) => (this.costs[p] < this.costs[min] ? p : min),
      availableProviders[0]
    );

    return userCount * this.costs[cheapestProvider];
  }
}

module.exports = AIEnrichmentService;
