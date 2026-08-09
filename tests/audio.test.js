jest.mock('../src/services/pythonService');

const request = require('supertest');
const { callPredict } = require('../src/services/pythonService');
const app = require('../src/server');
const { resetDb } = require('./helpers/resetDb');

afterEach(resetDb);

const user = { name: 'Audio Test', email: 'audio@example.com', password: 'secret123' };

const fakePrediction = {
  final_prediction: 'engine_knock',
  final_confidence: 0.92,
  individual_models: [{ model: 'cnn', prediction: 'engine_knock', confidence: 0.9 }],
  processing_time_ms: 120,
};

describe('POST /api/v1/audio/analyze', () => {
  it('rejects requests with no file', async () => {
    const res = await request(app).post('/api/v1/audio/analyze');
    expect(res.status).toBe(400);
  });

  it('rejects unsupported file formats with a JSON error', async () => {
    const res = await request(app)
      .post('/api/v1/audio/analyze')
      .attach('file', Buffer.from('not audio'), { filename: 'notes.txt', contentType: 'text/plain' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it('analyzes an anonymous upload without saving history', async () => {
    callPredict.mockResolvedValue(fakePrediction);

    const res = await request(app)
      .post('/api/v1/audio/analyze')
      .attach('file', Buffer.from('RIFF....WAVEfmt '), { filename: 'engine.wav', contentType: 'audio/wav' });

    expect(res.status).toBe(200);
    expect(res.body.final_prediction).toBe('engine_knock');
    expect(res.body.filename).toBe('engine.wav');
  });

  it('saves the analysis to history for an authenticated user', async () => {
    callPredict.mockResolvedValue(fakePrediction);

    const signupRes = await request(app).post('/api/v1/auth/signup').send(user);
    const token = signupRes.body.token;

    const analyzeRes = await request(app)
      .post('/api/v1/audio/analyze')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('RIFF....WAVEfmt '), { filename: 'engine.wav', contentType: 'audio/wav' });
    expect(analyzeRes.status).toBe(200);

    const historyRes = await request(app).get('/api/v1/history').set('Authorization', `Bearer ${token}`);
    expect(historyRes.status).toBe(200);
    expect(historyRes.body.analyses).toHaveLength(1);
    expect(historyRes.body.analyses[0]).toMatchObject({
      filename: 'engine.wav',
      final_prediction: 'engine_knock',
    });
  });

  it('returns 502 when the analysis service is unreachable', async () => {
    callPredict.mockRejectedValue(new Error('connect ECONNREFUSED'));

    const res = await request(app)
      .post('/api/v1/audio/analyze')
      .attach('file', Buffer.from('RIFF....WAVEfmt '), { filename: 'engine.wav', contentType: 'audio/wav' });

    expect(res.status).toBe(502);
  });
});
