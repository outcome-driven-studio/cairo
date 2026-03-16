const SlackDestination = require('./slackDestination');
const MixpanelDestination = require('./mixpanelDestination');
const DiscordDestination = require('./discordDestination');
const ResendDestination = require('./resendDestination');
const WebhookDestination = require('./webhookDestination');
const BigQueryDestination = require('./bigqueryDestination');
const HubSpotDestination = require('./hubspotDestination');
const SalesforceDestination = require('./salesforceDestination');
const GA4Destination = require('./ga4Destination');
const AmplitudeDestination = require('./amplitudeDestination');
const PostHogDestination = require('./posthogDestination');
const BrazeDestination = require('./brazeDestination');
const CustomerIODestination = require('./customerioDestination');
const SendGridDestination = require('./sendgridDestination');
const KafkaDestination = require('./kafkaDestination');
const ElasticsearchDestination = require('./elasticsearchDestination');
const SnowflakeDestination = require('./snowflakeDestination');
const S3Destination = require('./s3Destination');
const IntercomDestination = require('./intercomDestination');
const PipedriveDestination = require('./pipedriveDestination');

const registry = {
  slack: SlackDestination,
  mixpanel: MixpanelDestination,
  discord: DiscordDestination,
  resend: ResendDestination,
  webhook: WebhookDestination,
  bigquery: BigQueryDestination,
  hubspot: HubSpotDestination,
  salesforce: SalesforceDestination,
  ga4: GA4Destination,
  amplitude: AmplitudeDestination,
  posthog: PostHogDestination,
  braze: BrazeDestination,
  customerio: CustomerIODestination,
  sendgrid: SendGridDestination,
  kafka: KafkaDestination,
  elasticsearch: ElasticsearchDestination,
  snowflake: SnowflakeDestination,
  s3: S3Destination,
  intercom: IntercomDestination,
  pipedrive: PipedriveDestination,
};

module.exports = registry;
