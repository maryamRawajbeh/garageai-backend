process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-do-not-use-in-production';
process.env.JWT_EXPIRES_IN = '7d';
process.env.DB_PATH = ':memory:';
process.env.PYTHON_SERVICE_URL = 'http://localhost:9999';
process.env.FRONTEND_URL = 'http://localhost:5173';
