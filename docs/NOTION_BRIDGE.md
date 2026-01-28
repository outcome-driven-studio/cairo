# Notion → Discord bridge

Use the **Notion-specific** event bridge endpoint when you trigger from Notion’s **Send webhook** action. Notion doesn’t let you customize the request body, so this endpoint understands Notion’s property shapes and turns them into a clear Discord message.

## Endpoint

- **URL:** `POST /api/bridge/notion`
- **Auth:** none
- **Behavior:** Accepts whatever Notion sends, normalizes it, and posts one message to Discord. No database or Mixpanel.

## Setup in Notion

1. In your database (e.g. Tasks), open **Automations**.
2. Add trigger (e.g. “When a property is edited” or “When a page is added”).
3. Add action **Send webhook**.
4. **URL:** `https://YOUR_CAIRO_SERVICE_URL/api/bridge/notion`
5. Optionally **Add custom header** (e.g. if you add auth later).
6. In **Content**, select the database properties you want in the message (e.g. Task name, Assignee, Due date, Status, Client).
7. Enable the automation.

## Payload shape (what Notion sends)

Notion sends a POST body that can look like:

- **Flat:** property names at the top level with values in Notion’s formats.
- **Nested:** same property values under a `properties` object.

The endpoint supports both. It also supports these **Notion property value types** (from the [Notion API / page properties](https://developers.notion.com/reference/page-property-values)):

| Notion type        | Example payload shape                               | Display in Discord        |
|--------------------|------------------------------------------------------|---------------------------|
| **title**          | `[{ "plain_text": "Task name" }]` or `{ "title": [...] }` | Concatenated text         |
| **rich_text**      | `[{ "plain_text": "..." }]` or `{ "rich_text": [...] }`  | Concatenated text         |
| **people**         | `[{ "name": "Jane", "id": "..." }]` or `{ "people": [...] }` | Comma‑separated names     |
| **date**           | `{ "start": "2026-01-30", "end": null }` or `{ "date": { "start", "end" } }` | `start` or `start — end`  |
| **select**         | `{ "name": "In progress" }` or `{ "select": { "name": "..." } }` | Option name               |
| **status**         | `{ "name": "Done" }` or `{ "status": { "name": "..." } }` | Status name               |
| **multi_select**   | `[{ "name": "Tag1" }, ...]` or `{ "multi_select": [...] }` | Comma‑separated names     |
| **checkbox**       | `true` / `false` or `{ "checkbox": true }`           | "Yes" / "No"              |
| **number**         | `42` or `{ "number": 42 }`                           | Number as string          |
| **email**          | `{ "email": "a@b.com" }`                             | Email string              |
| **url**            | `{ "url": "https://..." }`                           | URL string                |
| **phone_number**   | `{ "phone_number": "..." }`                          | Phone string              |
| **created_time**   | `"2026-01-28T12:00:00.000Z"`                         | ISO string                |
| **last_edited_time** | Same as above                                      | ISO string                |
| **created_by** / **last_edited_by** | `{ "name": "...", "object": "user" }`         | User name                 |
| **formula**        | `{ "formula": { "string" \| "number" \| "boolean" \| "date" } }` | String form of result     |

If a field is nested (e.g. `{ "type": "title", "title": [...] }`), the endpoint unwraps it and uses the same display rules.

## Example request bodies

**Flat (e.g. from “Select all existing properties” or similar):**

```json
{
  "Task name": "Ship the feature",
  "Assignee": "Anirudh",
  "Status": "In progress",
  "Due date": "2026-01-30",
  "Client": "VibeTM"
}
```

**Nested (Notion-style with types):**

```json
{
  "id": "abc-123",
  "url": "https://notion.so/...",
  "properties": {
    "Task name": {
      "type": "title",
      "title": [{ "plain_text": "Ship the feature" }]
    },
    "Assignee": {
      "type": "people",
      "people": [{ "name": "Anirudh" }]
    },
    "Due date": {
      "type": "date",
      "date": { "start": "2026-01-30", "end": null }
    },
    "Status": {
      "type": "status",
      "status": { "name": "In progress" }
    }
  }
}
```

Both produce a Discord embed with a sensible title (from the first title-like property) and a description built from the normalized fields.

## Test with curl

```bash
curl -X POST "https://YOUR_SERVICE_URL/api/bridge/notion" \
  -H "Content-Type: application/json" \
  -d '{
    "Task name": "Test task",
    "Assignee": "You",
    "Due date": "2026-01-30",
    "Status": "In progress"
  }'
```

Expect `200` and `{ "success": true, "message": "Notion event sent to Discord" }`, and one message in Discord.

## Requirements

- **DISCORD_WEBHOOK_URL** must be set (e.g. via Secret Manager on GCP). Optionally set **DISCORD_USERNAME** and **DISCORD_AVATAR_URL** so the Discord bot name and avatar match your app.

## See also

- [Event bridge](../../README.md#webhooks): generic `POST /api/bridge` for arbitrary JSON.
- [Notion: Webhook actions](https://www.notion.so/help/webhook-actions)
- [Notion API: Page property values](https://developers.notion.com/reference/page-property-values)
