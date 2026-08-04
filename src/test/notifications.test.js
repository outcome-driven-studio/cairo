jest.mock('../utils/db', () => ({
  query: jest.fn(),
}));

const { query } = require('../utils/db');
const NotificationService = require('../notifications');
const { renderTemplate } = NotificationService;

describe('renderTemplate', () => {
  it('interpolates event and nested properties', () => {
    const out = renderTemplate(
      'Hi {{userId}}: {{event}} plan={{properties.plan}}',
      { userId: 'u1', event: 'signup', properties: { plan: 'pro' } }
    );
    expect(out).toBe('Hi u1: signup plan=pro');
  });

  it('handles missing paths as empty string', () => {
    expect(renderTemplate('x={{missing.y}}', {})).toBe('x=');
  });
});

describe('NotificationService matching', () => {
  const svc = new NotificationService();

  it('matches when property_match is null', () => {
    expect(svc._matchesProperties(null, { a: 1 })).toBe(true);
  });

  it('matches exact property filters', () => {
    expect(svc._matchesProperties({ plan: 'pro' }, { plan: 'pro' })).toBe(true);
    expect(svc._matchesProperties({ plan: 'pro' }, { plan: 'free' })).toBe(false);
  });
});

describe('_resolveAgentWebhook namespace fallback', () => {
  const svc = new NotificationService();

  beforeEach(() => {
    query.mockReset();
  });

  it('returns exact namespace webhook when present', async () => {
    query.mockResolvedValueOnce({ rows: [{ webhook_url: 'https://relay/hooks/dash' }] });
    await expect(svc._resolveAgentWebhook('dash', 'adventures-of')).resolves.toBe(
      'https://relay/hooks/dash'
    );
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][1]).toEqual(['dash', 'adventures-of']);
  });

  it('falls back to default namespace when exact miss', async () => {
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ webhook_url: 'https://relay/hooks/dash' }] });
    await expect(svc._resolveAgentWebhook('dash', 'adventures-of')).resolves.toBe(
      'https://relay/hooks/dash'
    );
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[1][1]).toEqual(['dash']);
  });

  it('does not double-query when namespace is already default', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await expect(svc._resolveAgentWebhook('dash', 'default')).resolves.toBeNull();
    expect(query).toHaveBeenCalledTimes(1);
  });
});
