---
name: cairo-onboarding
description: Set up Cairo product tracking and relay event notifications through the agent's own gateway. Use when the user asks to track product events, notify on signup/checkout/bugs, or connect a repo to Cairo.
---

# Cairo onboarding

Cairo stores product/agent events and hands notifications to **you** (the agent). You relay via Discord/Slack/Telegram/etc. Cairo does not send to gateways.

## Prerequisites

MCP server `@ani-hq/cairo-mcp` configured with `CAIRO_HOST`, `CAIRO_WRITE_KEY`, and ideally `CAIRO_AGENT_ID`.

## When the user asks to set up a product

1. Call **`setup_product`** with:
   - `product_name` — product or repo name
   - `agent_id` — your id (from env if unset)
   - `events` — list they named (e.g. signup, checkout_completed, error)
   - optional `namespace`
2. Return the **write_key** and install snippets from the response. Tell them to store the key securely (shown once).
3. Do **not** invent Discord/Telegram API calls inside Cairo — use your own gateway after drain.

## When the user asks for alerts / “anything happen?”

1. Call **`drain_notifications`** with your `agent_id` (and namespace if known).
2. Present each notification clearly in the channel you already use with the user.
3. Call **`ack_notification`** for each id you delivered.

## Do not

- Ask the user to curl Cairo APIs if you can call MCP tools
- Create product-specific agents inside Cairo — target your own `agent_id`
- Claim Cairo posts to Discord/Telegram itself
