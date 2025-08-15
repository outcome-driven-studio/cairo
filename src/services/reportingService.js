const logger = require("../utils/logger");

class ReportingService {
  constructor(lemlistService, smartleadService) {
    this.lemlist = lemlistService;
    this.smartlead = smartleadService;
    logger.info("ReportingService initialized");
  }

  /**
   * Generate Lemlist weekly summary in markdown format
   * @returns {Promise<string>} Markdown formatted summary
   */
  async generateLemlistWeeklySummary() {
    const summary = await this.lemlist.generateWeeklySummary();
    
    return `## LEMLIST THIS WEEK
- Contacted: ${summary.contacted}
- Opened: ${summary.opened}
- Interaction: ${summary.interaction}
- Answered: ${summary.answered}`;
  }

  /**
   * Generate Lemlist daily table in markdown format
   * @returns {Promise<string>} Markdown formatted table
   */
  async generateLemlistDailyTable() {
    const activities = await this.lemlist.getWeeklyActivities();
    
    // Group activities by date and campaign
    const groupedActivities = {};
    activities.forEach(activity => {
      const date = new Date(activity.createdAt || activity.date).toISOString().split('T')[0];
      const campaignName = activity.campaignName || 'Unknown Campaign';
      
      const key = `${date}:${campaignName}`;
      if (!groupedActivities[key]) {
        groupedActivities[key] = {
          date,
          campaign: campaignName,
          platform: 'Lemlist',
          sent: 0,
          opened: 0,
          replied: 0
        };
      }
      
      const type = activity.type?.toLowerCase();
      if (type === 'linkedinsent' || type === 'linkedininvitedone') {
        groupedActivities[key].sent++;
      }
      if (type === 'linkedinopened' || type === 'linkedinvisit') {
        groupedActivities[key].opened++;
      }
      if (type === 'linkedinreplied' || type === 'linkedinconnected') {
        groupedActivities[key].replied++;
      }
    });
    
    // Convert to array and sort by date
    const rows = Object.values(groupedActivities)
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    
    // Generate table
    const table = [
      '| Date | Campaign | Platform | Sent | Opened | Replied |',
      '| ---- | -------- | -------- | ---- | ------ | ------- |'
    ];
    
    rows.forEach(row => {
      table.push(
        `| ${row.date} | ${row.campaign} | ${row.platform} | ${row.sent} | ${row.opened} | ${row.replied} |`
      );
    });
    
    return table.join('\n');
  }

  /**
   * Generate Smartlead campaign summary in markdown format
   * @param {string} startDate - Start date in YYYY-MM-DD format
   * @param {string} endDate - End date in YYYY-MM-DD format
   * @returns {Promise<string>} Markdown formatted summary
   */
  async generateSmartleadCampaignSummary(startDate, endDate) {
    const stats = await this.smartlead.getCampaignStats(startDate, endDate);
    
    if (!stats?.length) {
      return "## SMARTLEAD CAMPAIGN SUMMARY\nNo campaign statistics found for this period.";
    }
    
    const table = [
      '## SMARTLEAD CAMPAIGN SUMMARY',
      '| Campaign Name | Emails Sent | Opened | Replied |',
      '| ------------ | ----------- | ------ | ------- |'
    ];
    
    stats.forEach(stat => {
      table.push(
        `| ${stat.campaignName} | ${stat.emailsSent} | ${stat.opened} | ${stat.replied} |`
      );
    });
    
    return table.join('\n');
  }

  /**
   * Generate Smartlead replies table in markdown format
   * @param {string} startDate - Start date in YYYY-MM-DD format
   * @param {string} endDate - End date in YYYY-MM-DD format
   * @returns {Promise<string>} Markdown formatted table
   */
  async generateSmartleadRepliesTable(startDate, endDate) {
    const replies = await this.smartlead.getCampaignReplies(startDate, endDate);
    
    if (!replies?.length) {
      return "## SMARTLEAD REPLIES\nNo replies found for this period.";
    }
    
    const table = [
      '## SMARTLEAD REPLIES',
      '| Email | Campaign Name | Reply Content |',
      '| ----- | ------------ | ------------- |'
    ];
    
    replies.forEach(reply => {
      table.push(
        `| ${reply.email} | ${reply.campaignName} | ${reply.replyContent.substring(0, 100)}${reply.replyContent.length > 100 ? '...' : ''} |`
      );
    });
    
    return table.join('\n');
  }

  /**
   * Generate complete report for both platforms
   * @returns {Promise<string>} Complete markdown formatted report
   */
  async generateCompleteReport() {
    // Get dates for this week
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);

    // Format dates as YYYY-MM-DD
    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];

    try {
      // Generate all reports
      const [
        lemlistWeekly,
        lemlistDaily,
        smartleadSummary,
        smartleadReplies
      ] = await Promise.all([
        this.generateLemlistWeeklySummary(),
        this.generateLemlistDailyTable(),
        this.generateSmartleadCampaignSummary(startDateStr, endDateStr),
        this.generateSmartleadRepliesTable(startDateStr, endDateStr)
      ]);

      // Combine all reports
      return `# Weekly Report (${startDateStr} to ${endDateStr})

${lemlistWeekly}

## Lemlist Daily Activity
${lemlistDaily}

${smartleadSummary}

${smartleadReplies}`;
    } catch (error) {
      logger.error(`Error generating complete report: ${error.message}`);
      throw error;
    }
  }
}

module.exports = ReportingService; 