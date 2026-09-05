const checkProfanity = require('../../middlewares/profanity.middleware');
const { getFilter } = require('../../services/profanity-filter');

jest.mock('../../services/profanity-filter');

describe('Profanity Middleware', () => {
  let req, res, next;

  beforeEach(() => {
    jest.clearAllMocks();
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    next = jest.fn();
  });

  it('should call next() if no profanity is detected', async () => {
    getFilter.mockResolvedValue({
      test: jest.fn().mockReturnValue(false),
    });

    req = {
      body: {
        complain: 'Clean complaint text',
      },
    };

    const middleware = checkProfanity(['complain']);
    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('should return 422 if profanity is detected in specified field', async () => {
    getFilter.mockResolvedValue({
      test: jest.fn().mockReturnValue(true),
    });

    req = {
      body: {
        complain: 'profane text',
      },
    };

    const middleware = checkProfanity(['complain']);
    await middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith({
      status: 'error',
      code: 'PROFANITY_DETECTED',
      message: 'Your message contains prohibited or inappropriate language.',
      field: 'complain',
    });
  });

  it('should call next() if field is missing or not a string', async () => {
    getFilter.mockResolvedValue({
      test: jest.fn().mockReturnValue(true),
    });

    req = {
      body: {
        otherField: 123,
      },
    };

    const middleware = checkProfanity(['complain']);
    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('should call next() if filter throws an error (non-blocking)', async () => {
    getFilter.mockRejectedValue(new Error('Database connection failed'));

    req = {
      body: {
        complain: 'some text',
      },
    };

    const middleware = checkProfanity(['complain']);
    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});
