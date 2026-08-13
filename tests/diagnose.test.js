jest.mock('../src/services/pythonService');

const request = require('supertest');
const { callDiagnoseText } = require('../src/services/pythonService');
const app = require('../src/server');
const { resetDb } = require('./helpers/resetDb');

afterEach(resetDb);

const user = { name: 'Diagnose Test', email: 'diagnose@example.com', password: 'secret123' };
const otherUser = { name: 'Other User', email: 'diagnose-other@example.com', password: 'secret123' };

const fakeResult = {
  predicted_class: '02_serpentine_belt',
  category_label: 'الدينمو / الدايمو (Alternator)',
  match_score: 0.92,
  matched_phrases: ['في صفير من قدام وقت التشغيل'],
  answer: 'يبدو إنه القشاط مرخي أو تالف، ينصح بفحصه بالورشة.',
  severity: 'medium',
  severity_reason: 'صوت متكرر بس بدون أعراض إضافية لسا',
};

async function signupAndGetToken(overrides = {}) {
  const res = await request(app)
    .post('/api/v1/auth/signup')
    .send({ ...user, ...overrides });
  return res.body.token;
}

describe('POST /api/v1/diagnose/text', () => {
  it('rejects a missing messages array', async () => {
    const res = await request(app).post('/api/v1/diagnose/text').send({});
    expect(res.status).toBe(400);
  });

  it('rejects an empty messages array', async () => {
    const res = await request(app).post('/api/v1/diagnose/text').send({ messages: [] });
    expect(res.status).toBe(400);
  });

  it('rejects a message with blank content', async () => {
    const res = await request(app)
      .post('/api/v1/diagnose/text')
      .send({ messages: [{ role: 'user', content: '   ' }] });
    expect(res.status).toBe(400);
  });

  it('rejects a message with an invalid role', async () => {
    const res = await request(app)
      .post('/api/v1/diagnose/text')
      .send({ messages: [{ role: 'system', content: 'hi' }] });
    expect(res.status).toBe(400);
  });

  it('rejects when the last message is not from the user', async () => {
    const res = await request(app)
      .post('/api/v1/diagnose/text')
      .send({
        messages: [
          { role: 'user', content: 'في صوت صفير من قدام' },
          { role: 'assistant', content: 'ممكن تكون مشكلة بالقشاط' },
        ],
      });
    expect(res.status).toBe(400);
  });

  it('rejects a non-integer conversationId', async () => {
    const res = await request(app)
      .post('/api/v1/diagnose/text')
      .send({ messages: [{ role: 'user', content: 'صوت صفير' }], conversationId: 'abc' });
    expect(res.status).toBe(400);
  });

  it('forwards the full conversation and returns the diagnosis from the Python service', async () => {
    callDiagnoseText.mockResolvedValue(fakeResult);

    const messages = [{ role: 'user', content: 'في صوت صفير من قدام وقت التشغيل' }];
    const res = await request(app).post('/api/v1/diagnose/text').send({ messages });

    expect(res.status).toBe(200);
    expect(res.body.predicted_class).toBe('02_serpentine_belt');
    expect(callDiagnoseText).toHaveBeenCalledWith(messages, undefined, undefined);
  });

  it('forwards audioResult to the Python service when provided', async () => {
    callDiagnoseText.mockResolvedValue(fakeResult);

    const messages = [{ role: 'user', content: 'طلع معي من تحليل الصوت إنه في احتمال Belt' }];
    const audioResult = { predicted_class: 'belt', confidence: 0.84 };
    const res = await request(app).post('/api/v1/diagnose/text').send({ messages, audioResult });

    expect(res.status).toBe(200);
    expect(callDiagnoseText).toHaveBeenCalledWith(messages, audioResult, undefined);
  });

  it('rejects an audioResult with an unknown predicted_class', async () => {
    const res = await request(app)
      .post('/api/v1/diagnose/text')
      .send({
        messages: [{ role: 'user', content: 'صوت غريب' }],
        audioResult: { predicted_class: 'engine', confidence: 0.9 },
      });

    expect(res.status).toBe(400);
    expect(callDiagnoseText).not.toHaveBeenCalled();
  });

  it('forwards formResult to the Python service when provided', async () => {
    callDiagnoseText.mockResolvedValue(fakeResult);

    const messages = [{ role: 'user', content: 'شو رأيك بنتيجة الفورم؟' }];
    const formResult = {
      predicted_class: 'brake',
      percent: 80,
      level: 'high',
      positive_findings: ['الصوت طحن معدني'],
    };
    const res = await request(app).post('/api/v1/diagnose/text').send({ messages, formResult });

    expect(res.status).toBe(200);
    expect(callDiagnoseText).toHaveBeenCalledWith(messages, undefined, formResult);
  });

  it('rejects a formResult with an out-of-range percent', async () => {
    const res = await request(app)
      .post('/api/v1/diagnose/text')
      .send({
        messages: [{ role: 'user', content: 'صوت غريب' }],
        formResult: { predicted_class: 'brake', percent: 150, level: 'high', positive_findings: [] },
      });

    expect(res.status).toBe(400);
    expect(callDiagnoseText).not.toHaveBeenCalled();
  });

  it('supports a multi-turn follow-up question', async () => {
    callDiagnoseText.mockResolvedValue(fakeResult);

    const messages = [
      { role: 'user', content: 'في صوت صفير من قدام وقت التشغيل' },
      { role: 'assistant', content: 'يبدو إنه القشاط مرخي أو تالف.' },
      { role: 'user', content: 'طيب وكم بده يكلف تبديله؟' },
    ];
    const res = await request(app).post('/api/v1/diagnose/text').send({ messages });

    expect(res.status).toBe(200);
    expect(callDiagnoseText).toHaveBeenCalledWith(messages, undefined, undefined);
  });

  it('returns 502 when the diagnosis service is unreachable', async () => {
    callDiagnoseText.mockRejectedValue(new Error('connect ECONNREFUSED'));

    const res = await request(app)
      .post('/api/v1/diagnose/text')
      .send({ messages: [{ role: 'user', content: 'في صوت غريب من تحت السيارة' }] });

    expect(res.status).toBe(502);
  });

  it('returns 504 when the diagnosis service times out', async () => {
    const timeoutError = new Error('timeout of 30000ms exceeded');
    timeoutError.code = 'ECONNABORTED';
    callDiagnoseText.mockRejectedValue(timeoutError);

    const res = await request(app)
      .post('/api/v1/diagnose/text')
      .send({ messages: [{ role: 'user', content: 'في صوت غريب من تحت السيارة' }] });

    expect(res.status).toBe(504);
  });

  describe('anonymous users', () => {
    it('does not persist a conversation and returns a null conversationId', async () => {
      callDiagnoseText.mockResolvedValue(fakeResult);

      const res = await request(app)
        .post('/api/v1/diagnose/text')
        .send({ messages: [{ role: 'user', content: 'في صوت صفير من قدام' }] });

      expect(res.status).toBe(200);
      expect(res.body.conversationId).toBeNull();
    });
  });

  describe('logged-in users', () => {
    it('creates a new saved conversation on the first message', async () => {
      callDiagnoseText.mockResolvedValue(fakeResult);
      const token = await signupAndGetToken();

      const res = await request(app)
        .post('/api/v1/diagnose/text')
        .set('Authorization', `Bearer ${token}`)
        .send({ messages: [{ role: 'user', content: 'في صوت صفير من قدام' }] });

      expect(res.status).toBe(200);
      expect(res.body.conversationId).toEqual(expect.any(Number));

      const listRes = await request(app)
        .get('/api/v1/diagnose/conversations')
        .set('Authorization', `Bearer ${token}`);
      expect(listRes.body.conversations).toHaveLength(1);
      expect(listRes.body.conversations[0].category_label).toBe(fakeResult.category_label);
      expect(listRes.body.conversations[0].severity).toBe(fakeResult.severity);
      expect(listRes.body.conversations[0].severity_reason).toBe(fakeResult.severity_reason);
    });

    it('appends to the same conversation when conversationId is passed back', async () => {
      callDiagnoseText.mockResolvedValue(fakeResult);
      const token = await signupAndGetToken();

      const first = await request(app)
        .post('/api/v1/diagnose/text')
        .set('Authorization', `Bearer ${token}`)
        .send({ messages: [{ role: 'user', content: 'في صوت صفير من قدام' }] });
      const conversationId = first.body.conversationId;

      const second = await request(app)
        .post('/api/v1/diagnose/text')
        .set('Authorization', `Bearer ${token}`)
        .send({
          conversationId,
          messages: [
            { role: 'user', content: 'في صوت صفير من قدام' },
            { role: 'assistant', content: fakeResult.answer },
            { role: 'user', content: 'طيب وكم بده يكلف؟' },
          ],
        });

      expect(second.body.conversationId).toBe(conversationId);

      const listRes = await request(app)
        .get('/api/v1/diagnose/conversations')
        .set('Authorization', `Bearer ${token}`);
      expect(listRes.body.conversations).toHaveLength(1);

      const detailRes = await request(app)
        .get(`/api/v1/diagnose/conversations/${conversationId}`)
        .set('Authorization', `Bearer ${token}`);
      expect(detailRes.body.conversation.messages).toHaveLength(4);
    });

    it('starts a fresh conversation instead of hijacking another user\'s conversationId', async () => {
      callDiagnoseText.mockResolvedValue(fakeResult);
      const ownerToken = await signupAndGetToken();
      const ownerRes = await request(app)
        .post('/api/v1/diagnose/text')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ messages: [{ role: 'user', content: 'في صوت صفير من قدام' }] });
      const ownerConversationId = ownerRes.body.conversationId;

      const attackerToken = await signupAndGetToken(otherUser);
      const attackerRes = await request(app)
        .post('/api/v1/diagnose/text')
        .set('Authorization', `Bearer ${attackerToken}`)
        .send({
          conversationId: ownerConversationId,
          messages: [{ role: 'user', content: 'صوت تاني' }],
        });

      expect(attackerRes.body.conversationId).not.toBe(ownerConversationId);

      const ownerDetail = await request(app)
        .get(`/api/v1/diagnose/conversations/${ownerConversationId}`)
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(ownerDetail.body.conversation.messages).toHaveLength(2);
    });
  });
});

describe('GET /api/v1/diagnose/conversations', () => {
  it('requires authentication', async () => {
    const res = await request(app).get('/api/v1/diagnose/conversations');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/v1/diagnose/conversations/:id', () => {
  it('404s for a conversation that does not belong to the user', async () => {
    callDiagnoseText.mockResolvedValue(fakeResult);
    const ownerToken = await signupAndGetToken();
    const ownerRes = await request(app)
      .post('/api/v1/diagnose/text')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ messages: [{ role: 'user', content: 'في صوت صفير من قدام' }] });

    const otherToken = await signupAndGetToken(otherUser);
    const res = await request(app)
      .get(`/api/v1/diagnose/conversations/${ownerRes.body.conversationId}`)
      .set('Authorization', `Bearer ${otherToken}`);
    expect(res.status).toBe(404);
  });

  it('404s for a nonexistent conversation', async () => {
    const token = await signupAndGetToken();
    const res = await request(app)
      .get('/api/v1/diagnose/conversations/999999')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/v1/diagnose/conversations/:id', () => {
  it('deletes an owned conversation but not another user\'s', async () => {
    callDiagnoseText.mockResolvedValue(fakeResult);
    const ownerToken = await signupAndGetToken();
    const ownerRes = await request(app)
      .post('/api/v1/diagnose/text')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ messages: [{ role: 'user', content: 'في صوت صفير من قدام' }] });
    const conversationId = ownerRes.body.conversationId;

    const otherToken = await signupAndGetToken(otherUser);
    const forbidden = await request(app)
      .delete(`/api/v1/diagnose/conversations/${conversationId}`)
      .set('Authorization', `Bearer ${otherToken}`);
    expect(forbidden.status).toBe(404);

    const ok = await request(app)
      .delete(`/api/v1/diagnose/conversations/${conversationId}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(ok.status).toBe(204);
  });
});
