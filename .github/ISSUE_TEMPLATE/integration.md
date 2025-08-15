---
name: 🔗 Integration Request
about: Request support for a new data source or service integration
title: "[INTEGRATION] "
labels: ["integration", "enhancement"]
assignees: ["anianroid"]
---

## 🔗 Integration Request

<!-- What service/platform would you like Cairo to integrate with? -->

**Service Name:**
**Service Website:**

## 🎯 Use Case

<!-- How would this integration be used? What problem does it solve? -->

## 📊 Data Types

<!-- What kind of data would this integration provide? -->

- [ ] Lead/contact data
- [ ] Email campaign data
- [ ] LinkedIn campaign data
- [ ] CRM data
- [ ] Analytics/event data
- [ ] Enrichment data
- [ ] Other: ****\_\_\_****

## 🔄 Integration Type

<!-- What type of integration are you requesting? -->

- [ ] Data source (import data FROM the service)
- [ ] Data destination (export data TO the service)
- [ ] Bidirectional sync
- [ ] Webhook/real-time events
- [ ] Batch import/export

## 📋 Available APIs

<!-- Information about the service's API -->

- **API Documentation:** [URL]
- **Authentication Type:** [API Key, OAuth, Basic Auth, etc.]
- **Rate Limits:** [e.g., 1000 requests/hour]
- **Pricing:** [Free tier, paid plans, etc.]
- **API Version:** [e.g., v2.0]

## 📈 Data Volume

<!-- Expected data volume for this integration -->

- **Estimated records:** [e.g., 10K contacts]
- **Update frequency:** [Real-time, hourly, daily, weekly]
- **Historical data:** [How far back should we sync?]

## 🔍 Similar Integrations

<!-- Are there similar services Cairo already integrates with? -->

- [ ] Similar to Lemlist (email campaigns)
- [ ] Similar to Smartlead (outbound sequences)
- [ ] Similar to Attio (CRM)
- [ ] Similar to Mixpanel (analytics)
- [ ] Similar to Apollo (enrichment)
- [ ] Completely new type of integration

## 💼 Business Impact

<!-- Why is this integration valuable? -->

- [ ] Serves a large user base
- [ ] Popular in our target market
- [ ] Complements existing integrations
- [ ] Enables new use cases
- [ ] Competitive advantage
- [ ] Community requested

## 🔧 Technical Considerations

<!-- Any technical details about the integration -->

### Data Mapping

<!-- How would this service's data map to Cairo's schema? -->

```javascript
// Example mapping
{
  "serviceField": "cairoField",
  "email": "email",
  "name": "full_name"
}
```

### Required Features

- [ ] Authentication setup
- [ ] Data import/sync
- [ ] Error handling & retries
- [ ] Rate limiting
- [ ] Data validation
- [ ] Deduplication
- [ ] Webhook support
- [ ] Real-time updates

## 📊 Priority Level

<!-- How important is this integration? -->

- [ ] 🔴 Critical - Many users requesting
- [ ] 🟠 High - Would unlock significant value
- [ ] 🟡 Medium - Nice to have addition
- [ ] 🟢 Low - Future consideration

## 🤝 Community Support

<!-- Is there community interest in this integration? -->

- **Number of requests:** [How many users have asked for this?]
- **Community discussion:** [Link to discussions if any]
- **Market demand:** [Evidence of demand for this integration]

## 🛠️ Implementation Suggestions

<!-- If you have ideas on how this could be implemented -->

## 📝 Additional Resources

<!-- Any additional information, documentation, or examples -->

- [ ] Service documentation
- [ ] Code examples
- [ ] Similar implementations
- [ ] Community discussions

## 📋 Checklist

- [ ] I have researched the service's API capabilities
- [ ] I have confirmed this integration doesn't already exist
- [ ] I have provided sufficient technical details
- [ ] I have explained the business value clearly
