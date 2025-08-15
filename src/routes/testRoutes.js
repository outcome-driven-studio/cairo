const express = require("express");
const router = express.Router();
const logger = require("../utils/logger");
const ApolloService = require("../services/apolloService");
const HunterService = require("../services/hunterService");
const EnrichmentService = require("../services/enrichmentService");

class TestRoutes {
  constructor() {
    // Initialize Apollo service if API key is available
    if (process.env.APOLLO_API_KEY) {
      this.apolloService = new ApolloService(process.env.APOLLO_API_KEY);
    }
    // Initialize Hunter service if API key is available
    if (process.env.HUNTER_API_KEY) {
      this.hunterService = new HunterService(process.env.HUNTER_API_KEY);
    }
    // Initialize enrichment service (handles both)
    this.enrichmentService = new EnrichmentService();
  }

  /**
   * Test Apollo enrichment endpoint
   * POST /api/test/apollo
   */
  async testApollo(req, res) {
    try {
      // Check if Apollo service is initialized
      if (!this.apolloService) {
        return res.status(503).json({
          success: false,
          error:
            "Apollo service not available. Check APOLLO_API_KEY environment variable.",
        });
      }

      // Get test parameters from request body or use defaults
      const {
        email = "tim@apollo.io", // Default to Apollo CEO
        name = null,
        companyDomain = null,
        testCompany = false,
      } = req.body;

      logger.info(`[TestRoutes] Testing Apollo enrichment for: ${email}`);

      const results = {
        timestamp: new Date().toISOString(),
        testEmail: email,
        personEnrichment: null,
        companyEnrichment: null,
        stats: null,
        credits: null,
      };

      // Test person enrichment
      try {
        const startTime = Date.now();
        const personData = await this.apolloService.enrichPerson(email, name);
        const duration = Date.now() - startTime;

        if (personData) {
          results.personEnrichment = {
            success: true,
            duration: `${duration}ms`,
            data: {
              name: personData.name,
              title: personData.title,
              company: personData.company,
              company_size: personData.company_size,
              company_revenue: personData.company_revenue_printed,
              company_funding_stage: personData.company_funding_stage,
              company_headcount_range: personData.company_headcount_range,
              company_arr_range: personData.company_arr_range,
              linkedin_url: personData.linkedin_url,
              hasICPData: !!(
                personData.company_size ||
                personData.company_revenue ||
                personData.company_funding_stage
              ),
            },
          };

          // If we got company domain from person data, optionally test company enrichment
          if (testCompany && personData.company_domain) {
            try {
              const companyStartTime = Date.now();
              const companyData = await this.apolloService.enrichCompany(
                personData.company_domain
              );
              const companyDuration = Date.now() - companyStartTime;

              if (companyData) {
                results.companyEnrichment = {
                  success: true,
                  duration: `${companyDuration}ms`,
                  domain: personData.company_domain,
                  data: {
                    name: companyData.name,
                    size: companyData.size,
                    industry: companyData.industry,
                    revenue: companyData.revenue,
                    funding_stage: companyData.funding_stage,
                    headcount_range: companyData.headcount_range,
                    arr_range: companyData.arr_range,
                  },
                };
              }
            } catch (companyError) {
              results.companyEnrichment = {
                success: false,
                error: companyError.message,
              };
            }
          }
        } else {
          results.personEnrichment = {
            success: false,
            duration: `${duration}ms`,
            message:
              "No data found (person not in Apollo database or insufficient credits)",
          };
        }
      } catch (personError) {
        // Check for specific error types
        let errorMessage = personError.message;
        let errorType = "unknown";

        if (personError.message?.includes("INSUFFICIENT CREDITS")) {
          errorType = "insufficient_credits";
          errorMessage =
            "Apollo account has insufficient credits. Please add more credits at https://app.apollo.io/#/settings/plans/upgrade";
        } else if (personError.message?.includes("Invalid API key")) {
          errorType = "auth_error";
          errorMessage = "Invalid Apollo API key";
        }

        results.personEnrichment = {
          success: false,
          error: errorMessage,
          errorType: errorType,
        };
      }

      // Test company enrichment directly if domain provided
      if (companyDomain && !results.companyEnrichment) {
        try {
          const companyStartTime = Date.now();
          const companyData = await this.apolloService.enrichCompany(
            companyDomain
          );
          const companyDuration = Date.now() - companyStartTime;

          if (companyData) {
            results.companyEnrichment = {
              success: true,
              duration: `${companyDuration}ms`,
              domain: companyDomain,
              data: companyData,
            };
          } else {
            results.companyEnrichment = {
              success: false,
              duration: `${companyDuration}ms`,
              message: "No company data found",
            };
          }
        } catch (companyError) {
          results.companyEnrichment = {
            success: false,
            error: companyError.message,
          };
        }
      }

      // Get Apollo service stats
      results.stats = this.apolloService.getStats();

      // Get actual usage stats and credit status from Apollo
      try {
        const creditCheck = await this.apolloService.checkCredits();
        const usageStats = await this.apolloService.getUsageStats();

        results.credits = {
          hasCredits: creditCheck.hasCredits,
          status: creditCheck.hasCredits
            ? "available"
            : creditCheck.hasCredits === false
            ? "insufficient"
            : "unknown",
          message: creditCheck.message,
          error: creditCheck.error,
        };

        // Add rate limit information if available
        if (usageStats) {
          results.rateLimits = {
            peopleMatch: usageStats.rateLimits.peopleMatch,
            orgEnrich: usageStats.rateLimits.orgEnrich,
          };

          // Check if we're close to rate limits
          if (usageStats.rateLimits.peopleMatch) {
            const minuteLimit = usageStats.rateLimits.peopleMatch.minute;
            if (minuteLimit && minuteLimit.left_over < 10) {
              results.rateLimits.warning =
                "Approaching rate limit for person enrichment";
            }
          }
        }
      } catch (creditError) {
        // Fallback to guessing based on enrichment results
        if (results.stats.failed > 0 && results.stats.enriched === 0) {
          results.credits = {
            status: "insufficient",
            message: "No enrichments succeeded. Account likely out of credits.",
            action:
              "Visit https://app.apollo.io/#/settings/plans/upgrade to add credits",
          };
        } else if (results.stats.enriched > 0) {
          results.credits = {
            status: "available",
            message: "Credits are available and working",
          };
        } else {
          results.credits = {
            status: "unknown",
            message: "Unable to determine credit status",
            error: creditError.message,
          };
        }
      }

      // Return results
      res.json({
        success: true,
        results,
      });
    } catch (error) {
      logger.error("[TestRoutes] Apollo test failed:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Test Apollo usage stats and credit status
   * GET /api/test/apollo/usage
   */
  async testApolloUsage(req, res) {
    try {
      // Check if Apollo service is initialized
      if (!this.apolloService) {
        return res.status(503).json({
          success: false,
          error:
            "Apollo service not available. Check APOLLO_API_KEY environment variable.",
        });
      }

      logger.info("[TestRoutes] Checking Apollo usage stats and credits");

      const results = {
        timestamp: new Date().toISOString(),
        usageStats: null,
        creditCheck: null,
        rateLimitStatus: {},
        recommendations: [],
      };

      // Get usage statistics
      try {
        const usageStats = await this.apolloService.getUsageStats();
        if (usageStats) {
          results.usageStats = {
            success: true,
            rateLimits: usageStats.rateLimits,
            summary: {},
          };

          // Summarize key endpoints
          if (usageStats.rateLimits.peopleMatch) {
            const pm = usageStats.rateLimits.peopleMatch;
            results.usageStats.summary.personEnrichment = {
              minute: `${pm.minute.consumed}/${pm.minute.limit} (${pm.minute.left_over} left)`,
              hour: `${pm.hour.consumed}/${pm.hour.limit} (${pm.hour.left_over} left)`,
              day: `${pm.day.consumed}/${pm.day.limit} (${pm.day.left_over} left)`,
              percentUsedToday:
                Math.round((pm.day.consumed / pm.day.limit) * 100) + "%",
            };

            // Check rate limit status
            if (pm.minute.left_over === 0) {
              results.rateLimitStatus.status = "rate_limited";
              results.rateLimitStatus.message =
                "Minute rate limit reached. Wait 1 minute.";
              results.recommendations.push("⏸️ Pause enrichment for 1 minute");
            } else if (pm.minute.left_over < 10) {
              results.rateLimitStatus.status = "warning";
              results.rateLimitStatus.message = "Approaching minute rate limit";
              results.recommendations.push(
                "⚠️ Slow down enrichment to avoid rate limiting"
              );
            } else {
              results.rateLimitStatus.status = "ok";
              results.rateLimitStatus.message = "Rate limits OK";
            }
          }

          if (usageStats.rateLimits.orgEnrich) {
            const oe = usageStats.rateLimits.orgEnrich;
            results.usageStats.summary.companyEnrichment = {
              minute: `${oe.minute.consumed}/${oe.minute.limit} (${oe.minute.left_over} left)`,
              hour: `${oe.hour.consumed}/${oe.hour.limit} (${oe.hour.left_over} left)`,
              day: `${oe.day.consumed}/${oe.day.limit} (${oe.day.left_over} left)`,
              percentUsedToday:
                Math.round((oe.day.consumed / oe.day.limit) * 100) + "%",
            };
          }
        } else {
          results.usageStats = {
            success: false,
            error: "Failed to retrieve usage stats",
          };
        }
      } catch (usageError) {
        results.usageStats = {
          success: false,
          error: usageError.message,
        };
      }

      // Check credit status
      try {
        const creditCheck = await this.apolloService.checkCredits();
        results.creditCheck = creditCheck;

        if (creditCheck.hasCredits === false) {
          results.recommendations.push(
            "💳 Add export credits to your Apollo account"
          );
          results.recommendations.push(
            "🔗 Visit: https://app.apollo.io/#/settings/plans/upgrade"
          );
        } else if (creditCheck.hasCredits === true) {
          results.recommendations.push(
            "✅ Export credits available - enrichment should work"
          );
        }
      } catch (creditError) {
        results.creditCheck = {
          hasCredits: null,
          message: "Failed to check credit status",
          error: creditError.message,
        };
      }

      // Overall status
      results.overallStatus = {
        canEnrich:
          results.creditCheck?.hasCredits === true &&
          results.rateLimitStatus?.status !== "rate_limited",
        message:
          results.creditCheck?.hasCredits === false
            ? "Cannot enrich - no export credits"
            : results.rateLimitStatus?.status === "rate_limited"
            ? "Cannot enrich - rate limited"
            : results.creditCheck?.hasCredits === true
            ? "Ready to enrich"
            : "Status unclear - try a test enrichment",
      };

      res.json({
        success: true,
        results,
      });
    } catch (error) {
      logger.error("[TestRoutes] Apollo usage test failed:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Test Hunter enrichment
   * POST /api/test/hunter
   */
  async testHunter(req, res) {
    try {
      // Check if Hunter service is initialized
      if (!this.hunterService) {
        return res.status(503).json({
          success: false,
          error:
            "Hunter service not available. Check HUNTER_API_KEY environment variable.",
        });
      }

      // Get test parameters from request body or use defaults
      const {
        email = "francois@hunter.io", // Default to Hunter CEO
      } = req.body;

      logger.info(`[TestRoutes] Testing Hunter enrichment for: ${email}`);

      const results = {
        timestamp: new Date().toISOString(),
        testEmail: email,
        personEnrichment: null,
        credits: null,
      };

      // Test person enrichment
      try {
        const startTime = Date.now();
        const personData = await this.hunterService.enrichPerson(email);
        const duration = Date.now() - startTime;

        if (personData) {
          results.personEnrichment = {
            success: true,
            duration: `${duration}ms`,
            data: {
              name: personData.full_name,
              title: personData.title,
              company: personData.company_name,
              company_size: personData.company_size,
              company_headcount_range: personData.company_headcount_range,
              company_industry: personData.company_industry,
              company_founded_year: personData.company_founded_year,
              linkedin_url: personData.linkedin_url,
              hasICPData: !!personData.company_size,
            },
          };
        } else {
          results.personEnrichment = {
            success: false,
            duration: `${duration}ms`,
            message:
              "No data found (person not in Hunter database or insufficient credits)",
          };
        }
      } catch (personError) {
        results.personEnrichment = {
          success: false,
          error: personError.message,
        };
      }

      // Check Hunter credits
      try {
        const creditCheck = await this.hunterService.checkCredits();
        results.credits = creditCheck;
      } catch (creditError) {
        results.credits = {
          available: false,
          error: creditError.message,
        };
      }

      res.json({
        success: true,
        results,
      });
    } catch (error) {
      logger.error("[TestRoutes] Hunter test failed:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Test enrichment with fallback
   * POST /api/test/enrichment
   */
  async testEnrichment(req, res) {
    try {
      const {
        email = "test@example.com",
        forceHunter = false,
        skipApollo = false,
      } = req.body;

      logger.info(`[TestRoutes] Testing enrichment for: ${email}`);

      const results = {
        timestamp: new Date().toISOString(),
        testEmail: email,
        options: { forceHunter, skipApollo },
        enrichmentResult: null,
        credits: {},
        stats: null,
      };

      // Check credits for all services
      try {
        const credits = await this.enrichmentService.checkCredits();
        results.credits = credits;
      } catch (creditError) {
        results.credits = { error: creditError.message };
      }

      // Test enrichment
      try {
        const startTime = Date.now();
        const enrichmentResult = await this.enrichmentService.enrichUser(
          { email, id: null },
          { forceHunter, skipApollo, updateDb: false }
        );
        const duration = Date.now() - startTime;

        results.enrichmentResult = {
          success: enrichmentResult.success,
          source: enrichmentResult.source,
          duration: `${duration}ms`,
          hasData: enrichmentResult.data
            ? Object.keys(enrichmentResult.data).length > 0
            : false,
        };

        if (enrichmentResult.data) {
          results.enrichmentResult.sample = {
            name: enrichmentResult.data.full_name || enrichmentResult.data.name,
            company: enrichmentResult.data.company_name,
            companySize:
              enrichmentResult.data.company_size ||
              enrichmentResult.data.company_employee_count,
            industry: enrichmentResult.data.company_industry,
          };
        }
      } catch (enrichError) {
        results.enrichmentResult = {
          success: false,
          error: enrichError.message,
        };
      }

      // Get service stats
      results.stats = this.enrichmentService.getStats();

      res.json({
        success: true,
        results,
      });
    } catch (error) {
      logger.error("[TestRoutes] Enrichment test failed:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Test database connection
   * GET /api/test/database
   */
  async testDatabase(req, res) {
    try {
      const { query } = require("../utils/db");

      // Test basic query
      const result = await query(
        "SELECT NOW() as current_time, version() as pg_version"
      );

      // Test tables exist
      const tables = await query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
        ORDER BY table_name
      `);

      res.json({
        success: true,
        database: {
          connected: true,
          currentTime: result.rows[0]?.current_time,
          version: result.rows[0]?.pg_version,
          tables: tables.rows.map((t) => t.table_name),
        },
      });
    } catch (error) {
      logger.error("[TestRoutes] Database test failed:", error);
      res.status(500).json({
        success: false,
        database: {
          connected: false,
          error: error.message,
        },
      });
    }
  }

  /**
   * Test all integrations
   * GET /api/test/health
   */
  async testHealth(req, res) {
    const health = {
      timestamp: new Date().toISOString(),
      services: {},
    };

    // Test Database
    try {
      const { query } = require("../utils/db");
      await query("SELECT 1");
      health.services.database = { status: "healthy" };
    } catch (error) {
      health.services.database = { status: "unhealthy", error: error.message };
    }

    // Test Apollo
    health.services.apollo = {
      status: this.apolloService ? "configured" : "not_configured",
      hasApiKey: !!process.env.APOLLO_API_KEY,
    };

    // Test Hunter
    health.services.hunter = {
      status: this.hunterService ? "configured" : "not_configured",
      hasApiKey: !!process.env.HUNTER_API_KEY,
    };

    // Test Attio
    health.services.attio = {
      status: process.env.ATTIO_API_KEY ? "configured" : "not_configured",
      hasApiKey: !!process.env.ATTIO_API_KEY,
    };

    // Test Mixpanel
    health.services.mixpanel = {
      status: process.env.MIXPANEL_PROJECT_TOKEN
        ? "configured"
        : "not_configured",
      hasToken: !!process.env.MIXPANEL_PROJECT_TOKEN,
    };

    // Test Lemlist
    health.services.lemlist = {
      status: process.env.LEMLIST_API_KEY ? "configured" : "not_configured",
      hasApiKey: !!process.env.LEMLIST_API_KEY,
    };

    // Test Smartlead
    health.services.smartlead = {
      status: process.env.SMARTLEAD_API_KEY ? "configured" : "not_configured",
      hasApiKey: !!process.env.SMARTLEAD_API_KEY,
    };

    // Overall health
    const allHealthy = Object.values(health.services).every(
      (s) => s.status === "healthy" || s.status === "configured"
    );

    res.status(allHealthy ? 200 : 503).json({
      success: allHealthy,
      health,
    });
  }

  setupRoutes() {
    const router = express.Router();

    // Apollo test endpoints
    router.post("/apollo", this.testApollo.bind(this));
    router.get("/apollo/usage", this.testApolloUsage.bind(this));

    // Hunter test endpoint
    router.post("/hunter", this.testHunter.bind(this));

    // Enrichment test endpoint (with fallback)
    router.post("/enrichment", this.testEnrichment.bind(this));

    // Database test endpoint
    router.get("/database", this.testDatabase.bind(this));

    // Overall health check
    router.get("/health", this.testHealth.bind(this));

    return router;
  }
}

module.exports = TestRoutes;
