/**
 * Resend API client for sending emails and managing contacts.
 * Base URL: https://api.resend.com
 * Auth: Bearer <apiKey>
 */
const axios = require("axios");
const logger = require("../utils/logger");

const RESEND_BASE_URL = "https://api.resend.com";

class ResendService {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.client = axios.create({
      baseURL: RESEND_BASE_URL,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
    });
  }

  /**
   * Send an email
   * POST /emails
   * @param {Object} opts - from (required), to (string or string[]), subject (required), html?, text?, replyTo?, bcc?, cc?
   * @returns {Promise<{ success: boolean, id?: string, error?: string }>}
   */
  async sendEmail(opts) {
    try {
      const { data } = await this.client.post("/emails", {
        from: opts.from,
        to: Array.isArray(opts.to) ? opts.to : [opts.to],
        subject: opts.subject,
        html: opts.html,
        text: opts.text,
        reply_to: opts.replyTo,
        bcc: opts.bcc,
        cc: opts.cc,
      });
      return { success: true, id: data.id };
    } catch (err) {
      const message = err.response?.data?.message || err.message;
      logger.warn("[ResendService] sendEmail failed:", message);
      return { success: false, error: message };
    }
  }

  /**
   * Create a contact
   * POST /contacts
   * @param {Object} opts - email (required), firstName?, lastName?, unsubscribed?, audienceId?, properties?
   * @returns {Promise<{ success: boolean, id?: string, error?: string }>}
   */
  async createContact(opts) {
    try {
      const body = {
        email: opts.email,
        first_name: opts.firstName || opts.first_name,
        last_name: opts.lastName || opts.last_name,
        unsubscribed: opts.unsubscribed === true,
        ...(opts.audience_id && { audience_id: opts.audience_id }),
        ...(opts.audienceId && { audience_id: opts.audienceId }),
        ...(opts.properties && typeof opts.properties === "object" && { properties: opts.properties }),
      };
      const { data } = await this.client.post("/contacts", body);
      return { success: true, id: data.id };
    } catch (err) {
      const message = err.response?.data?.message || err.message;
      logger.warn("[ResendService] createContact failed:", message);
      return { success: false, error: message };
    }
  }

  /**
   * List contacts
   * GET /contacts?limit=&after=&before=
   * @param {Object} opts - limit?, after?, before?
   * @returns {Promise<{ success: boolean, data?: Array, has_more?: boolean, error?: string }>}
   */
  async listContacts(opts = {}) {
    try {
      const params = {};
      if (opts.limit != null) params.limit = opts.limit;
      if (opts.after) params.after = opts.after;
      if (opts.before) params.before = opts.before;
      const { data } = await this.client.get("/contacts", { params });
      return {
        success: true,
        data: data.data || [],
        has_more: data.has_more === true,
      };
    } catch (err) {
      const message = err.response?.data?.message || err.message;
      logger.warn("[ResendService] listContacts failed:", message);
      return { success: false, error: message, data: [] };
    }
  }

  /**
   * Get a single contact by id
   * GET /contacts/:id
   * @param {string} contactId
   * @returns {Promise<{ success: boolean, contact?: Object, error?: string }>}
   */
  async getContact(contactId) {
    try {
      const { data } = await this.client.get(`/contacts/${contactId}`);
      return { success: true, contact: data };
    } catch (err) {
      const message = err.response?.data?.message || err.message;
      logger.warn("[ResendService] getContact failed:", message);
      return { success: false, error: message };
    }
  }

  /**
   * Verify API key by listing contacts (lightweight call)
   * @returns {Promise<{ success: boolean, error?: string }>}
   */
  async test() {
    const result = await this.listContacts({ limit: 1 });
    return { success: result.success, error: result.error };
  }
}

module.exports = { ResendService };
