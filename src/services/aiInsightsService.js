const { getInstance } = require("./geminiService");
const logger = require("../utils/logger");
const { query } = require("../utils/db");

/**
 * AI Insights Service
 * 
 * Uses Gemini 1.5 Flash to generate automated insights, trend analysis,
 * anomaly detection, and recommendations from data.
 */
class AIInsightsService {
  constructor() {
    this.geminiService = getInstance();
    
    if (!this.geminiService.initialized) {
      logger.warn(
        "[AIInsights] Gemini service not initialized. Insights generation will be limited."
      );
    }

    this.stats = {
      insightsGenerated: 0,
      failed: 0,
      byType: {
        trends: 0,
        anomalies: 0,
        recommendations: 0,
        reports: 0,
      },
    };
  }

  /**
   * Generate insights from data
   * @param {object} data - Data to analyze
   * @param {object} options - Analysis options
   * @returns {Promise<object>} Generated insights
   */
  async generateInsights(data, options = {}) {
    const {
      insightType = "general", // "trends", "anomalies", "recommendations", "general"
      timeRange = null,
      context = null,
    } = options;

    if (!this.geminiService.initialized) {
      return this.fallbackInsights(data, insightType);
    }

    try {
      const prompt = this.buildInsightsPrompt(data, insightType, timeRange, context);
      
      const result = await this.geminiService.generateJSON(
        prompt,
        {
          summary: "string (executive summary of insights)",
          keyFindings: "array of strings (main findings)",
          trends: "array of objects with {trend, direction, impact, timeframe}",
          anomalies: "array of objects with {anomaly, severity, explanation, recommendation}",
          recommendations: "array of objects with {recommendation, priority, impact, action}",
          metrics: "object (key metrics and their values)",
          confidence: "number (0-100, confidence in insights)",
        },
        {
          model: "flash", // Use Flash for cost-effective insights generation
          taskType: "insights",
          temperature: 0.3,
          maxTokens: 2000,
        }
      );

      if (result.json) {
        const insights = {
          type: insightType,
          generatedAt: new Date().toISOString(),
          summary: result.json.summary || "",
          keyFindings: result.json.keyFindings || [],
          trends: result.json.trends || [],
          anomalies: result.json.anomalies || [],
          recommendations: result.json.recommendations || [],
          metrics: result.json.metrics || {},
          confidence: result.json.confidence || 70,
        };

        // Update statistics
        this.stats.insightsGenerated++;
        this.stats.byType[insightType] = (this.stats.byType[insightType] || 0) + 1;
        if (insights.trends.length > 0) this.stats.byType.trends++;
        if (insights.anomalies.length > 0) this.stats.byType.anomalies++;
        if (insights.recommendations.length > 0) this.stats.byType.recommendations++;

        logger.debug(`[AIInsights] Generated ${insightType} insights`);

        return insights;
      }

      return this.fallbackInsights(data, insightType);
    } catch (error) {
      this.stats.failed++;
      logger.error("[AIInsights] Error generating insights:", error.message);
      return this.fallbackInsights(data, insightType);
    }
  }

  /**
   * Build insights prompt
   */
  buildInsightsPrompt(data, insightType, timeRange, context) {
    let prompt = `Analyze the following data and generate ${insightType} insights.

Data:
${JSON.stringify(data, null, 2)}`;

    if (timeRange) {
      prompt += `\n\nTime Range: ${timeRange}`;
    }

    if (context) {
      prompt += `\n\nContext: ${context}`;
    }

    prompt += `\n\nPlease provide:
1. Executive summary of key insights
2. Key findings (most important discoveries)
3. Trends (patterns over time with direction and impact)
4. Anomalies (unusual patterns or outliers with severity and explanations)
5. Recommendations (actionable suggestions with priority and expected impact)
6. Key metrics (important numbers and their significance)
7. Confidence level (0-100) in your analysis

Focus on actionable, data-driven insights that can drive business decisions.`;

    return prompt;
  }

  /**
   * Fallback insights (basic analysis)
   */
  fallbackInsights(data, insightType) {
    return {
      type: insightType,
      generatedAt: new Date().toISOString(),
      summary: "Basic analysis completed",
      keyFindings: ["Data analyzed using fallback method"],
      trends: [],
      anomalies: [],
      recommendations: ["Enable Gemini AI for more detailed insights"],
      metrics: {},
      confidence: 50,
    };
  }

  /**
   * Generate weekly/monthly report
   * @param {string} period - "weekly" or "monthly"
   * @param {object} options - Report options
   * @returns {Promise<object>} Generated report
   */
  async generateReport(period = "weekly", options = {}) {
    try {
      // Fetch relevant data from database
      const data = await this.fetchReportData(period, options);

      const insights = await this.generateInsights(data, {
        insightType: "reports",
        timeRange: period,
        context: `Generate a comprehensive ${period} report`,
      });

      return {
        period,
        generatedAt: new Date().toISOString(),
        ...insights,
        dataSummary: {
          totalRecords: Array.isArray(data) ? data.length : 0,
          dateRange: this.getDateRange(period),
        },
      };
    } catch (error) {
      logger.error(`[AIInsights] Error generating ${period} report:`, error.message);
      throw error;
    }
  }

  /**
   * Fetch data for report
   */
  async fetchReportData(period, options = {}) {
    const { namespace = "playmaker", limit = 1000 } = options;
    
    try {
      // Get recent events
      const days = period === "weekly" ? 7 : 30;
      const eventsResult = await query(
        `SELECT event_type, platform, COUNT(*) as count, 
         DATE(created_at) as date
         FROM event_source
         WHERE created_at >= NOW() - INTERVAL '${days} days'
         GROUP BY event_type, platform, DATE(created_at)
         ORDER BY date DESC
         LIMIT $1`,
        [limit]
      );

      // Get user statistics
      const usersResult = await query(
        `SELECT 
         COUNT(*) as total_users,
         COUNT(CASE WHEN apollo_enriched_at IS NOT NULL THEN 1 END) as enriched_users,
         AVG(lead_score) as avg_lead_score,
         COUNT(CASE WHEN lead_grade = 'A+' THEN 1 END) as grade_a_plus,
         COUNT(CASE WHEN lead_grade = 'A' THEN 1 END) as grade_a
         FROM ${namespace}_user_source
         WHERE created_at >= NOW() - INTERVAL '${days} days'`
      );

      return {
        events: eventsResult.rows,
        users: usersResult.rows[0] || {},
        period,
        days,
      };
    } catch (error) {
      logger.error("[AIInsights] Error fetching report data:", error.message);
      return { events: [], users: {}, period, days: period === "weekly" ? 7 : 30 };
    }
  }

  /**
   * Get date range for period
   */
  getDateRange(period) {
    const now = new Date();
    const start = new Date();
    
    if (period === "weekly") {
      start.setDate(now.getDate() - 7);
    } else {
      start.setMonth(now.getMonth() - 1);
    }

    return {
      start: start.toISOString(),
      end: now.toISOString(),
    };
  }

  /**
   * Detect anomalies in data
   * @param {object} data - Data to analyze
   * @returns {Promise<object>} Anomaly detection results
   */
  async detectAnomalies(data) {
    const insights = await this.generateInsights(data, {
      insightType: "anomalies",
    });

    return {
      anomalies: insights.anomalies || [],
      summary: insights.summary || "",
      confidence: insights.confidence || 70,
    };
  }

  /**
   * Analyze trends
   * @param {object} data - Time series data
   * @returns {Promise<object>} Trend analysis
   */
  async analyzeTrends(data) {
    const insights = await this.generateInsights(data, {
      insightType: "trends",
    });

    return {
      trends: insights.trends || [],
      summary: insights.summary || "",
      keyFindings: insights.keyFindings || [],
    };
  }

  /**
   * Get recommendations
   * @param {object} data - Current state data
   * @returns {Promise<object>} Recommendations
   */
  async getRecommendations(data) {
    const insights = await this.generateInsights(data, {
      insightType: "recommendations",
    });

    return {
      recommendations: insights.recommendations || [],
      summary: insights.summary || "",
      priority: this.prioritizeRecommendations(insights.recommendations || []),
    };
  }

  /**
   * Prioritize recommendations
   */
  prioritizeRecommendations(recommendations) {
    return recommendations
      .sort((a, b) => {
        const priorityOrder = { high: 3, medium: 2, low: 1 };
        return (priorityOrder[b.priority] || 0) - (priorityOrder[a.priority] || 0);
      })
      .slice(0, 5); // Top 5 recommendations
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      ...this.stats,
      successRate:
        this.stats.insightsGenerated + this.stats.failed > 0
          ? (
              (this.stats.insightsGenerated /
                (this.stats.insightsGenerated + this.stats.failed)) *
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
      insightsGenerated: 0,
      failed: 0,
      byType: {
        trends: 0,
        anomalies: 0,
        recommendations: 0,
        reports: 0,
      },
    };
  }
}

// Singleton instance
let instance = null;

function getInstance() {
  if (!instance) {
    instance = new AIInsightsService();
  }
  return instance;
}

module.exports = {
  AIInsightsService,
  getInstance,
};
