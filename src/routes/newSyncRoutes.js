const express = require('express');
const logger = require('../utils/logger');
const monitoring = require('../utils/monitoring');
const { query } = require('../utils/db');
const syncState = require('../utils/syncState');
const LemlistService = require('../services/lemlistService');
const SmartleadService = require('../services/smartleadService');
// Removed SegmentService - using direct Mixpanel integration instead





class NewSyncRoutes {
    constructor() {
        this.lemlistService = new LemlistService();
        this.smartleadService = new SmartleadService();
        // Segment removed - using direct integrations

        this.handleInitialSync = this.handleInitialSync.bind(this);
        this.handleBatchSmartleadSync = this.handleBatchSmartleadSync.bind(this);
    }

    async handleInitialSync(req, res) {
        try {
            logger.warn("--- TRIGGERED INITIAL SYNC ---");

            // 1. Fetch campaigns from both services
            const [
                lemlistCampaigns,
                smartleadCampaigns
            ] = await Promise.all([
                this.lemlistService.getCampaigns(),
                this.smartleadService.getCampaigns(),
            ]);

            logger.warn(`[1/3] Found ${lemlistCampaigns.length} Lemlist campaigns and ${smartleadCampaigns.length} Smartlead campaigns.`);


            // 2. Combine and sort all campaigns by creation date
            const allCampaigns = [
                ...lemlistCampaigns.map(c => ({ ...c, platform: 'lemlist' })),
                // ...smartleadCampaigns.map(c => ({ ...c, platform: 'smartlead' }))
            ];
            allCampaigns.sort((a, b) => new Date(a.createdAt || a.created_at) - new Date(b.createdAt || b.created_at));

            logger.warn(`[2/3] Combined and sorted ${allCampaigns.length} total campaigns.`);

            // 3. Process campaigns in chronological order
            logger.warn(`[3/3] Processing all campaigns in order...`);
            for (const campaign of allCampaigns) {
                if (campaign.platform === 'lemlist') {
                    const leadMap = new Map();
                    logger.info(`[3/3] Processing campaign: ${campaign.name}, ${JSON.stringify(campaign, null, 2)}`);
                    const leads = await this.lemlistService.getLeads(campaign._id);
                    logger.info(`[3/3] Found ${leads.length} leads for campaign: ${campaign.name}`);
                    if (leads && Array.isArray(leads)) {
                        for (const lead of leads) {
                            leadMap.set(lead._id, lead);
                        }
                    }
                    const activities = await this.lemlistService.getCampaignActivities(campaign._id);
                    logger.info(`[3/3] Found ${activities.length} activities for campaign: ${campaign.name}, ${JSON.stringify(activities, null, 2)}`);
                    logger.warn(`  -> Processing ${activities.length} activities for Lemlist campaign: ${campaign.name}`);
                    await this.processLemlistActivities(activities, leadMap);
                } else if (campaign.platform === 'smartlead') {
                    logger.info(`[3/3] Processing campaign: ${campaign.name}, ${JSON.stringify(campaign, null, 2)}`);
                    await this.processSmartleadCampaign(campaign);
                }
            }

            logger.warn("--- INITIAL SYNC COMPLETE ---");

            res.status(202).json({
                status: "accepted",
                message: "Initial sync processing started. Check logs for progress.",
            });
        } catch (error) {
            logger.error(`❌❌❌ INITIAL SYNC ROUTE FAILED: ${error.message}`, { stack: error.stack });
            await monitoring.captureError(error, { type: "initial-sync-route" });
            res.status(500).json({ status: "error", message: error.message });
        }
    }

    async handleBatchSmartleadSync(req, res) {
        try {
            const { campaignIds } = req.body;
            logger.warn("--- TRIGGERED BATCH SMARTLEAD SYNC ---");
            const campaigns = await this.smartleadService.getCampaignsByIds(campaignIds);
            logger.info(`[BATCH] Found ${campaigns.length} campaigns`);

            const preProcessedCampaigns = campaigns.map(c => (
                { ...c, platform: 'smartlead' }));

            for (const campaign of preProcessedCampaigns) {
                logger.info(`[BATCH] Processing campaign: ${campaign.name}, ${JSON.stringify(campaign, null, 2)}`);
                await this.processSmartleadCampaign(campaign);
            }
            logger.warn("--- BATCH SMARTLEAD SYNC COMPLETE ---");
            res.status(202).json({
                status: "accepted",
                message: "Batch smartlead sync processing started. Check logs for progress.",
            });
        } catch (error) {
            logger.error(`❌❌❌ BATCH SMARTLEAD SYNC ROUTE FAILED: ${error.message}`, { stack: error.stack });
            await monitoring.captureError(error, { type: "batch-smartlead-sync-route" });
        }
    }


    async getOrCreateUserByLinkedInUrl(linkedinUrl, userData = {}, campaign = null) {
        if (!linkedinUrl) {
            try {
                const email = userData.email
                let existingUser = null;
                if (email) {
                    const emailResult = await query(
                        'SELECT * FROM user_source WHERE email = $1',
                        [email]
                    );
                    if (emailResult.rows.length > 0) {
                        existingUser = emailResult.rows[0];
                    }
                }

                if (existingUser) {
                    // User exists, update any empty fields with new data
                    const updates = [];
                    const params = [];
                    let paramIndex = 1;

                    if (linkedinUrl && !existingUser.linkedin_profile) {


                        updates.push(`linkedin_profile = $${paramIndex++}`);
                        params.push(linkedinUrl);
                    }

                    // Always update the timestamp
                    updates.push(`updated_at = NOW()`);

                    if (updates.length > 0) {
                        params.push(existingUser.id);
                        const updateQuery = `
                        UPDATE user_source 
                        SET ${updates.join(', ')}
                        WHERE id = $${paramIndex}
                        RETURNING *
                    `;

                        const result = await query(updateQuery, params);
                        const updatedUser = result.rows[0];
                        const supersyncId = updatedUser.id;
                        logger.info(`[DB] Updated existing user with supersync_id: ${supersyncId} for linkedin_url: ${linkedinUrl}`);
                        return supersyncId;
                    } else {
                        const supersyncId = existingUser.id;
                        logger.info(`[DB] Found existing user with supersync_id: ${supersyncId} for linkedin_url: ${linkedinUrl} (no updates needed)`);
                        return supersyncId;
                    }
                } else {
                    // User doesn't exist, create new user record
                    const userDataForCreation = {
                        email: userData.email || null,
                        linkedin_url: linkedinUrl,
                        name: userData.name || null,
                        platform: userData.platform || 'lemlist'
                    };

                    const newUser = await this.upsertUserSource(userDataForCreation, campaign);
                    if (newUser) {
                        const supersyncId = newUser.id;
                        logger.info(`[DB] Created new user with supersync_id: ${supersyncId} for linkedin_url: ${linkedinUrl}`);
                        return supersyncId;
                    } else {
                        logger.error(`[DB] Failed to create user for linkedin_url: ${linkedinUrl}`);
                        return null;
                    }
                }

            } catch (error) {
                logger.error(`[DB] Error checking/creating user ${error.message}, ${error.stack}`)
            }

        } else {


            try {
                // Check if user already exists by email or linkedin_profile
                let existingUser = null;
                if (linkedinUrl) {
                    const linkedinResult = await query(
                        'SELECT * FROM user_source WHERE linkedin_profile = $1',
                        [linkedinUrl]
                    );
                    if (linkedinResult.rows.length > 0) {
                        existingUser = linkedinResult.rows[0];
                    }
                }

                if (existingUser) {
                    // User exists, update any empty fields with new data
                    const updates = [];
                    const params = [];
                    let paramIndex = 1;



                    if (userData.email && !existingUser.email) {


                        updates.push(`linkedin_profile = $${paramIndex++}`);
                        params.push(linkedinUrl);
                    }

                    // Always update the timestamp
                    updates.push(`updated_at = NOW()`);

                    if (updates.length > 0) {
                        params.push(existingUser.id);
                        const updateQuery = `
                        UPDATE user_source 
                        SET ${updates.join(', ')}
                        WHERE id = $${paramIndex}
                        RETURNING *
                    `;

                        const result = await query(updateQuery, params);
                        const updatedUser = result.rows[0];
                        const supersyncId = updatedUser.id;
                        logger.info(`[DB] Updated existing user with supersync_id: ${supersyncId} for linkedin_url: ${linkedinUrl}`);
                        return supersyncId;
                    } else {
                        const supersyncId = existingUser.id;
                        logger.info(`[DB] Found existing user with supersync_id: ${supersyncId} for linkedin_url: ${linkedinUrl} (no updates needed)`);
                        return supersyncId;
                    }
                } else {
                    // User doesn't exist, create new user record
                    const userDataForCreation = {
                        email: userData.email || null,
                        linkedin_url: linkedinUrl,
                        name: userData.name || null,
                        platform: userData.platform || 'lemlist'
                    };

                    const newUser = await this.upsertUserSource(userDataForCreation, campaign);
                    if (newUser) {
                        const supersyncId = newUser.id;
                        logger.info(`[DB] Created new user with supersync_id: ${supersyncId} for linkedin_url: ${linkedinUrl}`);
                        return supersyncId;
                    } else {
                        logger.error(`[DB] Failed to create user for linkedin_url: ${linkedinUrl}`);
                        return null;
                    }
                }
            } catch (error) {
                logger.error(`[DB] Error checking/creating user for linkedin_url: ${linkedinUrl}`, error);
                return null;
            }
        }
    }

    async processLemlistActivities(activities, leadMap) {

        // First, process all items in lead map to get supersync IDs
        const leadToSupersyncMap = new Map();

        for (const [leadId, leadData] of leadMap) {
            const linkedinUrl = leadData.linkedinUrl;
            if (!linkedinUrl) {
                logger.warn(`[PROCESS] Skipping lead ${leadId} - no linkedin_url found`);
                continue;
            }

            const userData = {
                email: leadData.email || null,
                linkedin_url: leadData.linkedinUrl || null,
                name: `${leadData.firstName || ''} ${leadData.lastName || ''}`.trim() || null,
                platform: 'lemlist'
            };

            logger.info(`[PROCESS] Getting or creating user for lead ${leadId} with linkedin_url: ${linkedinUrl}, ${JSON.stringify(userData, null, 2)}`);

            const supersyncId = await this.getOrCreateUserByLinkedInUrl(
                linkedinUrl,
                userData,
                { name: 'Lemlist Campaign' }
            );

            logger.info(`[PROCESS] Got or created user for lead ${leadId} with supersync_id: ${supersyncId}`);

            if (supersyncId) {
                leadToSupersyncMap.set(leadId, supersyncId);
                logger.info(`[PROCESS] Mapped lead ${leadId} to supersync_id: ${supersyncId} for linkedin_url: ${linkedinUrl}`);
            } else {
                logger.warn(`[PROCESS] Failed to get/create user for lead ${leadId} with linkedin_url: ${linkedinUrl}`);
            }
        }

        logger.info(`[PROCESS] Processed ${leadToSupersyncMap.size} leads with supersync IDs out of ${leadMap.size} total leads`);

        // Now process activities using the supersync IDs
        for (const activity of activities) {
            logger.info(`[3/3] Processing activity: ${activity.type}, ${JSON.stringify(activity, null, 2)}`);
            // ENFORCE RULE: Lemlist is for LinkedIn events ONLY.
            if (!activity.type || !activity.type.toLowerCase().startsWith('linkedin')) {
                continue;
            }

            let leadData = activity;
            let linkedinUrl = activity.linkedinUrl;
            let leadId = activity.leadId;
            let email = activity.email;
            let supersyncId;

            // If we have a contactId, try to get more data from the lead map
            if (activity.leadId) {
                const mappedLead = leadMap.get(activity.leadId);
                if (mappedLead) {
                    leadData = mappedLead;
                    linkedinUrl = mappedLead.linkedinUrl || linkedinUrl;
                    leadId = mappedLead._id || activity.leadId;
                    supersyncId = leadToSupersyncMap.get(leadId);
                    logger.info(`[PROCESS] Found lead data for leadId ${activity.leadId}: ${JSON.stringify(mappedLead).substring(0, 200)}...`);
                }
            }

            // Use leadId and linkedin_url as source of truth - email is optional
            if (!leadId || !linkedinUrl) {
                logger.warn(`[PROCESS] Skipping Lemlist activity due to missing leadId or linkedin_url. Activity Type: ${activity.type}, LeadId: ${leadId}, LinkedIn: ${linkedinUrl}`);
                continue;
            }

            if (!supersyncId) {
                logger.warn(`[PROCESS] No supersync_id found for leadId: ${leadId}, linkedin_url: ${linkedinUrl}. Skipping activity processing.`);
                continue;
            }


            await this.insertEventSource({
                event_key: `lemlist-${activity.type}-${supersyncId}-${activity._id}`,
                event_type: this.getSegmentEventName('lemlist', activity.type),
                platform: 'lemlist',
                user_id: supersyncId,
                timestamp: new Date(activity.createdAt),
                sent_time: new Date(activity.createdAt),
                campaignName: activity.campaignName,
                meta: {
                    event: { ...activity },
                    campaignId: activity.campaignId,
                    leadId: leadId,
                    linkedin_url: linkedinUrl,
                    supersync_id: supersyncId,
                    hasEmail: !!email,
                },
            });
        }
    }

    async processSmartleadCampaign(campaign) {
        logger.info(`[3/3] Processing Smartlead campaign: ${campaign.name} (ID: ${campaign.id}, External ID: ${campaign.external_id})`);
        const campaignId = campaign.external_id || campaign.id;

        try {
            // Get leads for this campaign
            const leadsData = await this.smartleadService.getLeads(campaignId);
            logger.info(`[3/3] Got leads data for campaign: ${campaign.name}`);
            const leads = leadsData?.data || [];
            logger.info(`[3/3] Found ${leads.length} leads for campaign: ${campaign.name}`);

            // First, process all leads to get supersync IDs (similar to Lemlist)
            const leadToSupersyncMap = new Map();

            for (const lead of leads) {
                const leadData = lead.lead;
                if (!leadData) {
                    logger.warn(`[PROCESS] Skipping lead with no lead data`);
                    continue;
                }
                logger.info(`[PROCESS] Processing Smartlead lead ${leadData.id} with email: ${leadData.email}, linkedin_url: ${leadData.linkedin_profile}, ${JSON.stringify(leadData, null, 2)}`);

                const email = leadData.email?.trim().toLowerCase();
                const linkedinUrl = leadData.linkedin_profile;
                const leadId = leadData.id;

                if (!email) {
                    logger.warn(`[PROCESS] Skipping Smartlead lead ${leadId} - no email found`);
                    continue;
                }

                const userData = {
                    email: email,
                    linkedin_url: linkedinUrl || null,
                    name: `${leadData.first_name || ''} ${leadData.last_name || ''}`.trim() || null,
                    platform: 'smartlead'
                };

                logger.info(`[PROCESS] Getting or creating user for Smartlead lead ${leadId} with email: ${email}, linkedin_url: ${linkedinUrl || 'null'}, ${JSON.stringify(userData, null, 2)}`);


                logger.info(`[PROCESS] Getting or creating user for Smartlead lead ${leadId} with email: ${email}, linkedin_url: ${linkedinUrl || 'null'}, ${JSON.stringify(userData, null, 2)}`);

                const supersyncId = await this.getOrCreateUserByLinkedInUrl(
                    linkedinUrl,
                    userData,
                    campaign
                );


                logger.info(`[PROCESS] Got or created user for Smartlead lead ${leadId} with supersync_id: ${supersyncId}`);

                if (supersyncId) {
                    leadToSupersyncMap.set(email, supersyncId);
                    logger.info(`[PROCESS] Mapped Smartlead lead ${leadId} to supersync_id: ${supersyncId} for email: ${email}`);
                } else {
                    logger.warn(`[PROCESS] Failed to get/create user for Smartlead lead ${leadId} with email: ${email}`);
                }
            }

            logger.info(`[PROCESS] Processed ${leadToSupersyncMap.size} Smartlead leads with supersync IDs out of ${leads.length} total leads`);

            // Process different types of events
            const processEvents = async (eventType, eventFetcher) => {
                logger.info(`[PROCESS] Processing ${eventType} events for campaign: ${campaign.name}`);
                try {
                    const eventsData = await eventFetcher(campaignId);

                    logger.info(`[PROCESS] Got ${eventType} data for campaign: ${campaign.name}`);
                    const events = eventsData?.data || [];
                    logger.info(`[PROCESS] Processing ${events.length} ${eventType} events for campaign: ${campaign.name}`);

                    for (const event of events) {
                        logger.info(`[PROCESS] Processing ${eventType} event: ${JSON.stringify(event, null, 2)}...`);

                        if (!event.lead_email) {
                            logger.warn(`[PROCESS] Skipping ${eventType} event with no email: ${JSON.stringify(event)}`);
                            continue;
                        }

                        const leadEmail = event.lead_email;
                        const leadId = event.lead_id || event.lead?.id;

                        // Get supersync_id from our pre-processed map
                        const supersyncId = leadToSupersyncMap.get(leadEmail);
                        if (!supersyncId) {
                            logger.warn(`[PROCESS] No supersync_id found for Smartlead leadId: ${leadId}, email: ${leadEmail}. Skipping event processing.`);
                            continue;
                        }

                        logger.info(`[PROCESS] ✅ Using supersync_id: ${supersyncId} for Smartlead ${eventType} event, leadId: ${leadId}, email: ${leadEmail}`);

                        await this.insertEventSource({
                            email: leadEmail,
                            event_key: `smartlead-${eventType}-${supersyncId}-${event.id || event.email_campaign_seq_id || 'unknown'}`,
                            event_type: this.getSegmentEventName('smartlead', eventType),
                            platform: 'smartlead',
                            user_id: supersyncId,
                            sent_time: new Date(eventType === "sent" ? event.sent_time : eventType === "opened" ? event.open_time : eventType === "clicked" ? event.click_time : eventType === "replied" ? event.reply_time : event.created_at),
                            timestamp: new Date(eventType === "sent" ? event.sent_time : eventType === "opened" ? event.open_time : eventType === "clicked" ? event.click_time : eventType === "replied" ? event.reply_time : event.created_at),
                            campaignName: campaign.name,
                            meta: {
                                event: { ...event },
                                campaign: { ...campaign },
                                campaignId: campaign.id,
                                leadId: leadId,
                                leadEmail: leadEmail,
                                eventType: eventType,
                                emailCampaignSeqId: event.email_campaign_seq_id,
                                message: event.email_body,
                                supersync_id: supersyncId,
                                hasEmail: true,
                                sent_time: new Date(eventType === "sent" ? event.sent_time : eventType === "opened" ? event.open_time : eventType === "clicked" ? event.click_time : eventType === "replied" ? event.reply_time : event.created_at),
                                timestamp: new Date(eventType === "sent" ? event.sent_time : eventType === "opened" ? event.open_time : eventType === "clicked" ? event.click_time : eventType === "replied" ? event.reply_time : event.created_at),

                            },
                        });
                    }
                } catch (error) {
                    logger.error(`[PROCESS] Error processing ${eventType} events for campaign ${campaign.name}: ${error.message}`);
                    await monitoring.captureError(error, {
                        type: `process-smartlead-${eventType}-events`,
                        campaignId: campaignId
                    });
                }
            };

            // Process different event types
            await processEvents('sent', this.smartleadService.getSentEmails.bind(this.smartleadService));
            await processEvents('opened', this.smartleadService.getOpenedEmails.bind(this.smartleadService));
            await processEvents('clicked', this.smartleadService.getClickedEmails.bind(this.smartleadService));
            await processEvents('replied', this.smartleadService.getRepliedEmails.bind(this.smartleadService));

            logger.info(`[PROCESS] ✅ Finished processing Smartlead campaign: ${campaign.name}`);
        } catch (error) {
            logger.error(`[PROCESS] ❌ Error processing Smartlead campaign ${campaign.name}: ${error.message}`);
            logger.error(error.stack);
            await monitoring.captureError(error, {
                type: "process-smartlead-campaign",
                campaignId: campaignId
            });
        }
    }

    getSegmentEventName(platform, eventType) {
        const lemlistMap = {
            'linkedinSent': 'LinkedIn Message Sent',
            'linkedinOpened': 'LinkedIn Profile Viewed',
            'linkedinReplied': 'LinkedIn Message Replied',
            'linkedinInviteAccepted': 'LinkedIn Invite Accepted',
            'linkedin_profile_viewed': 'LinkedIn Profile Viewed',
        };

        const smartleadMap = {
            'sent': 'Email Sent',
            'opened': 'Email Opened',
            'clicked': 'Email Clicked',
            'replied': 'Email Replied',
        };


        if (platform === 'lemlist') {
            return lemlistMap[eventType] || eventType;
        }

        if (platform === 'smartlead') {
            return smartleadMap[eventType] || eventType;
        }

        return eventType;
    }


    async insertEventSource(eventData) {
        try {

            logger.error(`[PROCESS] Inserting event source: ${JSON.stringify(eventData, null, 2)}`);

            // Ensure we have required fields
            if (!eventData.event_key) {
                logger.error(`[PROCESS] Missing event_key in eventData`);
                return null;
            }

            // Handle email - use a fallback if not provided
            const email = eventData.email || `linkedin-${eventData.user_id || 'unknown'}`;
            const isRealEmail = email.includes('@');
            const emailForDb = isRealEmail ? email.toLowerCase() : email;

            // const checkAlreadyThere = await query(`SELECT * FROM user_source WHERE event_key = $1`, [eventData.event_key])

            // if (checkAlreadyThere.rows.length > 0) {
            //     return null
            // }

            const result = await query(
                `INSERT INTO event_source (event_key, user_id, event_type, platform, metadata)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (event_key) DO NOTHING
             RETURNING *`,
                [eventData.event_key, eventData.user_id, eventData.event_type, eventData.platform, eventData.meta]
            );
            if (result.rows.length > 0) {
                logger.info(`✅ Created new event: ${eventData.event_key}`);

                // Note: Events are now tracked via direct integrations (Mixpanel, Attio)
                // Remove this comment when implementing Mixpanel integration for Lemlist/Smartlead events
                return result.rows[0];
            }
            return null;
        } catch (error) {
            logger.error(`Failed to create event for: ${eventData?.email || 'unknown'}`, error);
            await monitoring.captureError(error, { type: "insert-event-source" });
            return null;
        }
    }

    async upsertUserSource(userData, campaign) {
        // For user_source table, we need either email or linkedin_profile
        if (!userData.email && !userData.linkedin_url) {
            logger.warn('[DB] ❌ Skipping invalid user data: missing both email and linkedin_url');
            return null;
        }

        const email = userData.email ? userData.email.trim().toLowerCase() : null;
        const linkedinProfile = userData.linkedin_url || null;

        try {
            const enrichmentProfile = {
                platform: userData.platform,
                name: userData.name
            };

            // Check if user already exists by email or linkedin_profile
            let existingUser = null;
            if (email) {
                const emailResult = await query(
                    'SELECT * FROM user_source WHERE email = $1',
                    [email]
                );
                if (emailResult.rows.length > 0) {
                    existingUser = emailResult.rows[0];
                }
            }

            if (!existingUser && linkedinProfile) {
                const linkedinResult = await query(
                    'SELECT * FROM user_source WHERE linkedin_profile = $1',
                    [linkedinProfile]
                );
                if (linkedinResult.rows.length > 0) {
                    existingUser = linkedinResult.rows[0];
                }
            }

            if (existingUser) {
                // User exists, update any empty fields with new data
                const updates = [];
                const params = [];
                let paramIndex = 1;

                // Update email if current is null and we have new email
                if (!existingUser.email && email) {
                    updates.push(`email = $${paramIndex++}`);
                    params.push(email);
                }

                // Update linkedin_profile if current is null and we have new linkedin_profile
                if (!existingUser.linkedin_profile && linkedinProfile) {
                    updates.push(`linkedin_profile = $${paramIndex++}`);
                    params.push(linkedinProfile);
                }

                // Update enrichment_profile with new data
                const currentEnrichment = existingUser.enrichment_profile || {};
                const newEnrichment = {
                    ...currentEnrichment,
                    ...enrichmentProfile,
                    // Merge sources if they exist
                    sources: {
                        ...(currentEnrichment.sources || {}),
                        ...(enrichmentProfile.sources || {})
                    }
                };
                updates.push(`enrichment_profile = $${paramIndex++}`);
                params.push(newEnrichment);

                // Update meta array with new userData
                const currentMeta = existingUser.meta || [];
                const updatedMeta = [...currentMeta, userData];
                updates.push(`meta = $${paramIndex++}`);
                params.push(JSON.stringify(updatedMeta));

                // Always update the timestamp
                updates.push(`updated_at = NOW()`);

                if (updates.length > 0) {
                    params.push(existingUser.id);
                    const updateQuery = `
                        UPDATE user_source 
                        SET ${updates.join(', ')}
                        WHERE id = $${paramIndex}
                        RETURNING *
                    `;

                    const result = await query(updateQuery, params);
                    const updatedUser = result.rows[0];
                    logger.info(`✅ Updated existing user with id: ${updatedUser.id} (email: ${updatedUser.email || 'null'}, linkedin: ${updatedUser.linkedin_profile || 'null'})`);

                    // Note: User identification now handled via direct integrations

                    return updatedUser;
                } else {
                    logger.info(`✅ User already exists with id: ${existingUser.id}, no updates needed`);
                    return existingUser;
                }
            } else {
                // User doesn't exist, create new record
                const result = await query(
                    `INSERT INTO user_source (email, linkedin_profile, enrichment_profile, meta, updated_at)
                     VALUES ($1, $2, $3, $4, NOW())
                     RETURNING *`,
                    [
                        email,
                        linkedinProfile,
                        enrichmentProfile,
                        JSON.stringify([...(existingUser?.meta || []), { ...userData, platform: userData.platform }])
                    ]
                );

                const newUser = result.rows[0];
                const supersyncId = newUser.id;

                logger.info(`✅ Created new user with supersync_id: ${supersyncId} (email: ${email || 'null'}, linkedin: ${linkedinProfile || 'null'})`);

                // Note: User identification now handled via direct integrations

                return newUser;
            }
        } catch (error) {
            logger.error(`Failed to upsert user in user_source for: ${email || linkedinProfile}`, error);
            await monitoring.captureError(error, { type: "upsert-user-source" });
            return null;
        }
    }

    setupRoutes() {
        const router = express.Router();
        router.post("/initial-sync", this.handleInitialSync);
        // router.post("/lemlist-delta", this.handleLemlistDeltaSync);
        router.post("/batch-smartlead-sync", this.handleBatchSmartleadSync);
        // router.post("/smartlead-delta", this.handleSmartleadDeltaSync);
        return router;
    }
}

module.exports = NewSyncRoutes;