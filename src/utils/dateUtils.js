/**
 * Date Utilities for Sync Operations
 *
 * Provides date validation, parsing, and formatting utilities
 * for sync configuration and database operations.
 */

const logger = require("./logger");

/**
 * Supported date formats
 */
const DATE_FORMATS = {
  ISO: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/,
  DATE_ONLY: /^\d{4}-\d{2}-\d{2}$/,
  DATETIME_LOCAL: /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/,
};

/**
 * Parse a date string into a Date object
 * @param {string} dateString - Date string in various formats
 * @returns {Date} Parsed date object
 * @throws {Error} If date format is invalid
 */
function parseDate(dateString) {
  if (!dateString) {
    throw new Error("Date string is required");
  }

  if (typeof dateString !== "string") {
    throw new Error("Date must be a string");
  }

  const trimmed = dateString.trim();

  // Try parsing different formats
  let parsedDate;

  if (DATE_FORMATS.ISO.test(trimmed)) {
    parsedDate = new Date(trimmed);
  } else if (DATE_FORMATS.DATE_ONLY.test(trimmed)) {
    // For date-only format, assume start of day UTC
    parsedDate = new Date(`${trimmed}T00:00:00.000Z`);
  } else if (DATE_FORMATS.DATETIME_LOCAL.test(trimmed)) {
    // For local datetime format, convert to ISO
    parsedDate = new Date(`${trimmed.replace(" ", "T")}.000Z`);
  } else {
    // Try standard Date parsing as fallback
    parsedDate = new Date(trimmed);
  }

  // Validate the parsed date
  if (isNaN(parsedDate.getTime())) {
    throw new Error(
      `Invalid date format: ${dateString}. Supported formats: YYYY-MM-DD, YYYY-MM-DD HH:MM:SS, ISO 8601`
    );
  }

  return parsedDate;
}

/**
 * Validate a date range
 * @param {string} startDate - Start date string
 * @param {string} endDate - End date string
 * @throws {Error} If date range is invalid
 */
function validateDateRange(startDate, endDate) {
  const start = parseDate(startDate);
  const end = parseDate(endDate);

  if (start >= end) {
    throw new Error(
      `Start date (${startDate}) must be before end date (${endDate})`
    );
  }

  const now = new Date();
  if (start > now) {
    logger.warn(`Start date (${startDate}) is in the future`);
  }

  // Check for reasonable date range (not more than 5 years)
  const fiveYearsAgo = new Date(
    now.getFullYear() - 5,
    now.getMonth(),
    now.getDate()
  );
  if (start < fiveYearsAgo) {
    logger.warn(
      `Start date (${startDate}) is more than 5 years ago - this may result in a very large sync operation`
    );
  }

  const diffDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
  if (diffDays > 365) {
    logger.warn(
      `Date range spans ${diffDays} days - this may result in a large sync operation`
    );
  }

  logger.info(
    `Date range validation passed: ${diffDays} days from ${startDate} to ${endDate}`
  );
}

/**
 * Format a date for database queries
 * @param {Date|string} date - Date object or string
 * @returns {string} ISO formatted date string
 */
function formatForDatabase(date) {
  if (typeof date === "string") {
    date = parseDate(date);
  }

  if (!(date instanceof Date)) {
    throw new Error("Date must be a Date object or valid date string");
  }

  return date.toISOString();
}

/**
 * Format a date for API responses
 * @param {Date|string} date - Date object or string
 * @returns {string} ISO formatted date string
 */
function formatForApi(date) {
  return formatForDatabase(date);
}

/**
 * Get date range for "last N days"
 * @param {number} days - Number of days back
 * @returns {object} Object with start and end dates
 */
function getLastNDays(days) {
  if (!days || days < 1 || days > 365) {
    throw new Error("Days must be between 1 and 365");
  }

  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);

  return {
    start: formatForDatabase(start),
    end: formatForDatabase(end),
  };
}

/**
 * Get date range for current month
 * @returns {object} Object with start and end dates
 */
function getCurrentMonth() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0,
    23,
    59,
    59,
    999
  );

  return {
    start: formatForDatabase(start),
    end: formatForDatabase(end),
  };
}

/**
 * Get date range for previous month
 * @returns {object} Object with start and end dates
 */
function getPreviousMonth() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

  return {
    start: formatForDatabase(start),
    end: formatForDatabase(end),
  };
}

/**
 * Check if a date is within a range
 * @param {Date|string} date - Date to check
 * @param {Date|string} startDate - Range start
 * @param {Date|string} endDate - Range end
 * @returns {boolean} True if date is within range
 */
function isWithinRange(date, startDate, endDate) {
  const checkDate = typeof date === "string" ? parseDate(date) : date;
  const start =
    typeof startDate === "string" ? parseDate(startDate) : startDate;
  const end = typeof endDate === "string" ? parseDate(endDate) : endDate;

  return checkDate >= start && checkDate <= end;
}

/**
 * Get a user-friendly relative time string
 * @param {Date|string} date - Date to format
 * @returns {string} Relative time string
 */
function getRelativeTime(date) {
  const checkDate = typeof date === "string" ? parseDate(date) : date;
  const now = new Date();
  const diffMs = now - checkDate;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours === 0) {
      const diffMinutes = Math.floor(diffMs / (1000 * 60));
      return `${diffMinutes} minute${diffMinutes !== 1 ? "s" : ""} ago`;
    }
    return `${diffHours} hour${diffHours !== 1 ? "s" : ""} ago`;
  } else if (diffDays === 1) {
    return "yesterday";
  } else if (diffDays < 7) {
    return `${diffDays} days ago`;
  } else if (diffDays < 30) {
    const diffWeeks = Math.floor(diffDays / 7);
    return `${diffWeeks} week${diffWeeks !== 1 ? "s" : ""} ago`;
  } else if (diffDays < 365) {
    const diffMonths = Math.floor(diffDays / 30);
    return `${diffMonths} month${diffMonths !== 1 ? "s" : ""} ago`;
  } else {
    const diffYears = Math.floor(diffDays / 365);
    return `${diffYears} year${diffYears !== 1 ? "s" : ""} ago`;
  }
}

/**
 * Create date filter for SQL queries
 * @param {object} dateFilter - Date filter from FullSyncConfig
 * @param {string} columnName - SQL column name for date filtering
 * @returns {object} Object with SQL where clause and parameters
 */
function createSqlDateFilter(dateFilter, columnName = "created_at") {
  if (!dateFilter) {
    return { whereClause: "", params: [] };
  }

  const params = [];
  const conditions = [];

  if (dateFilter.start) {
    conditions.push(`${columnName} >= $${params.length + 1}`);
    params.push(formatForDatabase(dateFilter.start));
  }

  if (dateFilter.end) {
    conditions.push(`${columnName} <= $${params.length + 1}`);
    params.push(formatForDatabase(dateFilter.end));
  }

  const whereClause = conditions.length > 0 ? conditions.join(" AND ") : "";

  return { whereClause, params };
}

module.exports = {
  parseDate,
  validateDateRange,
  formatForDatabase,
  formatForApi,
  getLastNDays,
  getCurrentMonth,
  getPreviousMonth,
  isWithinRange,
  getRelativeTime,
  createSqlDateFilter,
  DATE_FORMATS,
};
