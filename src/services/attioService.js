const axios = require('axios');
const logger = require('../utils/logger');

/**
 * Attio CRM integration service
 * Syncs lead data to Attio workspace
 */
class AttioService {
  constructor(apiKey = null) {
    this.apiKey = apiKey || process.env.ATTIO_API_KEY;
    this.baseUrl = 'https://api.attio.com/v2';
    this.enabled = !!this.apiKey;

    if (!this.enabled) {
      logger.warn('[Attio] Service disabled - no API key provided');
    } else {
      logger.info('[Attio] Service initialized');
    }

    this.stats = {
      recordsSynced: 0,
      errors: 0
    };
  }

  /**
   * Sync a single record to Attio
   * @param {Object} record - Record data to sync
   * @returns {Promise<Object>} Sync result
   */
  async syncRecord(record) {
    if (!this.enabled) {
      return { success: false, error: 'Attio not configured' };
    }

    try {
      const { email, attributes = {} } = record;

      // Create or update person record in Attio
      const response = await axios.post(
        `${this.baseUrl}/objects/people/records`,
        {
          data: {
            values: {
              email_addresses: [{ email_address: email }],
              name: attributes.name || 'Unknown',
              lead_score: attributes.lead_score,
              lead_grade: attributes.lead_grade,
              icp_score: attributes.icp_score,
              organization_name: attributes.organization,
              job_title: attributes.title,
              location: attributes.location,
              last_updated: attributes.last_updated || new Date().toISOString(),
              source: 'cairo_cdp'
            }
          }
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      this.stats.recordsSynced++;
      logger.debug(`[Attio] Synced record for ${email}`);

      return { success: true, data: response.data };

    } catch (error) {
      this.stats.errors++;
      logger.error(`[Attio] Failed to sync record:`, error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Test the Attio connection
   * @returns {Promise<Object>} Test result
   */
  async testConnection() {
    if (!this.enabled) {
      return { success: false, error: 'Attio not configured' };
    }

    try {
      // Test by listing 1 person record (the /workspaces endpoint returns 404 in API v2)
      const response = await axios.post(
        `${this.baseUrl}/objects/people/records/query`,
        {
          limit: 1,
          offset: 0
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return {
        success: true,
        totalRecords: response.data.data?.length || 0,
        message: 'Connection successful'
      };

    } catch (error) {
      logger.error('[Attio] Connection test failed:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * List people from Attio workspace
   * @param {number} limit - Number of records to return (max 500)
   * @param {number} offset - Offset for pagination
   * @returns {Promise<Object>} List of people
   */
  async listPeople(limit = 100, offset = 0) {
    if (!this.enabled) {
      return { success: false, error: 'Attio not configured', data: [] };
    }

    try {
      // Attio API v2 uses POST for querying records
      const response = await axios.post(
        `${this.baseUrl}/objects/people/records/query`,
        {
          limit: Math.min(limit, 500), // Max 500 per Attio docs
          offset
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      logger.debug(`[Attio] Listed ${response.data.data?.length || 0} people (limit: ${limit}, offset: ${offset})`);

      return {
        success: true,
        data: response.data.data || [],
        count: response.data.data?.length || 0
      };

    } catch (error) {
      logger.error(`[Attio] Failed to list people:`, error.message);
      return { success: false, error: error.message, data: [] };
    }
  }

  /**
   * Find a person record by email
   * @param {string} email - Email address to search for
   * @returns {Promise<Object>} Person record or null
   */
  async findPersonByEmail(email) {
    if (!this.enabled) {
      return null;
    }

    try {
      const response = await axios.post(
        `${this.baseUrl}/objects/people/records/query`,
        {
          filter: {
            email_addresses: {
              $contains: email
            }
          },
          limit: 1
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data.data?.[0] || null;
    } catch (error) {
      logger.error(`[Attio] Failed to find person by email ${email}:`, error.message);
      return null;
    }
  }

  /**
   * Upsert (create or update) a person in Attio
   * @param {Object} personData - Person data including email and enrichment_profile
   * @returns {Promise<Object>} Upsert result
   */
  async upsertPerson(personData) {
    if (!this.enabled) {
      return { success: false, error: 'Attio not configured' };
    }

    try {
      const { email, enrichment_profile = {} } = personData;

      if (!email) {
        return { success: false, error: 'Email is required' };
      }

      // Check if person already exists
      const existingPerson = await this.findPersonByEmail(email);
      
      // Build values object
      const values = {};
      
      // Add email only for new records (can't update email on existing records)
      if (!existingPerson) {
        values.email_addresses = [{ email_address: email }];
      }
      
      // Add name if available
      const firstName = enrichment_profile.firstName || enrichment_profile.first_name || '';
      const lastName = enrichment_profile.lastName || enrichment_profile.last_name || '';
      const fullName = enrichment_profile.name || (firstName && lastName ? `${firstName} ${lastName}` : firstName || lastName);
      
      if (fullName) {
        values.name = {
          first_name: firstName,
          last_name: lastName,
          full_name: fullName
        };
      }
      
      // Add job title if available
      const title = enrichment_profile.title || enrichment_profile.job_title;
      if (title) values.job_title = [{ value: title }];
      
      let response;
      let recordId;
      
      if (existingPerson) {
        // Update existing record
        recordId = existingPerson.id?.record_id;
        response = await axios.patch(
          `${this.baseUrl}/objects/people/records/${recordId}`,
          {
            data: { values }
          },
          {
            headers: {
              'Authorization': `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json'
            }
          }
        );
        logger.debug(`[Attio] Updated person: ${email}`);
      } else {
        // Create new record
        response = await axios.post(
          `${this.baseUrl}/objects/people/records`,
          {
            data: { values }
          },
          {
            headers: {
              'Authorization': `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json'
            }
          }
        );
        recordId = response.data.data?.id?.record_id;
        logger.debug(`[Attio] Created person: ${email}`);
      }

      this.stats.recordsSynced++;

      return { success: true, data: response.data, record_id: recordId };

    } catch (error) {
      this.stats.errors++;
      const errorDetails = error.response?.data || error.message;
      logger.error(`[Attio] Failed to upsert person ${personData.email}:`, errorDetails);
      return { success: false, error: error.message, details: errorDetails };
    }
  }

  /**
   * Upsert person with scores (ICP, behavior, lead score)
   * @param {Object} userData - User data with scores
   * @returns {Promise<Object>} Upsert result
   */
  async upsertPersonWithScores(userData) {
    if (!this.enabled) {
      return { success: false, error: 'Attio not configured' };
    }

    try {
      const { email, name, icp_score, behavior_score, lead_score, lead_grade, enrichment_profile = {} } = userData;

      if (!email) {
        return { success: false, error: 'Email is required' };
      }

      // Check if person already exists
      const existingPerson = await this.findPersonByEmail(email);
      
      // Build values object
      const values = {};
      
      // Add email only for new records (can't update email on existing records)
      if (!existingPerson) {
        values.email_addresses = [{ email_address: email }];
      }
      
      // Add name if available
      if (name || enrichment_profile.name) {
        const fullName = name || enrichment_profile.name;
        values.name = {
          first_name: fullName.split(' ')[0] || '',
          last_name: fullName.split(' ').slice(1).join(' ') || '',
          full_name: fullName
        };
      }
      
      // Add job title if available
      const title = enrichment_profile.title || enrichment_profile.job_title;
      if (title) values.job_title = [{ value: title }];
      
      // Add scores to their respective fields (custom attributes exist in Attio)
      if (icp_score !== undefined && icp_score !== null) {
        values.icp_score = [{ value: icp_score }];
      }
      if (behavior_score !== undefined && behavior_score !== null) {
        values.behaviour_score = [{ value: behavior_score }]; // Note: British spelling in Attio
      }
      if (lead_score !== undefined && lead_score !== null) {
        values.lead_score = [{ value: lead_score }];
      }
      
      // Add scoring_meta with full scoring details
      const hasScoringData = icp_score !== undefined || behavior_score !== undefined || lead_score !== undefined;
      if (hasScoringData || lead_grade) {
        const scoringMeta = {
          icp_score: icp_score || 0,
          behaviour_score: behavior_score || 0,
          lead_score: lead_score || 0,
          lead_grade: lead_grade || null,
          scored_at: new Date().toISOString(),
          has_apollo_data: enrichment_profile?.apollo_data ? true : false
        };
        values.scoring_meta = [{ value: JSON.stringify(scoringMeta) }];
      }
      
      let response;
      let recordId;
      
      if (existingPerson) {
        // Update existing record
        recordId = existingPerson.id?.record_id;
        response = await axios.patch(
          `${this.baseUrl}/objects/people/records/${recordId}`,
          {
            data: { values }
          },
          {
            headers: {
              'Authorization': `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json'
            }
          }
        );
        logger.debug(`[Attio] Updated person with scores: ${email}`);
      } else {
        // Create new record
        response = await axios.post(
          `${this.baseUrl}/objects/people/records`,
          {
            data: { values }
          },
          {
            headers: {
              'Authorization': `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json'
            }
          }
        );
        recordId = response.data.data?.id?.record_id;
        logger.debug(`[Attio] Created person with scores: ${email}`);
      }

      this.stats.recordsSynced++;
      const scoreStr = [
        icp_score !== undefined ? `ICP=${icp_score}` : null,
        behavior_score !== undefined ? `Behavior=${behavior_score}` : null,
        lead_score !== undefined ? `Lead=${lead_score}` : null
      ].filter(Boolean).join(', ');
      logger.debug(`[Attio] Synced scores for ${email}: ${scoreStr || 'No scores'}`);

      return { success: true, data: response.data, record_id: recordId };

    } catch (error) {
      this.stats.errors++;
      const errorDetails = error.response?.data || error.message;
      logger.error(`[Attio] Failed to upsert person with scores ${userData.email}:`, errorDetails);
      return { success: false, error: error.message, details: errorDetails };
    }
  }

  /**
   * Create an event in Attio as a note/timeline entry
   * @param {Object} eventData - Event data to create
   * @param {string} recordIdOrEmail - Attio record ID or email address
   * @returns {Promise<Object>} Event creation result
   */
  async createEvent(eventData, recordIdOrEmail) {
    if (!this.enabled) {
      return { success: false, error: 'Attio not configured' };
    }

    try {
      let recordId = recordIdOrEmail;

      // If it looks like an email, look up the record ID
      if (recordIdOrEmail.includes('@')) {
        const person = await this.findPersonByEmail(recordIdOrEmail);
        if (person) {
          recordId = person.id?.record_id;
        } else {
          logger.warn(`[Attio] Person not found for email: ${recordIdOrEmail}, cannot create event`);
          return { success: false, error: 'Person not found in Attio' };
        }
      }

      // Attio API v2 - create a note as timeline entry
      const response = await axios.post(
        `${this.baseUrl}/notes`,
        {
          data: {
            parent_object: 'people',
            parent_record_id: recordId,
            title: eventData.event_type || 'Event',
            format: 'plaintext',
            content: `Event: ${eventData.event_type}\nPlatform: ${eventData.platform}\nTimestamp: ${eventData.created_at}`,
            created_at: eventData.created_at || new Date().toISOString()
          }
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      logger.debug(`[Attio] Created event note for record ${recordId}: ${eventData.event_type}`);

      return { success: true, data: response.data };

    } catch (error) {
      // Log but don't fail - Attio event tracking is optional
      logger.error(`[Attio] Failed to create event:`, error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get service statistics
   * @returns {Object} Service stats
   */
  getStats() {
    return {
      ...this.stats,
      enabled: this.enabled,
      configured: !!this.apiKey
    };
  }
}

module.exports = AttioService;