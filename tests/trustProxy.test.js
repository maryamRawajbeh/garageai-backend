describe('trust proxy configuration', () => {
  afterEach(() => {
    delete process.env.TRUST_PROXY;
    jest.resetModules();
  });

  it('leaves trust proxy at Express\'s own default (disabled) when TRUST_PROXY is unset', () => {
    delete process.env.TRUST_PROXY;
    jest.resetModules();
    const app = require('../src/server');

    expect(app.get('trust proxy')).toBe(false);
  });

  it('sets trust proxy to the configured hop count when TRUST_PROXY is set', () => {
    process.env.TRUST_PROXY = '1';
    jest.resetModules();
    const app = require('../src/server');

    expect(app.get('trust proxy')).toBe(1);
  });

  it('passes through a non-numeric TRUST_PROXY value (e.g. a specific subnet) as-is', () => {
    process.env.TRUST_PROXY = 'loopback';
    jest.resetModules();
    const app = require('../src/server');

    expect(app.get('trust proxy')).toBe('loopback');
  });
});
