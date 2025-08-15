const axios = require("axios");
const logger = require("../utils/logger");
const { query } = require("../utils/db");

class ApolloService {
  constructor(apiKey) {
    if (!apiKey) {
      throw new Error("Apollo API key is required");
    }
    this.apiKey = apiKey;
    this.baseUrl = "https://api.apollo.io/api/v1";
    this.headers = {
      "X-Api-Key": apiKey,
      "Content-Type": "application/json",
      "Cache-Control": "no-cache",
    };

    logger.info(
      `[Apollo] Service initialized with API key: ${apiKey.substring(0, 10)}...`
    );

    // Rate limiting: 100 requests per minute
    this.requestQueue = [];
    this.lastRequestTime = 0;
    this.minRequestInterval = 600; // 600ms between requests (100/min)

    // Statistics
    this.stats = {
      enriched: 0,
      failed: 0,
      skipped: 0,
      apiCalls: 0,
    };
  }

  /**
   * Rate limited request wrapper
   */
  async rateLimitedRequest(url, data = null, method = "POST") {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < this.minRequestInterval) {
      const delay = this.minRequestInterval - timeSinceLastRequest;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    this.lastRequestTime = Date.now();
    this.stats.apiCalls++;

    try {
      const config = {
        headers: this.headers,
        timeout: 30000, // 30 second timeout
      };

      let response;
      if (method === "GET") {
        response = await axios.get(url, config);
      } else {
        response = await axios.post(url, data, config);
      }

      return response.data;
    } catch (error) {
      if (error.response?.status === 429) {
        // Rate limited, wait and retry
        logger.warn("Apollo API rate limited, waiting 60 seconds...");
        await new Promise((resolve) => setTimeout(resolve, 60000));
        return this.rateLimitedRequest(url, data, method);
      }
      throw error;
    }
  }

  /**
   * Enrich a person's data using email and/or name
   */
  async enrichPerson(email, name = null, companyName = null) {
    // Build request body with only the search parameters
    const payload = {
      email,
      ...(name && { name }),
      ...(companyName && { organization_name: companyName }),
    };

    try {
      // Build URL with query parameters for reveal settings
      const url = `${this.baseUrl}/people/match?reveal_personal_emails=false&reveal_phone_number=false&email=${email}`;

      logger.debug(`[Apollo] Enriching person: ${email}`);

      const response = await this.rateLimitedRequest(url, payload);

      if (response.person) {
        this.stats.enriched++;
        logger.info(
          `[Apollo] Found data for ${email} - ${response.person.name} at ${response.person.organization?.name}`
        );

        // Extract organization data from person response
        const org = response.person.organization || {};

        // Store ALL the rich data from Apollo
        const enrichedData = {
          // Person fields
          email: response.person.email,
          name: response.person.name,
          first_name: response.person.first_name,
          last_name: response.person.last_name,
          title: response.person.title,
          headline: response.person.headline,
          linkedin_url: response.person.linkedin_url,
          twitter_url: response.person.twitter_url,
          github_url: response.person.github_url,
          facebook_url: response.person.facebook_url,
          photo_url: response.person.photo_url,
          employment_history: response.person.employment_history,
          departments: response.person.departments,
          subdepartments: response.person.subdepartments,
          functions: response.person.functions,
          seniority: response.person.seniority,

          // Location fields
          city: response.person.city,
          state: response.person.state,
          country: response.person.country,

          // Company fields from organization object
          company: org.name,
          company_domain: org.primary_domain || org.domain,
          company_website: org.website_url,
          company_linkedin_url: org.linkedin_url,
          company_twitter_url: org.twitter_url,
          company_facebook_url: org.facebook_url,

          // ICP-critical fields
          company_size: org.estimated_num_employees,
          company_revenue: org.annual_revenue,
          company_revenue_printed: org.annual_revenue_printed,
          company_funding_stage: org.latest_funding_stage,
          company_total_funding: org.total_funding,
          company_total_funding_printed: org.total_funding_printed,
          company_latest_funding_date: org.latest_funding_round_date,

          // Additional company data
          company_industry: org.industry,
          company_industries: org.industries,
          company_keywords: org.keywords,
          company_founded_year: org.founded_year,
          company_employee_count: org.estimated_num_employees,
          company_alexa_ranking: org.alexa_ranking,
          company_technologies: org.technology_names,
          company_current_technologies: org.current_technologies,
          company_funding_events: org.funding_events,

          // Location details
          company_city: org.city,
          company_state: org.state,
          company_country: org.country,
          company_street_address: org.street_address,
          company_postal_code: org.postal_code,
          company_raw_address: org.raw_address,

          // Descriptions
          company_short_description: org.short_description,
          company_seo_description: org.seo_description,

          // Mapped ranges for scoring
          company_headcount_range: this.mapHeadcountRange(
            org.estimated_num_employees
          ),
          company_arr_range: this.mapArrRange(org.annual_revenue),

          // Store complete raw response for future use
          raw_person_data: response.person,
          raw_organization_data: org,
          enriched_at: new Date().toISOString(),
        };

        // Optional: Try to get even more detailed company data
        if (enrichedData.company_domain) {
          logger.debug(
            `[Apollo] Fetching additional company details for: ${enrichedData.company_domain}`
          );
          try {
            const additionalCompanyData = await this.enrichCompany(
              enrichedData.company_domain
            );
            if (additionalCompanyData) {
              // Merge additional data (like departmental_head_count)
              enrichedData.company_departmental_head_count =
                additionalCompanyData.raw_data?.departmental_head_count;
              enrichedData.raw_company_enrichment =
                additionalCompanyData.raw_data;
            }
          } catch (companyError) {
            logger.debug(
              `[Apollo] Could not fetch additional company data for ${enrichedData.company_domain}: ${companyError.message}`
            );
            // Not critical - we already have company data from person response
          }
        }

        return enrichedData;
      } else {
        logger.info(`[Apollo] No person data in Apollo database for ${email}`);
        this.stats.skipped++;
        return null;
      }
    } catch (error) {
      this.stats.failed++;

      if (error.response) {
        const status = error.response.status;
        const errorMessage = error.response?.data?.error || "";
        if (
          status === 402 ||
          (status === 422 && errorMessage.includes("insufficient credits"))
        ) {
          logger.error(
            `[Apollo] INSUFFICIENT CREDITS - Cannot enrich ${email}. Please add more credits to your Apollo account.`
          );
          return null;
        } else if (status === 401) {
          logger.error(
            `[Apollo] Invalid API key - check APOLLO_API_KEY env var`
          );
          return null;
        } else if (status === 404) {
          // This is actually "person not found" not an error
          logger.debug(`[Apollo] Person not in database: ${email}`);
          this.stats.skipped++;
          this.stats.failed--; // Don't count as failed
          return null;
        } else if (status === 422) {
          // Other 422 errors (should be rare now)
          logger.error(`[Apollo] Invalid request format for ${email}`, {
            request: {
              url: error.config?.url,
              payload: payload,
              headers: Object.keys(error.config?.headers || {}),
            },
            response: error.response?.data || "No response data",
          });
          return null;
        } else {
          // Other errors
          logger.error(`[Apollo] API error ${status} for ${email}:`, {
            error: errorMessage || error.response?.data,
          });
          return null;
        }
      } else if (error.request) {
        logger.error(
          `[Apollo] No response received for ${email} - network issue`
        );
        return null;
      } else {
        logger.error(
          `[Apollo] Request setup error for ${email}: ${error.message}`
        );
        return null;
      }
    }
  }

  /**
   * Enrich a company's data
   */
  async enrichCompany(domain) {
    try {
      // Build URL with domain as query parameter for GET request
      const url = `${
        this.baseUrl
      }/organizations/enrich?domain=${encodeURIComponent(domain)}`;

      logger.debug(`[Apollo] Enriching company: ${domain}`);

      const response = await this.rateLimitedRequest(
        url,
        null, // No payload for GET request
        "GET"
      );

      if (response.organization) {
        // Note: Not incrementing stats.enriched here since it's already counted in enrichPerson

        const enrichedData = {
          name: response.organization.name,
          domain: response.organization.primary_domain,
          size: response.organization.estimated_num_employees,
          industry: response.organization.industry,
          revenue: response.organization.annual_revenue,
          funding_stage: this.extractFundingStage(response.organization),
          headcount_range: this.mapHeadcountRange(
            response.organization.estimated_num_employees
          ),
          arr_range: this.mapArrRange(response.organization.annual_revenue),
          raw_data: response.organization,
        };

        return enrichedData;
      } else {
        logger.debug(`[Apollo] No company data found for ${domain}`);
        return null;
      }
    } catch (error) {
      if (error.response) {
        const status = error.response.status;
        const errorMessage = error.response?.data?.error || "";

        if (
          status === 402 ||
          (status === 422 && errorMessage.includes("insufficient credits"))
        ) {
          logger.debug(
            `[Apollo] Insufficient credits for company enrichment: ${domain}`
          );
        } else if (status === 404) {
          logger.debug(`[Apollo] Company not found: ${domain}`);
        } else {
          logger.error(
            `[Apollo] Error enriching company ${domain} (${status}):`,
            errorMessage || error.message
          );
        }
      } else {
        logger.error(
          `[Apollo] Error enriching company ${domain}:`,
          error.message
        );
      }
      // Don't throw, just return null - company enrichment is optional
      return null;
    }
  }

  /**
   * Get Apollo usage statistics and rate limits
   */
  async getUsageStats() {
    try {
      const url = `${this.baseUrl}/usage_stats/api_usage_stats`;

      const response = await this.rateLimitedRequest(
        url,
        {}, // Empty object for POST body
        "POST"
      );

      // Parse the response to find enrichment credit status
      const stats = {
        hasCredits: false,
        creditInfo: null,
        rateLimits: {},
        rawStats: response,
      };

      // Check for people/match endpoint (person enrichment)
      const peopleMatch = response['["api/v1/people", "match"]'];
      if (peopleMatch) {
        stats.rateLimits.peopleMatch = {
          minute: peopleMatch.minute,
          hour: peopleMatch.hour,
          day: peopleMatch.day,
        };
      }

      // Check for organizations/enrich endpoint (company enrichment)
      const orgEnrich = response['["api/v1/organizations", "enrich"]'];
      if (orgEnrich) {
        stats.rateLimits.orgEnrich = {
          minute: orgEnrich.minute,
          hour: orgEnrich.hour,
          day: orgEnrich.day,
        };
      }

      // Note: The usage_stats endpoint shows rate limits but not export credits
      // Export credits are a separate billing feature
      // If we're getting 422 with "insufficient credits", it's about export credits, not rate limits

      return stats;
    } catch (error) {
      logger.error("[Apollo] Failed to get usage stats:", error.message);
      return null;
    }
  }

  /**
   * Check if Apollo account has available credits
   */
  async checkCredits() {
    try {
      // Try to get usage stats first
      const usageStats = await this.getUsageStats();

      // The most reliable way to check export credits is to try a test enrichment
      // Apollo doesn't expose export credit balance via API
      // We'll use a known test email that shouldn't consume credits if already cached
      const testEmail = "nivas@spendflo.com";

      try {
        const result = await this.enrichPerson(testEmail);

        // If we get here without error, we have credits
        return {
          hasCredits: true,
          message: "Credits available",
          usageStats: usageStats,
        };
      } catch (enrichError) {
        if (enrichError.message?.includes("INSUFFICIENT CREDITS")) {
          return {
            hasCredits: false,
            message:
              "No export credits available. Please add credits at https://app.apollo.io/#/settings/plans/upgrade",
            usageStats: usageStats,
          };
        }

        // Other error - might still have credits
        return {
          hasCredits: null,
          message: "Unable to determine credit status",
          error: enrichError.message,
          usageStats: usageStats,
        };
      }
    } catch (error) {
      logger.error("[Apollo] Failed to check credits:", error.message);
      return {
        hasCredits: null,
        message: "Failed to check credit status",
        error: error.message,
      };
    }
  }

  /**
   * Extract funding stage from organization data
   */
  extractFundingStage(org) {
    if (!org) return null;

    // Apollo now provides latest_funding_stage directly
    const lastFunding = org.latest_funding_stage || org.funding_stage;

    if (!lastFunding) return null;

    // Normalize funding stage names
    const stage = lastFunding.toLowerCase();
    if (stage.includes("series a")) return "Series A";
    if (stage.includes("series b")) return "Series B";
    if (stage.includes("series c")) return "Series C";
    if (stage.includes("series d")) return "Series D";
    if (stage.includes("seed")) return "Seed";
    if (stage.includes("pre-seed")) return "Pre-Seed";

    return lastFunding;
  }

  /**
   * Map employee count to our headcount ranges
   */
  mapHeadcountRange(employeeCount) {
    if (!employeeCount) return null;

    const count = parseInt(employeeCount);
    if (count <= 10) return "1-10";
    if (count <= 50) return "11-50";
    if (count <= 250) return "51-250";
    if (count <= 1000) return "251-1000";
    return "1000+";
  }

  /**
   * Map annual revenue to our ARR ranges
   */
  mapArrRange(revenue) {
    if (!revenue) return null;

    // Apollo returns revenue as a number or string like "$1M - $10M"
    let revenueValue;

    if (typeof revenue === "string") {
      // Parse string format
      const match = revenue.match(/\$?(\d+)([MBK])?/);
      if (!match) return null;

      revenueValue = parseInt(match[1]);
      const unit = match[2];

      if (unit === "K") revenueValue *= 1000;
      else if (unit === "M") revenueValue *= 1000000;
      else if (unit === "B") revenueValue *= 1000000000;
    } else {
      revenueValue = revenue;
    }

    // Convert to millions for comparison
    const revenueInMillions = revenueValue / 1000000;

    if (revenueInMillions < 1) return "<1M";
    if (revenueInMillions <= 10) return "1M-10M";
    if (revenueInMillions <= 50) return "10M-50M";
    if (revenueInMillions <= 100) return "50M-100M";
    return "100M+";
  }

  /**
   * Batch enrich multiple users
   */
  async batchEnrichUsers(users, batchSize = 10) {
    const results = [];
    const batches = [];

    // Split into batches
    for (let i = 0; i < users.length; i += batchSize) {
      batches.push(users.slice(i, i + batchSize));
    }

    logger.info(
      `[Apollo] Processing ${users.length} users in ${batches.length} batches`
    );

    for (const [index, batch] of batches.entries()) {
      logger.info(`[Apollo] Processing batch ${index + 1}/${batches.length}`);

      const batchResults = await Promise.all(
        batch.map(async (user) => {
          try {
            logger.debug(
              `[Apollo] Starting enrichment for user ${user.email} (${user.id})`
            );

            const enrichedData = await this.enrichPerson(
              user.email,
              user.name,
              user.company
            );

            if (enrichedData) {
              logger.debug(
                `[Apollo] Got enrichment data for ${user.email}, saving to DB...`
              );
              // Update database with enriched data
              await this.updateUserWithEnrichment(user.id, enrichedData);
              logger.debug(
                `[Apollo] Successfully saved data for ${user.email}`
              );
              return { userId: user.id, success: true, data: enrichedData };
            } else {
              logger.warn(`[Apollo] No data found for user ${user.email}`);
              // Clear apollo_data to indicate no data available
              await this.updateUserWithEnrichment(user.id, null);
              return {
                userId: user.id,
                success: false,
                reason: "No data found",
              };
            }
          } catch (error) {
            logger.error(
              `[Apollo] Failed to enrich user ${user.id}:`,
              error.message
            );
            return { userId: user.id, success: false, error: error.message };
          }
        })
      );

      results.push(...batchResults);

      // Add delay between batches to respect rate limits
      if (index < batches.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }

    return results;
  }

  /**
   * Update user record with Apollo enrichment data
   */
  async updateUserWithEnrichment(userId, enrichedData) {
    try {
      if (enrichedData === null) {
        // If no data found, set apollo_data to empty object to indicate we tried
        await query(
          `UPDATE playmaker_user_source 
           SET apollo_data = '{}',
               apollo_enriched_at = NOW()
           WHERE id = $1`,
          [userId]
        );
        logger.debug(
          `[Apollo] Updated user ${userId} with empty data (no results)`
        );
      } else {
        await query(
          `UPDATE playmaker_user_source 
           SET apollo_data = $1,
               apollo_enriched_at = NOW()
           WHERE id = $2`,
          [JSON.stringify(enrichedData), userId]
        );
        logger.debug(`[Apollo] Updated user ${userId} with enrichment data`);
      }
    } catch (error) {
      logger.error(`[Apollo] Failed to update user ${userId}:`, error.message);
      throw error;
    }
  }

  /**
   * Get enrichment statistics
   */
  getStats() {
    return {
      ...this.stats,
      successRate:
        this.stats.apiCalls > 0
          ? ((this.stats.enriched / this.stats.apiCalls) * 100).toFixed(2) + "%"
          : "0%",
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      enriched: 0,
      failed: 0,
      skipped: 0,
      apiCalls: 0,
    };
  }
}

module.exports = ApolloService;
