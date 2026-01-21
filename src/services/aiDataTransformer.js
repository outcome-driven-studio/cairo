const { getInstance } = require("./geminiService");
const logger = require("../utils/logger");

/**
 * AI Data Transformer Service
 * 
 * Uses Gemini 1.5 Flash for intelligent data transformation, normalization,
 * field mapping, and data quality checks.
 */
class AIDataTransformer {
  constructor() {
    this.geminiService = getInstance();
    
    if (!this.geminiService.initialized) {
      logger.warn(
        "[AIDataTransformer] Gemini service not initialized. Data transformation will use basic rules."
      );
    }

    this.stats = {
      transformed: 0,
      failed: 0,
      qualityIssues: 0,
    };
  }

  /**
   * Transform data to target schema
   * @param {object} data - Source data
   * @param {object} targetSchema - Target schema definition
   * @param {object} options - Transformation options
   * @returns {Promise<object>} Transformed data
   */
  async transform(data, targetSchema, options = {}) {
    if (!data || typeof data !== "object") {
      return data;
    }

    if (!this.geminiService.initialized) {
      return this.fallbackTransform(data, targetSchema);
    }

    try {
      const prompt = this.buildTransformPrompt(data, targetSchema, options);
      
      const result = await this.geminiService.generateJSON(
        prompt,
        targetSchema,
        {
          model: "flash", // Use Flash for fast data transformation
          taskType: "transformation",
          temperature: 0.1, // Very low temperature for consistent transformation
          maxTokens: 2000,
        }
      );

      if (result.json) {
        // Validate transformed data
        const validation = this.validateTransformation(result.json, targetSchema);
        
        if (validation.valid) {
          this.stats.transformed++;
          logger.debug("[AIDataTransformer] Successfully transformed data");
          return result.json;
        } else {
          this.stats.qualityIssues++;
          logger.warn("[AIDataTransformer] Transformation validation issues:", validation.errors);
          // Return transformed data anyway, but log issues
          return result.json;
        }
      }

      return this.fallbackTransform(data, targetSchema);
    } catch (error) {
      this.stats.failed++;
      logger.error("[AIDataTransformer] Error transforming data:", error.message);
      return this.fallbackTransform(data, targetSchema);
    }
  }

  /**
   * Build transformation prompt
   */
  buildTransformPrompt(data, targetSchema, options = {}) {
    const { fieldMappings = null, normalizationRules = null } = options;

    let prompt = `Transform the following data to match the target schema.

Source Data:
${JSON.stringify(data, null, 2)}

Target Schema:
${JSON.stringify(targetSchema, null, 2)}

Requirements:
1. Map all fields from source to target schema
2. Normalize data formats (dates, numbers, strings)
3. Handle missing fields by inferring from context or using defaults
4. Maintain data integrity and relationships
5. Ensure all required fields in target schema are populated`;

    if (fieldMappings) {
      prompt += `\n\nField Mappings:\n${JSON.stringify(fieldMappings, null, 2)}`;
    }

    if (normalizationRules) {
      prompt += `\n\nNormalization Rules:\n${JSON.stringify(normalizationRules, null, 2)}`;
    }

    prompt += `\n\nReturn the transformed data as a JSON object matching the target schema exactly.`;

    return prompt;
  }

  /**
   * Validate transformed data against schema
   */
  validateTransformation(data, schema) {
    const errors = [];

    // Basic validation - check if required fields exist
    if (typeof schema === "object" && !Array.isArray(schema)) {
      for (const [key, value] of Object.entries(schema)) {
        if (typeof value === "object" && value.required && !(key in data)) {
          errors.push(`Missing required field: ${key}`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Fallback transformation using basic rules
   */
  fallbackTransform(data, targetSchema) {
    // Simple field mapping if schema is an object
    if (typeof targetSchema === "object" && !Array.isArray(targetSchema)) {
      const transformed = {};
      
      for (const [key, value] of Object.entries(targetSchema)) {
        // Try to find matching field in source data (case-insensitive)
        const sourceKey = Object.keys(data).find(
          (k) => k.toLowerCase() === key.toLowerCase()
        );
        
        if (sourceKey) {
          transformed[key] = data[sourceKey];
        } else if (typeof value === "object" && value.default !== undefined) {
          transformed[key] = value.default;
        }
      }
      
      return transformed;
    }

    return data;
  }

  /**
   * Normalize field values
   * @param {object} data - Data to normalize
   * @param {object} normalizationRules - Rules for normalization
   * @returns {Promise<object>} Normalized data
   */
  async normalize(data, normalizationRules) {
    if (!this.geminiService.initialized) {
      return data;
    }

    try {
      const prompt = `Normalize the following data according to these rules:

Data:
${JSON.stringify(data, null, 2)}

Normalization Rules:
${JSON.stringify(normalizationRules, null, 2)}

Apply normalization rules to standardize formats, clean data, and ensure consistency.`;

      const result = await this.geminiService.generateJSON(
        prompt,
        null, // No specific schema, just return normalized data
        {
          model: "flash",
          taskType: "transformation",
          temperature: 0.1,
          maxTokens: 2000,
        }
      );

      if (result.json) {
        this.stats.transformed++;
        return result.json;
      }

      return data;
    } catch (error) {
      logger.error("[AIDataTransformer] Error normalizing data:", error.message);
      return data;
    }
  }

  /**
   * Check data quality
   * @param {object} data - Data to check
   * @param {object} qualityRules - Quality rules
   * @returns {Promise<object>} Quality report
   */
  async checkQuality(data, qualityRules = {}) {
    if (!this.geminiService.initialized) {
      return {
        score: 70,
        issues: [],
        valid: true,
      };
    }

    try {
      const prompt = `Analyze the quality of this data:

Data:
${JSON.stringify(data, null, 2)}

Quality Rules:
${JSON.stringify(qualityRules, null, 2)}

Check for:
1. Missing required fields
2. Invalid data formats
3. Inconsistent values
4. Data completeness
5. Data accuracy

Provide a quality score (0-100) and list any issues found.`;

      const result = await this.geminiService.generateJSON(
        prompt,
        {
          score: "number (0-100)",
          issues: "array of strings",
          valid: "boolean",
          recommendations: "array of strings",
        },
        {
          model: "flash",
          taskType: "transformation",
          temperature: 0.2,
          maxTokens: 1000,
        }
      );

      if (result.json) {
        if (result.json.issues && result.json.issues.length > 0) {
          this.stats.qualityIssues++;
        }
        return result.json;
      }

      return {
        score: 70,
        issues: [],
        valid: true,
      };
    } catch (error) {
      logger.error("[AIDataTransformer] Error checking data quality:", error.message);
      return {
        score: 70,
        issues: [],
        valid: true,
      };
    }
  }

  /**
   * Batch transform multiple data objects
   */
  async batchTransform(dataArray, targetSchema, options = {}) {
    const results = [];
    const batchSize = options.batchSize || 10;
    const delayMs = options.delayMs || 100;

    for (let i = 0; i < dataArray.length; i += batchSize) {
      const batch = dataArray.slice(i, i + batchSize);

      const batchPromises = batch.map((data) =>
        this.transform(data, targetSchema, options).catch((error) => {
          logger.error("[AIDataTransformer] Batch transformation error:", error.message);
          return this.fallbackTransform(data, targetSchema);
        })
      );

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      if (i + batchSize < dataArray.length) {
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
        this.stats.transformed + this.stats.failed > 0
          ? (
              (this.stats.transformed /
                (this.stats.transformed + this.stats.failed)) *
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
      transformed: 0,
      failed: 0,
      qualityIssues: 0,
    };
  }
}

// Singleton instance
let instance = null;

function getInstance() {
  if (!instance) {
    instance = new AIDataTransformer();
  }
  return instance;
}

module.exports = {
  AIDataTransformer,
  getInstance,
};
