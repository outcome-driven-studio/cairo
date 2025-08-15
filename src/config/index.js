/**
 * Configuration loader
 */
require("dotenv").config();

const config = {
  // API Keys
  lemlistApiKey: process.env.LEMLIST_API_KEY,
  smartleadApiKey: process.env.SMARTLEAD_API_KEY,

  attioApiKey: process.env.ATTIO_API_KEY,
  apolloApiKey: process.env.APOLLO_API_KEY || "sgj42DpNm4cmGxVyH3iN6g",

  // API URLs

  // Application settings
  pollIntervalMinutes: parseInt(process.env.POLL_INTERVAL_MINUTES || "5", 10),
  logLevel: process.env.LOG_LEVEL || "info",
  port: parseInt(process.env.PORT || "8080", 10),
  nodeEnv: process.env.NODE_ENV || "development",
};

module.exports = config;
