const request = require('supertest');
const app = require('../src/server');
const { resetDb } = require('./helpers/resetDb');

const validUser = { name: 'Ahmed Test', email: 'ahmed@example.com', password: 'secret123' };

afterEach(resetDb);

describe('Auth routes', () => {
  describe('POST /api/v1/auth/signup', () => {
    it('creates a new account and returns a token', async () => {
      const res = await request(app).post('/api/v1/auth/signup').send(validUser);

      expect(res.status).toBe(201);
      expect(res.body.token).toEqual(expect.any(String));
      expect(res.body.user).toMatchObject({ name: validUser.name, email: validUser.email });
      expect(res.body.user.password_hash).toBeUndefined();
    });

    it('rejects duplicate emails', async () => {
      await request(app).post('/api/v1/auth/signup').send(validUser);
      const res = await request(app).post('/api/v1/auth/signup').send(validUser);

      expect(res.status).toBe(409);
    });

    it.each([
      [{ email: validUser.email, password: validUser.password }, 'missing name'],
      [{ name: 'X', password: validUser.password }, 'missing/invalid email'],
      [{ name: 'X', email: 'not-an-email', password: validUser.password }, 'invalid email format'],
      [{ name: 'X', email: validUser.email, password: '123' }, 'password too short'],
    ])('rejects invalid signup payload: %s', async (payload) => {
      const res = await request(app).post('/api/v1/auth/signup').send(payload);
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/v1/auth/login', () => {
    beforeEach(async () => {
      await request(app).post('/api/v1/auth/signup').send(validUser);
    });

    it('logs in with correct credentials', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: validUser.email, password: validUser.password });

      expect(res.status).toBe(200);
      expect(res.body.token).toEqual(expect.any(String));
    });

    it('rejects an incorrect password', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: validUser.email, password: 'wrong-password' });

      expect(res.status).toBe(401);
    });

    it('rejects an unknown email', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'nobody@example.com', password: validUser.password });

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/v1/auth/me', () => {
    it('rejects requests without a token', async () => {
      const res = await request(app).get('/api/v1/auth/me');
      expect(res.status).toBe(401);
    });

    it('rejects an invalid token', async () => {
      const res = await request(app).get('/api/v1/auth/me').set('Authorization', 'Bearer not-a-real-token');
      expect(res.status).toBe(401);
    });

    it('returns the authenticated user', async () => {
      const signupRes = await request(app).post('/api/v1/auth/signup').send(validUser);
      const token = signupRes.body.token;

      const res = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.user).toMatchObject({ email: validUser.email });
    });
  });

  describe('Password reset flow', () => {
    beforeEach(async () => {
      await request(app).post('/api/v1/auth/signup').send(validUser);
    });

    it('returns a generic response for both known and unknown emails', async () => {
      const known = await request(app).post('/api/v1/auth/forgot-password').send({ email: validUser.email });
      const unknown = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'unknown@example.com' });

      expect(known.status).toBe(200);
      expect(unknown.status).toBe(200);
      expect(known.body.message).toEqual(unknown.body.message);
    });

    it('resets the password using the token logged server-side, then invalidates it', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      await request(app).post('/api/v1/auth/forgot-password').send({ email: validUser.email });

      const logged = logSpy.mock.calls.map((args) => args.join(' ')).join('\n');
      const token = new URL(logged.match(/http\S+/)[0]).searchParams.get('token');
      logSpy.mockRestore();

      const resetRes = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({ token, newPassword: 'brand-new-pass' });
      expect(resetRes.status).toBe(200);

      const oldLogin = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: validUser.email, password: validUser.password });
      expect(oldLogin.status).toBe(401);

      const newLogin = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: validUser.email, password: 'brand-new-pass' });
      expect(newLogin.status).toBe(200);

      const reuseRes = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({ token, newPassword: 'another-pass-1' });
      expect(reuseRes.status).toBe(400);
    });

    it('rejects an invalid reset token', async () => {
      const res = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({ token: 'bogus-token', newPassword: 'brand-new-pass' });
      expect(res.status).toBe(400);
    });
  });
});
