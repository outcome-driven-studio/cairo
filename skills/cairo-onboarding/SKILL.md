---
name: cairo-onboarding
description: Set up Cairo product tracking and proactive Discord alerts via webhook relay. Use when the user asks to track product events, notify on signup/checkout/bugs, or connect a repo to Cairo.
---

# Cairo onboarding

Cairo stores product/agent events and hands notifications to agents. **Proactive delivery** uses Cairo’s webhook push into a thin relay (batched Discord + ack). You (the conversational agent) own setup and digests — not a per-event LLM loop or heartbeat poll.

## Prerequisites

MCP server `@ani-hq/cairo-mcp` configured with `CAIRO_HOST`, `CAIRO_WRITE_KEY`, and ideally `CAIRO_AGENT_ID`.  
A running **cairo-relay** (or equivalent) that posts to Discord and acks.

## When the user asks to set up a product / “let me know when…”

1. Call **`setup_product`** with:
   - `product_name` — product or repo name
   - `agent_id` — your id (from env if unset)
   - `events` — list they named (e.g. signup, checkout_completed, error)
   - optional `namespace`
2. Ensure **`register_agent_webhook`** once for your `agent_id` pointing at the relay  
   (`url: https://…/hooks/<agent_id>`, `namespace: "default"` so one webhook covers all products).
3. Return the **write_key** and install snippets. Tell them alerts will ping their Discord channel when those events fire — they do not need to ask you each time.
4. Do **not** invent Discord API calls inside Cairo, and do **not** add heartbeat polling for this.

## When the user asks for alerts / “anything happen?” / digests

1. Prefer summarizing what already went to Discord if you know; otherwise call **`drain_notifications`** with your `agent_id`.
2. Present clearly; **`ack_notification`** any ids you deliver that the relay has not already acked.

## Do not

- Ask the user to curl Cairo APIs if you can call MCP tools
- Create product-specific agents inside Cairo — target your own `agent_id`
- Claim Cairo posts to Discord itself (the **relay** does)
- Use heartbeat / scheduled LLM turns as the primary signup alert path
