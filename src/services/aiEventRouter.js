const { getInstance } = require("./geminiService");
const logger = require("../utils/logger");

/**
 * AI Event Router Service
 * 
 * Uses Gemini 1.5 Flash to intelligently classify events and determine
 * optimal routing to destinations based on event content and context.
 */
class AIEventRouter {
  constructor() {
    this.geminiService = getInstance();
    
    if (!this.geminiService.initialized) {
      logger.warn(
        "[AIEventRouter] Gemini service not initialized. Event routing will use default rules."
      );
    }

    this.stats = {
      routed: 0,
      failed: 0,
      byDestination: {},
    };
  }

  /**
   * Classify and route an event
   * @param {object} event - Event data
   * @param {object} options - Routing options
   * @returns {Promise<object>} Routing decision
   */
  async routeEvent(event, options = {}) {
    const {
      availableDestinations = ["mixpanel", "slack", "discord", "attio", "webhook"],
      defaultDestinations = ["mixpanel"],
      context = null,
    } = options;

    if (!this.geminiService.initialized) {
      return this.fallbackRouting(event, defaultDestinations, availableDestinations);
    }

    try {
      const prompt = this.buildRoutingPrompt(event, availableDestinations, context);
      
      const result = await this.geminiService.generateJSON(
        prompt,
        {
          classification: "string (event category/type)",
          priority: "string (low, medium, high, critical)",
          destinations: "array of strings (which destinations should receive this event)",
          reasoning: "string (brief explanation of routing decision)",
          shouldTransform: "boolean (whether event needs transformation)",
          transformationHints: "object (optional hints for data transformation)",
        },
        {
          model: "flash", // Use Flash for fast event classification
          taskType: "classification",
          temperature: 0.2,
          maxTokens: 500,
        }
      );

      if (result.json) {
        const routing = {
          classification: result.json.classification || "general",
          priority: result.json.priority || "medium",
          destinations: result.json.destinations || defaultDestinations,
          reasoning: result.json.reasoning || null,
          shouldTransform: result.json.shouldTransform || false,
          transformationHints: result.json.transformationHints || null,
        };

        // Validate destinations against available ones
        routing.destinations = routing.destinations.filter((dest) =>
          availableDestinations.includes(dest)
        );

        // Ensure at least one destination
        if (routing.destinations.length === 0) {
          routing.destinations = defaultDestinations;
        }

        // Update statistics
        this.stats.routed++;
        routing.destinations.forEach((dest) => {
          this.stats.byDestination[dest] = (this.stats.byDestination[dest] || 0) + 1;
        });

        logger.debug(
          `[AIEventRouter] Routed event to: ${routing.destinations.join(", ")} (${routing.classification})`
        );

        return routing;
      }

      return this.fallbackRouting(event, defaultDestinations);
    } catch (error) {
      this.stats.failed++;
      logger.error("[AIEventRouter] Error routing event:", error.message);
      return this.fallbackRouting(event, defaultDestinations);
    }
  }

  /**
   * Build routing prompt
   */
  buildRoutingPrompt(event, availableDestinations, context) {
    const eventType = event.event || event.event_type || "unknown";
    const properties = event.properties || {};
    const userId = event.userId || event.user_id || "unknown";

    let prompt = `Analyze this event and determine the best routing strategy.

Event Type: ${eventType}
User ID: ${userId}
Properties: ${JSON.stringify(properties, null, 2)}

Available Destinations: ${availableDestinations.join(", ")}

Destination Descriptions:
- mixpanel: Analytics platform for tracking user behavior and events
- slack: Real-time notifications for important events (signups, payments, errors)
- discord: Real-time notifications for important events via Discord webhooks (alternative to Slack)
- attio: CRM system for customer data and lead management
- webhook: Custom integrations and external systems

Please determine:
1. Event classification (e.g., "user_signup", "payment", "error", "engagement", "general")
2. Priority level (low, medium, high, critical)
3. Which destinations should receive this event and why
4. Whether the event needs transformation before routing
5. Any transformation hints (field mappings, data normalization needs)

Consider:
- Critical events (signups, payments, errors) should go to Slack or Discord
- User behavior events should go to Mixpanel
- Lead/customer data should go to Attio
- High-priority events may need multiple destinations`;

    if (context) {
      prompt += `\n\nContext: ${context}`;
    }

    return prompt;
  }

  /**
   * Fallback routing using simple rules
   */
  fallbackRouting(event, defaultDestinations, availableDestinations = ["mixpanel", "slack", "discord", "attio", "webhook"]) {
    const eventType = (event.event || event.event_type || "").toLowerCase();
    
    const destinations = [...defaultDestinations];
    
    // Add Slack or Discord for important events
    if (
      eventType.includes("signup") ||
      eventType.includes("payment") ||
      eventType.includes("error") ||
      eventType.includes("critical")
    ) {
      // Prefer Discord if available, otherwise Slack
      if (availableDestinations.includes("discord") && !destinations.includes("discord")) {
        destinations.push("discord");
      } else if (availableDestinations.includes("slack") && !destinations.includes("slack")) {
        destinations.push("slack");
      }
    }

    // Add Attio for lead/customer events
    if (
      eventType.includes("lead") ||
      eventType.includes("customer") ||
      eventType.includes("contact")
    ) {
      if (!destinations.includes("attio")) {
        destinations.push("attio");
      }
    }

    return {
      classification: "general",
      priority: "medium",
      destinations: destinations,
      reasoning: "Fallback routing based on event type",
      shouldTransform: false,
      transformationHints: null,
    };
  }

  /**
   * Batch route multiple events
   */
  async batchRoute(events, options = {}) {
    const results = [];
    const batchSize = options.batchSize || 20;
    const delayMs = options.delayMs || 100;

    for (let i = 0; i < events.length; i += batchSize) {
      const batch = events.slice(i, i + batchSize);

      const batchPromises = batch.map((event) =>
        this.routeEvent(event, options).catch((error) => {
          logger.error("[AIEventRouter] Batch routing error:", error.message);
          return this.fallbackRouting(event, options.defaultDestinations || ["mixpanel"]);
        })
      );

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      if (i + batchSize < events.length) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    return results;
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      ...this.stats,
      successRate:
        this.stats.routed + this.stats.failed > 0
          ? (
              (this.stats.routed /
                (this.stats.routed + this.stats.failed)) *
              100
            ).toFixed(1)
          : 0,
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      routed: 0,
      failed: 0,
      byDestination: {},
    };
  }
}

// Singleton instance
let instance = null;

function getInstance() {
  if (!instance) {
    instance = new AIEventRouter();
  }
  return instance;
}

module.exports = {
  AIEventRouter,
  getInstance,
};
