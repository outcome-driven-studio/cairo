/**
 * Maps Lemlist activity types to our internal event types
 * Based on https://help.lemlist.com/en/articles/9423940-api-get-activities-list-of-activities-type
 */

/**
 * Maps Lemlist activity types to internal event types
 * This mapping is kept minimal and flexible to support any activity type
 */
const mapLemlistEventType = (type) => {
  if (!type) return "unknown";

  // For backwards compatibility, we keep some core mappings
  // But we also support any new activity type automatically
  const coreMappings = {
    // Email events - keep consistent with existing system
    emailsSent: "email_sent",
    emailsOpened: "email_opened",
    emailsClicked: "email_clicked",
    emailsReplied: "email_replied",
    emailsBounced: "email_bounced",
    emailsUnsubscribed: "email_unsubscribed",
    emailsFailed: "email_failed",

    // LinkedIn events - prefix with linkedin_ for clarity
    linkedinSent: "linkedin_message_sent",
    linkedinOpened: "linkedin_message_opened",
    linkedinReplied: "linkedin_message_replied",
    linkedinInviteSent: "linkedin_invite_sent",
    linkedinInviteAccepted: "linkedin_invite_accepted",
    linkedinConnected: "linkedin_connected",
    linkedinVisit: "linkedin_profile_visited",
    linkedinVisitDone: "linkedin_profile_visited",
    linkedinInviteDone: "linkedin_invite_done",
    linkedinDone: "linkedin_done",
    linkedinSendFailed: "linkedin_send_failed",
    linkedinMessageAccepted: "linkedin_message_accepted",
    linkedinVoiceNoteDone: "linkedin_voice_note_done",

    // Meeting events
    meetingBooked: "meeting_booked",

    // Special grouped types from Lemlist API
    contacted: "contacted", // encompasses all "sent" activities
    hooked: "hooked", // encompasses all "open" activities
    attracted: "attracted", // encompasses all "click" activities
    warmed: "warmed", // encompasses all "reply" activities
    interested: "interested", // encompasses all "interested" activities
    notInterested: "not_interested", // encompasses all "not interested" activities
  };

  // Check if we have a specific mapping
  if (coreMappings[type]) {
    return coreMappings[type];
  }

  // For any unmapped type, create a snake_case version
  // This ensures we support ANY new activity type automatically
  return type
    .replace(/([A-Z])/g, "_$1") // Convert camelCase to snake_case
    .toLowerCase()
    .replace(/^_/, "") // Remove leading underscore if any
    .replace(/_+/g, "_"); // Replace multiple underscores with single
};

/**
 * Determines if an event type is LinkedIn-related
 * Checks both the original type and mapped type
 */
const isLinkedInEvent = (type) => {
  if (!type) return false;

  // Check if the type contains 'linkedin' (case-insensitive)
  return type.toLowerCase().includes("linkedin");
};

/**
 * Determines if an event type is email-related
 */
const isEmailEvent = (type) => {
  if (!type) return false;

  // Check if the type contains 'email' (case-insensitive)
  return type.toLowerCase().includes("email");
};

/**
 * Gets the event category (email, linkedin, aircall, etc.)
 */
const getEventCategory = (type) => {
  if (!type) return "unknown";

  const lowerType = type.toLowerCase();

  if (lowerType.includes("email")) return "email";
  if (lowerType.includes("linkedin")) return "linkedin";
  if (lowerType.includes("aircall")) return "aircall";
  if (lowerType.includes("api")) return "api";
  if (lowerType.includes("manual")) return "manual";
  if (lowerType.includes("meeting")) return "meeting";

  // Special cases
  if (["contacted", "hooked", "attracted", "warmed"].includes(type))
    return "grouped";
  if (["snoozed", "resumed", "paused", "skipped", "annotated"].includes(type))
    return "workflow";

  return "other";
};

/**
 * Gets additional metadata for specific event types
 * This is flexible and will extract any relevant data based on activity structure
 */
const getEventMetadata = (activity) => {
  if (!activity) return {};

  const metadata = {
    // Always include these if available
    isLinkedIn: activity.isLinkedIn || isLinkedInEvent(activity.type),
    isEmail: isEmailEvent(activity.type),
    category: getEventCategory(activity.type),
    originalType: activity.type, // Always preserve the original type
  };

  // Add common fields if they exist
  const commonFields = [
    "isFirst",
    "stopped",
    "bot",
    "sequenceStep",
    "totalSequenceStep",
    "relatedSentAt",
    "errorMessage",
    "sendUserName",
    "sendUserEmail",
    "leadFirstName",
    "leadLastName",
    "leadCompanyName",
    "leadEmail",
  ];

  commonFields.forEach((field) => {
    if (activity[field] !== undefined) {
      metadata[field] = activity[field];
    }
  });

  // Add type-specific metadata dynamically
  // Instead of a big switch statement, we check for presence of fields

  // Meeting-related fields
  if (activity.meetingDate) metadata.meetingDate = activity.meetingDate;
  if (activity.meetingType) metadata.meetingType = activity.meetingType;

  // Condition-related fields
  if (activity.conditionLabel)
    metadata.conditionLabel = activity.conditionLabel;
  if (activity.conditionValue !== undefined)
    metadata.conditionValue = activity.conditionValue;

  // Note/annotation fields
  if (activity.note) metadata.note = activity.note;

  // Delay/snooze fields
  if (activity.delay !== undefined) metadata.delay = activity.delay;

  // Message/text content
  if (activity.text) metadata.message = activity.text;
  if (activity.message) metadata.message = activity.message;

  // URL fields (for clicks, visits, etc.)
  if (activity.url) metadata.url = activity.url;
  if (activity.linkedinUrl) metadata.linkedinUrl = activity.linkedinUrl;

  // Aircall-specific fields
  if (activity.callDuration) metadata.callDuration = activity.callDuration;
  if (activity.callStatus) metadata.callStatus = activity.callStatus;

  // AI-related fields
  if (activity.aiLeadInterestScore !== undefined) {
    metadata.aiLeadInterestScore = activity.aiLeadInterestScore;
  }

  // Sentiment analysis fields
  if (activity.sentiment) metadata.sentiment = activity.sentiment;
  if (activity.sentimentEmoji)
    metadata.sentimentEmoji = activity.sentimentEmoji;

  // Custom variables - include any field that starts with uppercase or contains specific patterns
  Object.keys(activity).forEach((key) => {
    // Include custom fields (usually start with uppercase or contain spaces)
    if (/^[A-Z]/.test(key) || key.includes(" ")) {
      metadata[key] = activity[key];
    }
  });

  return metadata;
};

/**
 * Utility function to get human-readable activity description
 */
const getActivityDescription = (type) => {
  const descriptions = {
    // Emails
    emailsSent: "Email sent",
    emailsOpened: "Email opened",
    emailsClicked: "Link clicked in email",
    emailsReplied: "Email replied",
    emailsBounced: "Email bounced",
    emailsUnsubscribed: "Unsubscribed from emails",
    emailsFailed: "Email failed to send",

    // LinkedIn
    linkedinSent: "LinkedIn message sent",
    linkedinOpened: "LinkedIn message opened",
    linkedinReplied: "LinkedIn message replied",
    linkedinInviteSent: "LinkedIn connection request sent",
    linkedinInviteAccepted: "LinkedIn connection request accepted",
    linkedinConnected: "Connected on LinkedIn",
    linkedinVisit: "LinkedIn profile visited",
    linkedinVisitDone: "LinkedIn profile visit completed",

    // Meetings
    meetingBooked: "Meeting booked",

    // Grouped types
    contacted: "Contact initiated (any channel)",
    hooked: "Engagement detected (opened)",
    attracted: "Interest shown (clicked)",
    warmed: "Conversation started (replied)",
    interested: "Marked as interested",
    notInterested: "Marked as not interested",
  };

  return descriptions[type] || type.replace(/([A-Z])/g, " $1").trim();
};

module.exports = {
  mapLemlistEventType,
  isLinkedInEvent,
  isEmailEvent,
  getEventCategory,
  getEventMetadata,
  getActivityDescription,
};
