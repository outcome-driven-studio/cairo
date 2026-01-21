const express = require("express");
const { getInstance } = require("../services/geminiService");
const { query } = require("../utils/db");
const logger = require("../utils/logger");

/**
 * AI Query Routes
 * 
 * Natural language queries on data using Gemini 1.5 Pro
 * Allows users to ask questions about their data in plain English
 */
class AIQueryRoutes {
  constructor() {
    this.router = express.Router();
    this.geminiService = getInstance();
    this.setupRoutes();
  }

  setupRoutes() {
    // Natural language query endpoint
    this.router.post("/query", async (req, res) => {
      try {
        const { question, namespace = "playmaker", context = null } = req.body;

        if (!question || typeof question !== "string") {
          return res.status(400).json({
            success: false,
            error: "Question is required and must be a string",
          });
        }

        if (!this.geminiService.initialized) {
          return res.status(503).json({
            success: false,
            error: "Gemini service not initialized. Set GEMINI_API_KEY environment variable.",
          });
        }

        // Get schema information
        const schemaInfo = await this.getSchemaInfo(namespace);

        // Generate SQL query from natural language
        const sqlResult = await this.generateSQL(question, schemaInfo, context);

        if (!sqlResult.sql) {
          return res.status(400).json({
            success: false,
            error: "Could not generate SQL query from question",
            suggestion: sqlResult.suggestion || "Try rephrasing your question",
          });
        }

        // Execute SQL query (with safety checks)
        const data = await this.executeQuery(sqlResult.sql, namespace);

        // Generate natural language answer
        const answer = await this.generateAnswer(question, sqlResult.sql, data, context);

        res.json({
          success: true,
          question,
          answer: answer.text,
          sql: sqlResult.sql,
          data: data.rows || [],
          rowCount: data.rowCount || 0,
          confidence: answer.confidence || 70,
          reasoning: sqlResult.reasoning || null,
        });
      } catch (error) {
        logger.error("[AIQuery] Error processing query:", error);
        res.status(500).json({
          success: false,
          error: error.message,
        });
      }
    });

    // Get available tables/schema
    this.router.get("/schema", async (req, res) => {
      try {
        const { namespace = "playmaker" } = req.query;
        const schemaInfo = await this.getSchemaInfo(namespace);
        res.json({
          success: true,
          namespace,
          schema: schemaInfo,
        });
      } catch (error) {
        logger.error("[AIQuery] Error getting schema:", error);
        res.status(500).json({
          success: false,
          error: error.message,
        });
      }
    });

    // Health check
    this.router.get("/health", (req, res) => {
      res.json({
        success: true,
        geminiInitialized: this.geminiService.initialized,
        available: this.geminiService.initialized,
      });
    });
  }

  /**
   * Get schema information for namespace
   */
  async getSchemaInfo(namespace) {
    try {
      // Get table information
      const tablesResult = await query(
        `SELECT table_name, column_name, data_type, is_nullable
         FROM information_schema.columns
         WHERE table_schema = 'public'
         AND table_name LIKE $1
         ORDER BY table_name, ordinal_position`,
        [`${namespace}_%`]
      );

      // Also get default tables
      const defaultTablesResult = await query(
        `SELECT table_name, column_name, data_type, is_nullable
         FROM information_schema.columns
         WHERE table_schema = 'public'
         AND table_name IN ('event_source', 'campaigns', 'sent_events')
         ORDER BY table_name, ordinal_position`
      );

      const allColumns = [...tablesResult.rows, ...defaultTablesResult.rows];

      // Organize by table
      const schema = {};
      allColumns.forEach((row) => {
        if (!schema[row.table_name]) {
          schema[row.table_name] = {
            columns: [],
            description: this.getTableDescription(row.table_name),
          };
        }
        schema[row.table_name].columns.push({
          name: row.column_name,
          type: row.data_type,
          nullable: row.is_nullable === "YES",
        });
      });

      return schema;
    } catch (error) {
      logger.error("[AIQuery] Error getting schema info:", error);
      return {};
    }
  }

  /**
   * Get table description for context
   */
  getTableDescription(tableName) {
    const descriptions = {
      [`${process.env.DEFAULT_NAMESPACE || "playmaker"}_user_source`]: "User profiles with lead scores and enrichment data",
      event_source: "All tracked events from various platforms",
      campaigns: "Campaign data from Lemlist and Smartlead",
      sent_events: "Deduplication tracking for sent events",
    };

    return descriptions[tableName] || "Data table";
  }

  /**
   * Generate SQL from natural language question
   */
  async generateSQL(question, schemaInfo, context) {
    const prompt = `Convert this natural language question into a PostgreSQL SQL query.

Question: "${question}"

Database Schema:
${JSON.stringify(schemaInfo, null, 2)}

${context ? `Context: ${context}` : ""}

Requirements:
1. Generate valid PostgreSQL SQL
2. Use appropriate table and column names from the schema
3. Include proper WHERE clauses, JOINs, and aggregations as needed
4. Use parameterized queries where possible (use $1, $2, etc. for parameters)
5. Add appropriate LIMIT clauses for large result sets (default: 100)
6. Include comments explaining the query logic

Important:
- Only use tables and columns that exist in the schema
- For date comparisons, use proper PostgreSQL date functions
- For text searches, use ILIKE for case-insensitive matching
- Be careful with user input - use parameterized queries

Return a JSON object with:
{
  "sql": "the SQL query string",
  "reasoning": "brief explanation of the query",
  "parameters": ["array of parameter values if any"],
  "suggestion": "optional suggestion if query cannot be generated"
}`;

    try {
      const result = await this.geminiService.generateJSON(
        prompt,
        {
          sql: "string (PostgreSQL query)",
          reasoning: "string",
          parameters: "array of strings",
          suggestion: "string (optional)",
        },
        {
          model: "pro", // Use Pro for complex SQL generation
          taskType: "query",
          temperature: 0.1, // Low temperature for accurate SQL
          maxTokens: 2000,
        }
      );

      if (result.json) {
        // Basic SQL safety check
        const sql = result.json.sql || "";
        const unsafeKeywords = ["DROP", "DELETE", "UPDATE", "INSERT", "ALTER", "CREATE", "TRUNCATE"];
        const isUnsafe = unsafeKeywords.some((keyword) =>
          sql.toUpperCase().includes(keyword)
        );

        if (isUnsafe) {
          return {
            sql: null,
            reasoning: "Query contains unsafe operations",
            suggestion: "Only SELECT queries are allowed",
          };
        }

        return result.json;
      }

      return {
        sql: null,
        reasoning: "Could not generate SQL",
        suggestion: "Try rephrasing your question",
      };
    } catch (error) {
      logger.error("[AIQuery] Error generating SQL:", error);
      return {
        sql: null,
        reasoning: error.message,
        suggestion: "Try a simpler question",
      };
    }
  }

  /**
   * Execute SQL query safely
   */
  async executeQuery(sql, namespace) {
    try {
      // Additional safety: only allow SELECT queries
      if (!sql.trim().toUpperCase().startsWith("SELECT")) {
        throw new Error("Only SELECT queries are allowed");
      }

      // Replace namespace placeholder if used
      const finalSQL = sql.replace(/\{namespace\}/g, namespace);

      const result = await query(finalSQL);
      return result;
    } catch (error) {
      logger.error("[AIQuery] Error executing query:", error);
      throw new Error(`Query execution failed: ${error.message}`);
    }
  }

  /**
   * Generate natural language answer from query results
   */
  async generateAnswer(question, sql, data, context) {
    const prompt = `Based on the following question, SQL query, and results, provide a natural language answer.

Question: "${question}"

SQL Query Used:
${sql}

Query Results:
${JSON.stringify(data.rows || [], null, 2)}

Row Count: ${data.rowCount || 0}

${context ? `Context: ${context}` : ""}

Provide:
1. A clear, natural language answer to the question
2. Key insights from the data
3. Confidence level (0-100) in your answer
4. Any caveats or limitations

Be concise but informative. If the data is empty, explain why that might be.`;

    try {
      const result = await this.geminiService.generateJSON(
        prompt,
        {
          text: "string (natural language answer)",
          confidence: "number (0-100)",
          insights: "array of strings",
          caveats: "array of strings",
        },
        {
          model: "pro",
          taskType: "query",
          temperature: 0.3,
          maxTokens: 1000,
        }
      );

      if (result.json) {
        return {
          text: result.json.text || "No answer generated",
          confidence: result.json.confidence || 70,
          insights: result.json.insights || [],
          caveats: result.json.caveats || [],
        };
      }

      return {
        text: "Unable to generate answer",
        confidence: 0,
      };
    } catch (error) {
      logger.error("[AIQuery] Error generating answer:", error);
      return {
        text: `Query returned ${data.rowCount || 0} results.`,
        confidence: 50,
      };
    }
  }

  /**
   * Get router
   */
  getRouter() {
    return this.router;
  }
}

module.exports = AIQueryRoutes;
