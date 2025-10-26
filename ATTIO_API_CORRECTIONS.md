# Attio API v2 Implementation Corrections

This document explains the corrections made to match Attio's official API v2 documentation.

## Critical Changes

### 1. List People Endpoint

**❌ Incorrect (Initial Implementation):**
```javascript
// WRONG: Using GET request
const response = await axios.get(
  `${this.baseUrl}/objects/people/records`,
  {
    headers: { 'Authorization': `Bearer ${this.apiKey}` },
    params: { limit, offset }
  }
);
```

**✅ Correct (Per Attio Docs):**
```javascript
// CORRECT: Using POST request with query endpoint
const response = await axios.post(
  `${this.baseUrl}/objects/people/records/query`,
  {
    limit: Math.min(limit, 500), // Max 500 per request
    offset
  },
  {
    headers: {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json'
    }
  }
);
```

**Key Differences:**
- Method: `GET` → `POST`
- Endpoint: `/objects/people/records` → `/objects/people/records/query`
- Parameters: Query params → Request body
- Max limit: 500 records per request

**Reference:** [Attio Docs - List Person Records](https://docs.attio.com/rest-api/endpoint-reference/people/list-person-records)

---

### 2. Create Event/Note Endpoint

**❌ Incorrect (Initial Implementation):**
```javascript
// WRONG: Missing data wrapper, incorrect content structure
const response = await axios.post(
  `${this.baseUrl}/notes`,
  {
    parent_object: 'people',
    parent_record_id: userId,
    title: eventData.event_type || 'Event',
    format: 'plaintext',
    content: [
      {
        type: 'text',
        text: `Event: ${eventData.event_type}\n...`
      }
    ]
  },
  { headers: { 'Authorization': `Bearer ${this.apiKey}` } }
);
```

**✅ Correct (Per Attio Docs):**
```javascript
// CORRECT: Proper data wrapper and string content
const response = await axios.post(
  `${this.baseUrl}/notes`,
  {
    data: {  // ← Must wrap in 'data' object
      parent_object: 'people',
      parent_record_id: userId,
      title: eventData.event_type || 'Event',
      format: 'plaintext',
      content: `Event: ${eventData.event_type}\nPlatform: ${eventData.platform}\nTimestamp: ${eventData.created_at}`,  // ← String, not array
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
```

**Key Differences:**
- Request body must be wrapped in `data` object
- `content` is a string, not an array of objects
- `format` options: `'plaintext'` or `'markdown'`
- Can specify `created_at` to backdate notes

**Reference:** [Attio Docs - Create a Note](https://docs.attio.com/rest-api/endpoint-reference/notes/create-a-note)

---

## Important Notes

### Record IDs vs. Email Addresses
- The `parent_record_id` in `createEvent()` must be the Attio **record UUID**, not an email address
- Example valid ID: `"891dcbfc-9141-415d-9b2a-2238a6cc012d"`
- To get record IDs, use `listPeople()` which returns records with their IDs

### Response Structure
Both endpoints return data wrapped in a `data` object:

```javascript
{
  data: {
    // ... actual response data
  }
}
```

Access with: `response.data.data`

### Content Formatting
For notes/events, two format options are available:

1. **plaintext**: Use `\n` for line breaks
   ```javascript
   content: "Line 1\nLine 2\nLine 3"
   ```

2. **markdown**: Supports subset of Markdown
   ```javascript
   format: 'markdown',
   content: "# Heading\n\n- Bullet 1\n- Bullet 2\n\n**Bold text**"
   ```

Supported markdown features:
- Headings: `#`, `##`, `###` (levels 1-3 only)
- Lists: `- item` or `1. item`
- Text styles: `**bold**`, `*italic*`, `~~strikethrough~~`, `==highlight==`
- Links: `[text](url)`

### Pagination
- Maximum `limit` per request: **500 records**
- Use `offset` to paginate through results
- No `hasMore` field in response; check if `data.length === limit` to determine if more records exist

## Testing the Implementation

### Test listPeople()
```javascript
const attioService = new AttioService(process.env.ATTIO_API_KEY);
const result = await attioService.listPeople(10, 0);

console.log('Success:', result.success);
console.log('Count:', result.count);
console.log('First person:', result.data[0]);
```

### Test createEvent()
```javascript
const attioService = new AttioService(process.env.ATTIO_API_KEY);

// Note: userId must be a valid Attio record_id (UUID)
const result = await attioService.createEvent(
  {
    event_type: 'Email Opened',
    platform: 'lemlist',
    created_at: new Date().toISOString()
  },
  '891dcbfc-9141-415d-9b2a-2238a6cc012d' // Valid record_id from listPeople()
);

console.log('Success:', result.success);
console.log('Note created:', result.data);
```

## Common Errors

### 404 Not Found
- **Cause:** Using wrong endpoint or HTTP method
- **Fix:** Ensure using POST for `/records/query` and correct endpoints

### 400 Bad Request
- **Cause:** Missing `data` wrapper or incorrect content structure
- **Fix:** Wrap request body in `data` object for notes endpoint

### Invalid record_id
- **Cause:** Using email instead of UUID for `parent_record_id`
- **Fix:** Get record IDs from `listPeople()` first, then use the UUID

## Migration Checklist

If you have existing code using Attio:

- [ ] Change `GET /objects/people/records` → `POST /objects/people/records/query`
- [ ] Move params from query string to request body
- [ ] Add `Math.min(limit, 500)` to enforce max limit
- [ ] Wrap notes requests in `data` object
- [ ] Change notes `content` from array to string
- [ ] Ensure `parent_record_id` uses UUIDs, not emails
- [ ] Test both endpoints with valid data

## Resources

- [Attio API Overview](https://docs.attio.com/rest-api/overview)
- [List Person Records](https://docs.attio.com/rest-api/endpoint-reference/people/list-person-records)
- [Create a Note](https://docs.attio.com/rest-api/endpoint-reference/notes/create-a-note)
- [Authentication](https://docs.attio.com/rest-api/authentication)
