const loginRateLimiter = require('../../middlewares/rateLimiter.middleware');

// Mock Express response
const mockResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

// Mock Express request
const mockRequest = (ip) => {
  return {
    ip,
    headers: {},
    socket: {}
  };
};

describe('Rate Limiter Middleware', () => {
  let req;
  let res;
  let next;

  beforeEach(() => {
    res = mockResponse();
    next = jest.fn();
  });

  it('should allow up to 5 requests from the same IP', () => {
    req = mockRequest('192.168.1.1');

    for (let i = 0; i < 5; i++) {
      loginRateLimiter(req, res, next);
    }

    expect(next).toHaveBeenCalledTimes(5);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('should block the 6th request with a 429 status code', () => {
    req = mockRequest('192.168.1.1');

    // Make the 6th call (after 5 successful calls from the previous test or new IP context)
    // Note: Since Map is global/module-scoped, it preserves state.
    // IP 192.168.1.1 has already had 5 calls in the previous test block.
    loginRateLimiter(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      status: 'error',
      message: 'Too many login attempts. Please try again after 15 minutes.'
    }));
  });

  it('should treat different IPs independently', () => {
    req = mockRequest('192.168.1.2'); // New IP

    loginRateLimiter(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });
});
