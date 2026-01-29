const { BaseDestination } = require("../services/destinationService");
const { ResendService } = require("../services/resendService");

/**
 * Resend Destination Plugin
 * Sends emails and syncs identify events to Resend contacts
 */
class ResendDestination extends BaseDestination {
  constructor(config = {}) {
    super(config);
    this.apiKey = config.apiKey;
    this.fromEmail = config.fromEmail;
    this.audienceId = config.audienceId || config.audience_id;
    this.alertEvents = Array.isArray(config.alertEvents) ? config.alertEvents : [];
    this.resend = this.apiKey ? new ResendService(this.apiKey) : null;
  }

  validateConfig() {
    const errors = [];

    if (!this.apiKey) {
      errors.push("apiKey is required");
    }

    if (!this.fromEmail) {
      errors.push("fromEmail is required");
    }

    if (this.fromEmail && typeof this.fromEmail === "string") {
      const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRe.test(this.fromEmail.trim())) {
        errors.push("fromEmail must be a valid email address");
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  async identify(user) {
    if (!this.resend) return { success: false, error: "Resend not configured" };

    const email = user.traits?.email || user.userId || user.anonymousId;
    if (!email || typeof email !== "string") {
      return { success: true, message: "No email to sync" };
    }

    const name = user.traits?.name || "";
    const parts = name.split(/\s+/);
    const firstName = user.traits?.firstName || user.traits?.first_name || parts[0] || "";
    const lastName = user.traits?.lastName || user.traits?.last_name || parts.slice(1).join(" ") || "";

    const result = await this.resend.createContact({
      email: email.trim(),
      firstName: firstName.trim() || undefined,
      lastName: lastName.trim() || undefined,
      unsubscribed: false,
      audienceId: this.audienceId || undefined,
      properties: user.traits && typeof user.traits === "object" ? user.traits : undefined,
    });

    if (!result.success) {
      return { success: false, error: result.error };
    }
    return { success: true, contactId: result.id };
  }

  async track(event) {
    if (!this.resend) return { success: false, error: "Resend not configured" };

    const shouldAlert = this.alertEvents.length === 0 || this.alertEvents.includes(event.event);
    if (!shouldAlert) {
      return { success: true, message: "Event not in alertEvents" };
    }

    const to = event.properties?.email || event.userId || event.anonymousId;
    if (!to || typeof to !== "string") {
      return { success: true, message: "No recipient for email" };
    }

    const subject = `Event: ${event.event}`;
    const html = `<p>Event <strong>${event.event}</strong> was recorded.</p><pre>${JSON.stringify(event.properties || {}, null, 2)}</pre>`;

    const result = await this.resend.sendEmail({
      from: this.fromEmail,
      to: to.trim(),
      subject,
      html,
    });

    if (!result.success) {
      return { success: false, error: result.error };
    }
    return { success: true, emailId: result.id };
  }

  async page(pageView) {
    if (!this.resend) return { success: false, error: "Resend not configured" };
    const shouldAlert = this.alertEvents.length === 0 || this.alertEvents.includes("page") || this.alertEvents.includes("Page Viewed");
    if (!shouldAlert) return { success: true, message: "Page events not configured" };
    const to = pageView.properties?.email || pageView.userId || pageView.anonymousId;
    if (!to || typeof to !== "string") return { success: true, message: "No recipient" };
    return await this.resend.sendEmail({
      from: this.fromEmail,
      to: to.trim(),
      subject: `Page Viewed: ${pageView.name || pageView.properties?.url || "Page"}`,
      html: `<p>Page viewed: <strong>${pageView.name || pageView.properties?.url || "Page"}</strong></p>`,
    });
  }

  async group() {
    return { success: true, message: "Group events not sent to Resend" };
  }

  async alias() {
    return { success: true, message: "Alias events not sent to Resend" };
  }

  async test() {
    if (!this.resend) {
      return { success: false, error: "Resend not configured" };
    }
    const result = await this.resend.test();
    return result.success
      ? { success: true, message: "Resend connection verified" }
      : { success: false, error: result.error || "Connection test failed" };
  }
}

module.exports = ResendDestination;
