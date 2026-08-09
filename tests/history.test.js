jest.mock('../src/services/pythonService');

const request = require('supertest');
const { callPredict } = require('../src/services/pythonService');
const app = require('../src/server');
const { resetDb } = require('./helpers/resetDb');

afterEach(resetDb);

const userA = { name: 'History A', email: 'history-a@example.com', password: 'secret123' };
const userB = { name: 'History B', email: 'history-b@example.com', password: 'secret123' };

const fakePrediction = {
  final_prediction: 'belt_squeal',
  final_confidence: 0.81,
  individual_models: [],
  processing_time_ms: 50,
};

async function signupAndAnalyze(user) {
  const signupRes = await request(app).post('/api/v1/auth/signup').send(user);
  const token = signupRes.body.token;

  await request(app)
    .post('/api/v1/audio/analyze')
    .set('Authorization', `Bearer ${token}`)
    .attach('file', Buffer.from('RIFF....WAVEfmt '), { filename: 'sample.wav', contentType: 'audio/wav' });

  return token;
}

describe('History routes', () => {
  beforeEach(() => {
    callPredict.mockResolvedValue(fakePrediction);
  });

  it('requires authentication', async () => {
    const res = await request(app).get('/api/v1/history');
    expect(res.status).toBe(401);
  });

  it('only returns the requesting user\'s analyses', async () => {
    const tokenA = await signupAndAnalyze(userA);
    await signupAndAnalyze(userB);

    const res = await request(app).get('/api/v1/history').set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.analyses).toHaveLength(1);
  });

  it('gets a single analysis by id', async () => {
    const token = await signupAndAnalyze(userA);
    const list = await request(app).get('/api/v1/history').set('Authorization', `Bearer ${token}`);
    const id = list.body.analyses[0].id;

    const res = await request(app).get(`/api/v1/history/${id}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.analysis.id).toBe(id);
  });

  it('404s when fetching another user\'s analysis', async () => {
    const tokenA = await signupAndAnalyze(userA);
    const tokenB = await signupAndAnalyze(userB);
    const list = await request(app).get('/api/v1/history').set('Authorization', `Bearer ${tokenA}`);
    const idOwnedByA = list.body.analyses[0].id;

    const res = await request(app)
      .get(`/api/v1/history/${idOwnedByA}`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(res.status).toBe(404);
  });

  it('deletes an owned analysis but not another user\'s', async () => {
    const tokenA = await signupAndAnalyze(userA);
    const tokenB = await signupAndAnalyze(userB);
    const list = await request(app).get('/api/v1/history').set('Authorization', `Bearer ${tokenA}`);
    const idOwnedByA = list.body.analyses[0].id;

    const forbidden = await request(app)
      .delete(`/api/v1/history/${idOwnedByA}`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(forbidden.status).toBe(404);

    const ok = await request(app)
      .delete(`/api/v1/history/${idOwnedByA}`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(ok.status).toBe(204);
  });
});
