const { REQUIRED_TABLES } = require("../migrations/requiredTables");

describe("required schema", () => {
  it("lists every table the agent-first app queries", () => {
    expect(REQUIRED_TABLES).toEqual(
      expect.arrayContaining([
        "event_source",
        "playmaker_user_source",
        "write_keys",
        "user_channels",
        "notification_rules",
        "notifications",
        "agent_endpoints",
        "identity_graph",
        "raw_events",
        "user_suppressions",
        "deletion_audit_log",
        "error_groups",
        "error_events",
        "agent_sessions",
      ])
    );
    expect(REQUIRED_TABLES).not.toEqual(
      expect.arrayContaining([
        "campaigns",
        "sent_events",
        "sources",
        "destinations",
        "destination_configs_v2",
      ])
    );
  });
});
