const axios = require("axios");
const logger = require("../utils/logger");

class AttioService {
  constructor(apiKey) {
    if (!apiKey) {
      throw new Error("Attio API key is required");
    }

    this.apiKey = apiKey;
    this.baseUrl = "https://api.attio.com/v2";
    this.headers = {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    };

    // Track sync statistics
    this.stats = {
      usersProcessed: 0,
      eventsProcessed: 0,
      eventsDuplicated: 0,
      errors: [],
      usersSynced: new Set(),
      eventsSynced: new Set(),
    };

    logger.info("AttioService initialized");
  }

  /**
   * Assert (upsert) a person into Attio
   * @param {Object} userData - User data from user_source table
   * @returns {Object} Attio person record
   */
  async upsertPerson(userData) {
    try {
      const { email, enrichment_profile, linkedin_profile, created_at } =
        userData;

      // Skip if no email
      if (!email) {
        logger.warn(`Skipping user without email`, { userData });
        return null;
      }

      // Build the person data payload
      const personData = {
        data: {
          values: {
            email_addresses: [email].filter(Boolean),
          },
        },
      };

      // Add name if available from enrichment_profile
      if (enrichment_profile) {
        const profile =
          typeof enrichment_profile === "string"
            ? JSON.parse(enrichment_profile)
            : enrichment_profile;

        if (profile.name || profile.firstName || profile.lastName) {
          personData.data.values.name = [
            {
              first_name:
                profile.firstName || profile.name?.split(" ")[0] || "",
              last_name:
                profile.lastName ||
                profile.name?.split(" ").slice(1).join(" ") ||
                "",
              full_name:
                profile.name ||
                `${profile.firstName || ""} ${profile.lastName || ""}`.trim(),
            },
          ];
        }

        // Add company if available
        if (profile.company) {
          personData.data.values.description = `Company: ${profile.company}`;
        }

        // Add job title if available
        if (profile.jobTitle || profile.title) {
          personData.data.values.job_title = profile.jobTitle || profile.title;
        }
      }

      // Add LinkedIn if available
      if (linkedin_profile) {
        personData.data.values.linkedin = linkedin_profile;
      }

      const response = await axios.put(
        `${this.baseUrl}/objects/people/records?matching_attribute=email_addresses`,
        personData,
        { headers: this.headers }
      );

      this.stats.usersProcessed++;
      this.stats.usersSynced.add(email);

      logger.debug(`Person upserted: ${email}`, {
        attioId: response.data.data.id.record_id,
      });

      return response.data.data;
    } catch (error) {
      logger.error(`Failed to upsert person: ${userData.email}`, {
        error: error.response?.data || error.message,
      });

      this.stats.errors.push({
        type: "person_upsert",
        email: userData.email,
        error: error.response?.data?.message || error.message,
      });

      throw error;
    }
  }

  /**
   * Upsert a person with lead scoring data
   * @param {Object} userData - User data including scores
   * @returns {Object} Attio person record
   */
  async upsertPersonWithScores(userData) {
    try {
      const {
        email,
        enrichment_profile,
        linkedin_profile,
        created_at,
        icp_score,
        behaviour_score,
        lead_score,
        lead_grade,
        apollo_data,
      } = userData;

      // Skip if no email
      if (!email) {
        logger.warn(`Skipping user without email`, { userData });
        return null;
      }

      // Build the person data payload
      const personData = {
        data: {
          values: {
            email_addresses: [email].filter(Boolean),
          },
        },
      };

      // Add name if available from enrichment_profile or apollo_data
      let profile = null;
      if (enrichment_profile) {
        profile =
          typeof enrichment_profile === "string"
            ? JSON.parse(enrichment_profile)
            : enrichment_profile;
      } else if (apollo_data) {
        profile =
          typeof apollo_data === "string"
            ? JSON.parse(apollo_data)
            : apollo_data;
      }

      if (profile) {
        if (profile.name || profile.firstName || profile.lastName) {
          personData.data.values.name = [
            {
              first_name:
                profile.firstName || profile.name?.split(" ")[0] || "",
              last_name:
                profile.lastName ||
                profile.name?.split(" ").slice(1).join(" ") ||
                "",
              full_name:
                profile.name ||
                `${profile.firstName || ""} ${profile.lastName || ""}`.trim(),
            },
          ];
        }

        // Add company if available
        if (profile.company) {
          personData.data.values.description = `Company: ${profile.company}`;
        }

        // Add job title if available
        if (profile.jobTitle || profile.title) {
          personData.data.values.job_title = profile.jobTitle || profile.title;
        }
      }

      // Add LinkedIn if available
      if (linkedin_profile) {
        personData.data.values.linkedin = linkedin_profile;
      }

      // Add lead scoring fields as custom attributes
      // Note: These fields need to be created in Attio as custom attributes
      // You may need to adjust field names based on your Attio configuration
      if (icp_score !== null && icp_score !== undefined) {
        personData.data.values.icp_score = icp_score;
      }

      if (behaviour_score !== null && behaviour_score !== undefined) {
        personData.data.values.behaviour_score = behaviour_score;
      }

      if (lead_score !== null && lead_score !== undefined) {
        personData.data.values.lead_score = lead_score;
      }

      if (lead_grade) {
        // Sync lead_grade to the "icp" select field (the actual field name in Attio)
        // According to Attio docs, pass the select option as a string
        personData.data.values.icp = lead_grade;
      }

      // Add scoring metadata to the scoring_meta field
      personData.data.values.scoring_meta = JSON.stringify({
        icp_score,
        behaviour_score,
        lead_score,
        lead_grade,
        scored_at: new Date().toISOString(),
        has_apollo_data: !!apollo_data,
      });

      const response = await axios.put(
        `${this.baseUrl}/objects/people/records?matching_attribute=email_addresses`,
        personData,
        { headers: this.headers }
      );

      this.stats.usersProcessed++;
      this.stats.usersSynced.add(email);

      logger.debug(`Person with scores upserted: ${email}`, {
        attioId: response.data.data.id.record_id,
        scores: { icp_score, behaviour_score, lead_score, lead_grade },
      });

      return response.data.data;
    } catch (error) {
      logger.error(`Failed to upsert person with scores: ${userData.email}`, {
        error: error.response?.data || error.message,
      });

      this.stats.errors.push({
        type: "person_score_upsert",
        email: userData.email,
        error: error.response?.data?.message || error.message,
      });

      throw error;
    }
  }

  /**
   * Create an event in Attio's custom events object
   * @param {Object} eventData - Event data from event_source table
   * @param {String} personRecordId - Attio person record ID
   * @returns {Object} Attio event record
   */
  async createEvent(eventData, personEmail) {
    try {
      const {
        id,
        event_key,
        event_type,
        platform,
        metadata,
        created_at,
        user_id,
      } = eventData;

      // Parse metadata if it's a string
      const meta =
        typeof metadata === "string" ? JSON.parse(metadata) : metadata;

      // Build the event data payload
      // Using your actual Attio field slugs
      const eventPayload = {
        data: {
          values: {
            // Map to your Attio custom event object fields
            source_channel: event_type, // event name → source_channel
            source: platform, // event source → source
            source_id: event_key || id.toString(), // source id → source_id
            event_timestamp: created_at, // event timestamp → event_timestamp
            event_type: meta?.channel || platform, // event channel → event_type
            meta_1: JSON.stringify(metadata), // meta → meta_1
            campaign: meta?.campaign_name || meta?.campaign_id || "", // campaign → campaign
          },
        },
      };

      // First, find the person by email to get their record ID
      const personResponse = await this.findPersonByEmail(
        personEmail || user_id
      );
      if (personResponse) {
        eventPayload.data.values.person = [
          {
            target_object: "people",
            target_record_id: personResponse.id.record_id,
          },
        ];
      }

      const response = await axios.post(
        `${this.baseUrl}/objects/events/records`,
        eventPayload,
        { headers: this.headers }
      );

      this.stats.eventsProcessed++;
      this.stats.eventsSynced.add(event_key || id.toString());

      logger.debug(
        `Event created: ${event_type} for ${personEmail || user_id}`,
        {
          attioId: response.data.data.id.record_id,
        }
      );

      return response.data.data;
    } catch (error) {
      // Check if it's a duplicate error
      const errorMessage = error.response?.data?.message || error.message;
      const isDuplicate =
        errorMessage.includes("source_id") &&
        (errorMessage.includes("unique") ||
          errorMessage.includes("already exists") ||
          errorMessage.includes("duplicate"));

      if (isDuplicate) {
        logger.debug(`Event already exists in Attio: ${eventData.event_key}`);
        // Don't count duplicates as errors
        this.stats.eventsDuplicated++;
        this.stats.eventsSynced.add(eventData.event_key || eventData.id); // Still mark as "synced"
      } else {
        logger.error(`Failed to create event: ${eventData.event_key}`, {
          error: error.response?.data || error.message,
        });

        this.stats.errors.push({
          type: "event_create",
          eventKey: eventData.event_key,
          error: errorMessage,
        });
      }

      // Don't throw error to continue processing other events
      return null;
    }
  }

  /**
   * Find a person by email
   * @param {String} email - Email address to search
   * @returns {Object|null} Person record or null if not found
   */
  async findPersonByEmail(email) {
    try {
      // Use the filter endpoint to search for people by email
      // Attio expects the email directly for email-address type fields
      const response = await axios.post(
        `${this.baseUrl}/objects/people/records/query`,
        {
          filter: {
            email_addresses: email,
          },
        },
        { headers: this.headers }
      );

      if (response.data.data && response.data.data.length > 0) {
        return response.data.data[0];
      }

      return null;
    } catch (error) {
      logger.error(`Failed to find person by email: ${email}`, {
        error: error.response?.data || error.message,
      });
      return null;
    }
  }

  /**
   * Get sync statistics
   * @returns {Object} Statistics object
   */
  getStats() {
    return {
      ...this.stats,
      usersSynced: Array.from(this.stats.usersSynced),
      eventsSynced: Array.from(this.stats.eventsSynced),
      errorCount: this.stats.errors.length,
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      usersProcessed: 0,
      eventsProcessed: 0,
      eventsDuplicated: 0,
      errors: [],
      usersSynced: new Set(),
      eventsSynced: new Set(),
    };
  }
}

module.exports = AttioService;
