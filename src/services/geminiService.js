const { GoogleGenerativeAI } = require("@google/generative-ai");
const logger = require("../utils/logger");

/**
 * Unified Gemini AI Service
 * 
 * Provides a single interface for all AI operations using Google's Gemini models.
 * Automatically selects the appropriate model (Pro vs Flash) based on task complexity.
 * 
 * Model Selection:
 * - Gemini 1.5 Pro: Complex reasoning, lead enrichment, natural language queries, pattern recognition
 * - Gemini 1.5 Flash: Fast tasks, sentiment analysis, event classification, data transformation
 */
class GeminiService {
  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    
    if (!apiKey) {
      logger.warn("[Gemini] GEMINI_API_KEY not configured. AI features will be disabled.");
      this.initialized = false;
      return;
    }

    this.genAI = new GoogleGenerativeAI(apiKey);
    
    // Model configuration
    this.modelPro = process.env.GEMINI_MODEL_PRO || "gemini-1.5-pro";
    this.modelFlash = process.env.GEMINI_MODEL_FLASH || "gemini-1.5-flash";
    
    // Cost tracking (approximate costs per 1000 operations in USD)
    // Gemini pricing: Pro ~$1.25/1M input tokens, $5/1M output tokens
    // Flash ~$0.075/1M input tokens, $0.30/1M output tokens
    this.costs = {
      pro: {
        inputPer1M: 1.25,
        outputPer1M: 5.0,
        estimatedPerEnrichment: 0.002, // ~$2 per 1000 enrichments
      },
      flash: {
        inputPer1M: 0.075,
        outputPer1M: 0.30,
        estimatedPerEnrichment: 0.0005, // ~$0.50 per 1000 operations
      },
    };

    // Statistics
    this.stats = {
      totalCalls: 0,
      proCalls: 0,
      flashCalls: 0,
      totalCost: 0,
      errors: 0,
      cacheHits: 0,
      byTask: {
        enrichment: 0,
        sentiment: 0,
        classification: 0,
        transformation: 0,
        query: 0,
        scoring: 0,
        insights: 0,
      },
    };

    // Simple in-memory cache (can be enhanced with Redis)
    this.cache = new Map();
    this.cacheMaxSize = 1000;
    this.cacheTTL = 3600000; // 1 hour

    this.initialized = true;
    logger.info("[Gemini] Service initialized", {
      proModel: this.modelPro,
      flashModel: this.modelFlash,
    });
  }

  /**
   * Generate content using the appropriate Gemini model
   * @param {string} prompt - The prompt to send
   * @param {object} options - Configuration options
   * @param {string} options.model - 'pro' or 'flash' (auto-selected if not specified)
   * @param {number} options.temperature - Temperature (0-1)
   * @param {number} options.maxTokens - Maximum output tokens
   * @param {boolean} options.useCache - Whether to use cache
   * @param {string} options.taskType - Task type for statistics
   * @returns {Promise<object>} Response with text and metadata
   */
  async generateContent(prompt, options = {}) {
    if (!this.initialized) {
      throw new Error("Gemini service not initialized. Set GEMINI_API_KEY environment variable.");
    }

    const {
      model = "auto", // 'auto', 'pro', or 'flash'
      temperature = 0.3,
      maxTokens = 2000,
      useCache = true,
      taskType = "general",
      systemInstruction = null,
    } = options;

    // Check cache first
    if (useCache) {
      const cacheKey = this.getCacheKey(prompt, options);
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
        this.stats.cacheHits++;
        logger.debug("[Gemini] Cache hit for prompt");
        return cached.result;
      }
    }

    // Auto-select model based on task complexity
    const selectedModel = model === "auto" ? this.selectModel(taskType) : model;
    const modelName = selectedModel === "pro" ? this.modelPro : this.modelFlash;

    try {
      const geminiModel = this.genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          temperature,
          maxOutputTokens: maxTokens,
        },
        systemInstruction: systemInstruction || this.getDefaultSystemInstruction(taskType),
      });

      const startTime = Date.now();
      const result = await geminiModel.generateContent(prompt);
      const duration = Date.now() - startTime;

      const response = await result.response;
      const text = response.text();

      // Calculate cost (approximate)
      const usageMetadata = response.usageMetadata || {};
      const inputTokens = usageMetadata.promptTokenCount || 0;
      const outputTokens = usageMetadata.candidatesTokenCount || 0;
      const cost = this.calculateCost(inputTokens, outputTokens, selectedModel);

      // Update statistics
      this.stats.totalCalls++;
      if (selectedModel === "pro") {
        this.stats.proCalls++;
      } else {
        this.stats.flashCalls++;
      }
      this.stats.totalCost += cost;
      if (this.stats.byTask[taskType] !== undefined) {
        this.stats.byTask[taskType]++;
      }

      const resultData = {
        text,
        model: selectedModel,
        modelName,
        cost,
        tokens: {
          input: inputTokens,
          output: outputTokens,
          total: inputTokens + outputTokens,
        },
        duration,
        taskType,
      };

      // Cache the result
      if (useCache) {
        this.setCache(cacheKey, resultData);
      }

      logger.debug(`[Gemini] Generated content using ${selectedModel}`, {
        taskType,
        tokens: resultData.tokens.total,
        cost: `$${cost.toFixed(6)}`,
        duration: `${duration}ms`,
      });

      return resultData;
    } catch (error) {
      this.stats.errors++;
      logger.error("[Gemini] Error generating content:", error);
      throw error;
    }
  }

  /**
   * Auto-select model based on task type
   */
  selectModel(taskType) {
    // Use Pro for complex reasoning tasks
    const proTasks = [
      "enrichment",
      "scoring",
      "query",
      "analysis",
      "reasoning",
    ];

    // Use Flash for fast, high-throughput tasks
    const flashTasks = [
      "sentiment",
      "classification",
      "transformation",
      "insights",
      "routing",
    ];

    if (proTasks.includes(taskType)) {
      return "pro";
    } else if (flashTasks.includes(taskType)) {
      return "flash";
    }

    // Default to Flash for unknown tasks (cost-effective)
    return "flash";
  }

  /**
   * Get default system instruction based on task type
   */
  getDefaultSystemInstruction(taskType) {
    const instructions = {
      enrichment:
        "You are a business intelligence assistant specializing in company research and ICP scoring. Provide accurate, structured data in JSON format.",
      sentiment:
        "You are a sentiment analysis expert. Analyze text and provide sentiment classification with confidence scores.",
      classification:
        "You are an event classification expert. Classify events and determine appropriate routing based on content and context.",
      transformation:
        "You are a data transformation expert. Normalize and transform data structures while maintaining data integrity.",
      query:
        "You are a data analyst assistant. Answer questions about data and generate SQL queries when needed.",
      scoring:
        "You are a lead scoring expert. Analyze patterns in lead behavior and company data to predict lead quality.",
      insights:
        "You are a business intelligence analyst. Generate insights, identify trends, and provide recommendations.",
    };

    return instructions[taskType] || "You are a helpful AI assistant.";
  }

  /**
   * Calculate cost based on token usage
   */
  calculateCost(inputTokens, outputTokens, model) {
    const costConfig = this.costs[model];
    if (!costConfig) return 0;

    const inputCost = (inputTokens / 1000000) * costConfig.inputPer1M;
    const outputCost = (outputTokens / 1000000) * costConfig.outputPer1M;
    return inputCost + outputCost;
  }

  /**
   * Batch process multiple prompts
   */
  async batchGenerate(prompts, options = {}) {
    const {
      batchSize = 10,
      delayMs = 100,
      ...generateOptions
    } = options;

    const results = [];
    
    for (let i = 0; i < prompts.length; i += batchSize) {
      const batch = prompts.slice(i, i + batchSize);
      
      const batchPromises = batch.map((prompt, index) =>
        this.generateContent(prompt, {
          ...generateOptions,
          taskType: generateOptions.taskType || "batch",
        }).catch((error) => {
          logger.error(`[Gemini] Batch error at index ${i + index}:`, error.message);
          return {
            error: error.message,
            text: null,
          };
        })
      );

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // Rate limiting delay
      if (i + batchSize < prompts.length) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }

      logger.info(
        `[Gemini] Processed batch ${Math.floor(i / batchSize) + 1}, ${Math.min(i + batchSize, prompts.length)}/${prompts.length} items`
      );
    }

    return results;
  }

  /**
   * Generate structured JSON response
   */
  async generateJSON(prompt, schema = null, options = {}) {
    const jsonPrompt = schema
      ? `${prompt}\n\nReturn the response as a valid JSON object${schema ? ` matching this schema: ${JSON.stringify(schema)}` : ""}. Do not include any markdown formatting or code blocks, only the raw JSON.`
      : `${prompt}\n\nReturn the response as a valid JSON object. Do not include any markdown formatting or code blocks, only the raw JSON.`;

    const result = await this.generateContent(jsonPrompt, {
      ...options,
      temperature: options.temperature || 0.1, // Lower temperature for structured output
    });

    // Parse JSON from response
    try {
      // Try to extract JSON from the response
      const jsonMatch = result.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return {
          ...result,
          json: JSON.parse(jsonMatch[0]),
        };
      }
      // If no match, try parsing the whole text
      return {
        ...result,
        json: JSON.parse(result.text),
      };
    } catch (error) {
      logger.error("[Gemini] Failed to parse JSON response:", error);
      throw new Error(`Failed to parse JSON: ${error.message}`);
    }
  }

  /**
   * Cache management
   */
  getCacheKey(prompt, options) {
    return `${prompt}_${JSON.stringify(options)}`;
  }

  setCache(key, value) {
    // Simple LRU: remove oldest if cache is full
    if (this.cache.size >= this.cacheMaxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    this.cache.set(key, {
      result: value,
      timestamp: Date.now(),
    });
  }

  clearCache() {
    this.cache.clear();
    logger.info("[Gemini] Cache cleared");
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      ...this.stats,
      averageCost:
        this.stats.totalCalls > 0
          ? (this.stats.totalCost / this.stats.totalCalls).toFixed(6)
          : 0,
      cacheHitRate:
        this.stats.totalCalls > 0
          ? ((this.stats.cacheHits / this.stats.totalCalls) * 100).toFixed(1)
          : 0,
      errorRate:
        this.stats.totalCalls > 0
          ? ((this.stats.errors / this.stats.totalCalls) * 100).toFixed(1)
          : 0,
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      totalCalls: 0,
      proCalls: 0,
      flashCalls: 0,
      totalCost: 0,
      errors: 0,
      cacheHits: 0,
      byTask: {
        enrichment: 0,
        sentiment: 0,
        classification: 0,
        transformation: 0,
        query: 0,
        scoring: 0,
        insights: 0,
      },
    };
  }

  /**
   * Estimate cost for a batch operation
   */
  estimateCost(itemCount, taskType = "general") {
    const model = this.selectModel(taskType);
    const costConfig = this.costs[model];
    return itemCount * costConfig.estimatedPerEnrichment;
  }
}

// Singleton instance
let instance = null;

function getInstance() {
  if (!instance) {
    instance = new GeminiService();
  }
  return instance;
}

module.exports = {
  GeminiService,
  getInstance,
};
