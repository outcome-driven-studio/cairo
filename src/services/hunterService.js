const axios = require("axios");
const logger = require("../utils/logger");

class HunterService {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = "https://api.hunter.io/v2";
    this.stats = {
      enriched: 0,
      failed: 0,
      skipped: 0,
    };

    logger.info(
      `[Hunter] Service initialized with API key: ${
        apiKey ? apiKey.substring(0, 10) + "..." : "Not provided"
      }`
    );
  }

  /**
   * Rate-limited request wrapper
   */
  async makeRequest(url, method = "GET") {
    try {
      const response = await axios({
        method,
        url,
        headers: {
          Accept: "application/json",
        },
        timeout: 10000,
      });

      return response.data;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Enrich a person's data using email
   */
  async enrichPerson(email, name = null, companyName = null) {
    try {
      // First try to get person data
      const personUrl = `${this.baseUrl}/people/find?email=${encodeURIComponent(
        email
      )}&api_key=${this.apiKey}`;

      logger.debug(`[Hunter] Enriching person: ${email}`);

      const personResponse = await this.makeRequest(personUrl);

      if (!personResponse?.data) {
        logger.debug(`[Hunter] No person data found for ${email}`);
        this.stats.skipped++;
        return null;
      }

      const person = personResponse.data;
      const companyDomain = person.employment?.domain;

      // Initialize enriched data with person info
      let enrichedData = {
        // Person details
        email: person.email,
        first_name: person.name?.givenName,
        last_name: person.name?.familyName,
        full_name: person.name?.fullName,
        title: person.employment?.title,
        role: person.employment?.role,
        location: person.location,

        // Company basic info from person
        company_name: person.employment?.name,
        company_domain: companyDomain,

        // Social profiles
        linkedin_url: person.linkedin?.handle
          ? `https://www.linkedin.com/in/${person.linkedin.handle}`
          : null,
        twitter_handle: person.twitter?.handle,

        // Raw data
        raw_person_data: person,
        enriched_at: new Date().toISOString(),
        enrichment_source: "hunter",
      };

      // If we have a company domain, get company details
      if (companyDomain) {
        try {
          const companyUrl = `${
            this.baseUrl
          }/companies/find?domain=${encodeURIComponent(
            companyDomain
          )}&api_key=${this.apiKey}`;

          logger.debug(`[Hunter] Enriching company: ${companyDomain}`);

          const companyResponse = await this.makeRequest(companyUrl);

          if (companyResponse?.data) {
            const company = companyResponse.data;

            // Add company data
            enrichedData = {
              ...enrichedData,

              // Company details
              company_name: company.name || enrichedData.company_name,
              company_legal_name: company.legalName,
              company_domain: company.domain,
              company_description: company.description,
              company_founded_year: company.foundedYear,
              company_type: company.type,

              // Company size - this is what we need for ICP!
              company_size: company.metrics?.employees, // e.g., "11-50"
              company_headcount_range: this.mapEmployeeRange(
                company.metrics?.employees
              ),

              // Industry
              company_industry: company.category?.industry,
              company_sector: company.category?.sector,
              company_tags: company.tags,

              // Location
              company_city: company.geo?.city,
              company_state: company.geo?.state,
              company_country: company.geo?.country,

              // Revenue data (when available)
              company_revenue: company.metrics?.annualRevenue,
              company_estimated_revenue:
                company.metrics?.estimatedAnnualRevenue,
              company_raised: company.metrics?.raised, // Total funding raised

              // Social
              company_linkedin: company.linkedin?.handle
                ? `https://www.linkedin.com/company/${company.linkedin.handle}`
                : null,

              // Tech stack
              company_technologies: company.tech,

              // Store complete raw response
              raw_company_data: company,

              // For compatibility with Apollo structure
              organization: {
                name: company.name,
                domain: company.domain,
                estimated_num_employees: this.parseEmployeeCount(
                  company.metrics?.employees
                ),
                annual_revenue:
                  company.metrics?.annualRevenue ||
                  company.metrics?.estimatedAnnualRevenue,
                total_funding: company.metrics?.raised,
                latest_funding_stage: this.inferFundingStage(
                  company.metrics?.raised
                ),
                founded_year: company.foundedYear,
                industry: company.category?.industry,
              },
            };
          }
        } catch (companyError) {
          logger.debug(
            `[Hunter] Could not fetch company data for ${companyDomain}: ${companyError.message}`
          );
          // Not critical - we still have person data
        }
      }

      this.stats.enriched++;
      return enrichedData;
    } catch (error) {
      this.stats.failed++;

      if (error.response) {
        const status = error.response.status;

        if (status === 401) {
          logger.error(
            `[Hunter] Invalid API key - check HUNTER_API_KEY env var`
          );
        } else if (status === 403) {
          logger.error(`[Hunter] Insufficient credits or rate limit reached`);
        } else if (status === 404) {
          logger.debug(`[Hunter] Person not found: ${email}`);
          this.stats.skipped++;
          this.stats.failed--; // Don't count as failed
        } else {
          logger.error(
            `[Hunter] API error ${status} for ${email}:`,
            error.response.data
          );
        }
      } else {
        logger.error(`[Hunter] Network error for ${email}: ${error.message}`);
      }

      return null;
    }
  }

  /**
   * Map Hunter employee range to our standard ranges
   * Hunter format: "11-50", "51-200", etc.
   */
  mapEmployeeRange(hunterRange) {
    if (!hunterRange) return null;

    const rangeMap = {
      "1-10": "1-10",
      "11-50": "11-50",
      "51-200": "51-200",
      "201-500": "201-500",
      "501-1000": "501-1000",
      "1001-5000": "1001-5000",
      "5001-10000": "5000+",
      "10000+": "5000+",
    };

    return rangeMap[hunterRange] || hunterRange;
  }

  /**
   * Parse employee count to get a numeric value (use midpoint of range)
   */
  parseEmployeeCount(hunterRange) {
    if (!hunterRange) return null;

    const rangeMidpoints = {
      "1-10": 5,
      "11-50": 30,
      "51-200": 125,
      "201-500": 350,
      "501-1000": 750,
      "1001-5000": 3000,
      "5001-10000": 7500,
      "10000+": 15000,
    };

    return rangeMidpoints[hunterRange] || null;
  }

  /**
   * Infer funding stage from total raised amount
   * This is a rough estimate based on typical funding amounts
   */
  inferFundingStage(raisedAmount) {
    if (!raisedAmount || raisedAmount === 0) return null;

    // Convert to millions for easier comparison
    const raisedM = raisedAmount / 1000000;

    if (raisedM < 2) return "seed";
    if (raisedM < 10) return "Series A";
    if (raisedM < 30) return "Series B";
    if (raisedM < 60) return "Series C";
    if (raisedM < 100) return "Series D";
    if (raisedM < 200) return "Series E";
    return "Series F+";
  }

  /**
   * Get enrichment statistics
   */
  getStats() {
    return {
      enriched: this.stats.enriched,
      failed: this.stats.failed,
      skipped: this.stats.skipped,
      total: this.stats.enriched + this.stats.failed + this.stats.skipped,
    };
  }

  /**
   * Check API usage/credits
   */
  async checkCredits() {
    try {
      // Hunter provides account info endpoint
      const url = `${this.baseUrl}/account?api_key=${this.apiKey}`;
      const response = await this.makeRequest(url);

      if (response?.data) {
        return {
          available: true,
          requests_used: response.data.requests?.searches?.used || 0,
          requests_available: response.data.requests?.searches?.available || 0,
          reset_date: response.data.reset_date,
        };
      }

      return { available: false, message: "Could not fetch account info" };
    } catch (error) {
      logger.error("[Hunter] Failed to check credits:", error.message);
      return { available: false, error: error.message };
    }
  }
}

module.exports = HunterService;
