const { renderTemplate } = require('../notifications');

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
  const NotificationService = require('../notifications');
  const svc = new NotificationService();

  it('matches when property_match is null', () => {
    expect(svc._matchesProperties(null, { a: 1 })).toBe(true);
  });

  it('matches exact property filters', () => {
    expect(svc._matchesProperties({ plan: 'pro' }, { plan: 'pro' })).toBe(true);
    expect(svc._matchesProperties({ plan: 'pro' }, { plan: 'free' })).toBe(false);
  });
});
