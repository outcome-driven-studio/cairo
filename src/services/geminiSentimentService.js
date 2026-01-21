const { getInstance } = require("./geminiService");
const logger = require("../utils/logger");

/**
 * Gemini Sentiment Analysis Service
 * 
 * Replaces keyword-based sentiment analysis with AI-powered context-aware sentiment analysis
 * using Gemini 1.5 Flash for fast, cost-effective processing.
 */
class GeminiSentimentService {
  constructor() {
    this.geminiService = getInstance();
    
    if (!this.geminiService.initialized) {
      logger.warn(
        "[GeminiSentiment] Gemini service not initialized. Set GEMINI_API_KEY environment variable."
      );
    }

    this.stats = {
      analyzed: 0,
      failed: 0,
      bySentiment: {
        positive: 0,
        negative: 0,
        neutral: 0,
      },
    };
  }

  /**
   * Analyze sentiment of text
   * @param {string} text - Text to analyze
   * @param {object} options - Analysis options
   * @returns {Promise<object>} Sentiment analysis result
   */
  async analyzeSentiment(text, options = {}) {
    if (!text || typeof text !== "string") {
      return {
        sentiment: "Neutral",
        confidence: 0,
        score: 0,
        intent: null,
        urgency: null,
        emotions: [],
      };
    }

    if (!this.geminiService.initialized) {
      logger.warn("[GeminiSentiment] Falling back to basic sentiment detection");
      return this.fallbackSentiment(text);
    }

    try {
      const prompt = this.buildSentimentPrompt(text, options);
      
      const result = await this.geminiService.generateJSON(
        prompt,
        {
          sentiment: "string (Positive, Negative, or Neutral)",
          confidence: "number (0-100)",
          score: "number (-1 to 1, where -1 is very negative, 0 is neutral, 1 is very positive)",
          intent: "string (brief description of user intent)",
          urgency: "string (low, medium, high, or null)",
          emotions: "array of strings (e.g., ['happy', 'interested', 'frustrated'])",
          reasoning: "string (brief explanation of the sentiment classification)",
        },
        {
          model: "flash", // Use Flash for fast, cost-effective sentiment analysis
          taskType: "sentiment",
          temperature: 0.2, // Lower temperature for more consistent sentiment classification
          maxTokens: 500,
        }
      );

      if (result.json) {
        const analysis = {
          sentiment: result.json.sentiment || "Neutral",
          confidence: result.json.confidence || 50,
          score: result.json.score || 0,
          intent: result.json.intent || null,
          urgency: result.json.urgency || null,
          emotions: result.json.emotions || [],
          reasoning: result.json.reasoning || null,
        };

        // Normalize sentiment to match existing format
        if (analysis.sentiment.toLowerCase() === "positive") {
          analysis.sentiment = "Positive";
        } else if (analysis.sentiment.toLowerCase() === "negative") {
          analysis.sentiment = "Negative";
        } else {
          analysis.sentiment = "Neutral";
        }

        // Update statistics
        this.stats.analyzed++;
        this.stats.bySentiment[analysis.sentiment.toLowerCase()]++;

        logger.debug(`[GeminiSentiment] Analyzed text: ${analysis.sentiment} (confidence: ${analysis.confidence}%)`);

        return analysis;
      }

      return this.fallbackSentiment(text);
    } catch (error) {
      this.stats.failed++;
      logger.error("[GeminiSentiment] Error analyzing sentiment:", error.message);
      return this.fallbackSentiment(text);
    }
  }

  /**
   * Build sentiment analysis prompt
   */
  buildSentimentPrompt(text, options = {}) {
    const { context = null, language = "en" } = options;

    let prompt = `Analyze the sentiment of the following text and provide a detailed sentiment analysis.

Text: "${text}"

Please analyze:
1. Overall sentiment (Positive, Negative, or Neutral)
2. Confidence level (0-100) in your classification
3. Sentiment score (-1 to 1, where -1 is very negative, 0 is neutral, 1 is very positive)
4. User intent (what the user is trying to communicate)
5. Urgency level (low, medium, high, or null if not applicable)
6. Emotions detected (array of emotions like happy, interested, frustrated, etc.)
7. Brief reasoning for your classification

Consider context, tone, and implicit meaning.`;

    if (context) {
      prompt += `\n\nContext: ${context}`;
    }

    if (language !== "en") {
      prompt += `\n\nNote: The text is in ${language}. Analyze sentiment accordingly.`;
    }

    return prompt;
  }

  /**
   * Fallback sentiment analysis (basic keyword matching)
   * Used when Gemini is unavailable
   */
  fallbackSentiment(text) {
    const lowerText = text.toLowerCase();
    
    const positiveKeywords = [
      "great", "awesome", "thank", "thanks", "love", "sounds good", "interested",
      "perfect", "wonderful", "excellent", "amazing", "fantastic", "sure", "yes",
      "appreciate", "helpful", "looking forward", "good", "nice", "happy",
    ];

    const negativeKeywords = [
      "no thanks", "not interested", "stop", "unsubscribe", "remove", "spam",
      "do not contact", "don't contact", "leave me alone", "go away", "busy",
      "not now", "never", "waste", "annoying", "irrelevant", "not looking",
    ];

    const hasPositive = positiveKeywords.some(keyword => lowerText.includes(keyword));
    const hasNegative = negativeKeywords.some(keyword => lowerText.includes(keyword));

    if (hasPositive && !hasNegative) {
      return {
        sentiment: "Positive",
        confidence: 60,
        score: 0.5,
        intent: null,
        urgency: null,
        emotions: [],
      };
    }

    if (hasNegative && !hasPositive) {
      return {
        sentiment: "Negative",
        confidence: 60,
        score: -0.5,
        intent: null,
        urgency: null,
        emotions: [],
      };
    }

    return {
      sentiment: "Neutral",
      confidence: 50,
      score: 0,
      intent: null,
      urgency: null,
      emotions: [],
    };
  }

  /**
   * Batch analyze sentiment for multiple texts
   */
  async batchAnalyze(texts, options = {}) {
    const results = [];
    const batchSize = options.batchSize || 10;
    const delayMs = options.delayMs || 100;

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);

      const batchPromises = batch.map((text) =>
        this.analyzeSentiment(text, options).catch((error) => {
          logger.error("[GeminiSentiment] Batch error:", error.message);
          return this.fallbackSentiment(text);
        })
      );

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      if (i + batchSize < texts.length) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    return results;
  }

  /**
   * Get sentiment emoji (for compatibility with old sentimentAnalyzer)
   */
  getSentimentEmoji(sentiment) {
    switch (sentiment) {
      case "Positive":
        return "😊";
      case "Negative":
        return "😞";
      default:
        return "😐";
    }
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      ...this.stats,
      successRate:
        this.stats.analyzed + this.stats.failed > 0
          ? (
              (this.stats.analyzed /
                (this.stats.analyzed + this.stats.failed)) *
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
      analyzed: 0,
      failed: 0,
      bySentiment: {
        positive: 0,
        negative: 0,
        neutral: 0,
      },
    };
  }
}

// Singleton instance
let instance = null;

function getInstance() {
  if (!instance) {
    instance = new GeminiSentimentService();
  }
  return instance;
}

module.exports = {
  GeminiSentimentService,
  getInstance,
};
