const request = require('supertest');
const app = require('../src/server');
const { resetDb } = require('./helpers/resetDb');

const user = { name: 'Sara Test', email: 'sara@example.com', password: 'secret123' };

afterEach(resetDb);

async function signupAndGetToken(overrides = {}) {
  const res = await request(app)
    .post('/api/v1/auth/signup')
    .send({ ...user, ...overrides });
  return res.body.token;
}

describe('User routes', () => {
  it('requires authentication on every /users/me route', async () => {
    const results = await Promise.all([
      request(app).put('/api/v1/users/me').send({ name: 'X', email: 'x@example.com' }),
      request(app).delete('/api/v1/users/me'),
      request(app).put('/api/v1/users/me/password').send({}),
      request(app).get('/api/v1/users/me/settings'),
      request(app).put('/api/v1/users/me/settings').send({}),
    ]);

    results.forEach((res) => expect(res.status).toBe(401));
  });

  describe('PUT /api/v1/users/me', () => {
    it('updates name and email', async () => {
      const token = await signupAndGetToken();

      const res = await request(app)
        .put('/api/v1/users/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Sara Updated', email: 'sara-updated@example.com' });

      expect(res.status).toBe(200);
      expect(res.body.user).toMatchObject({ name: 'Sara Updated', email: 'sara-updated@example.com' });
    });

    it('rejects switching to an email already used by another account', async () => {
      await request(app).post('/api/v1/auth/signup').send({ name: 'Other', email: 'other@example.com', password: 'secret123' });
      const token = await signupAndGetToken();

      const res = await request(app)
        .put('/api/v1/users/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Sara', email: 'other@example.com' });

      expect(res.status).toBe(409);
    });
  });

  describe('PUT /api/v1/users/me/password', () => {
    it('changes the password when the current one is correct', async () => {
      const token = await signupAndGetToken();

      const res = await request(app)
        .put('/api/v1/users/me/password')
        .set('Authorization', `Bearer ${token}`)
        .send({ currentPassword: user.password, newPassword: 'new-secret-456' });

      expect(res.status).toBe(200);

      const login = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: user.email, password: 'new-secret-456' });
      expect(login.status).toBe(200);
    });

    it('rejects an incorrect current password', async () => {
      const token = await signupAndGetToken();

      const res = await request(app)
        .put('/api/v1/users/me/password')
        .set('Authorization', `Bearer ${token}`)
        .send({ currentPassword: 'wrong', newPassword: 'new-secret-456' });

      expect(res.status).toBe(401);
    });
  });

  describe('Settings', () => {
    it('defaults both notification settings to true', async () => {
      const token = await signupAndGetToken();

      const res = await request(app).get('/api/v1/users/me/settings').set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ emailNotifications: true, maintenanceReminders: true });
    });

    it('updates only the provided settings fields', async () => {
      const token = await signupAndGetToken();

      const res = await request(app)
        .put('/api/v1/users/me/settings')
        .set('Authorization', `Bearer ${token}`)
        .send({ emailNotifications: false });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ emailNotifications: false, maintenanceReminders: true });
    });
  });

  describe('DELETE /api/v1/users/me', () => {
    it('deletes the account and invalidates further use of the token', async () => {
      const token = await signupAndGetToken();

      const del = await request(app).delete('/api/v1/users/me').set('Authorization', `Bearer ${token}`);
      expect(del.status).toBe(204);

      const me = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`);
      expect(me.status).toBe(401);
    });
  });
});
