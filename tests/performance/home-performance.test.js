const { performance } = require('perf_hooks');

jest.mock('../../startup/database', () => ({
  plantcare: { promise: () => ({ query: jest.fn() }), query: jest.fn() },
  closeAllPools: jest.fn().mockResolvedValue(),
  closePool: jest.fn().mockResolvedValue()
}));

jest.mock('../../dao/home-dao');

const homeEp = require('../../endpoint/home-ep');
const homeDao = require('../../dao/home-dao');
const db = require('../../startup/database');

const mockResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const mockRequest = (body = {}, user = {}) => ({ body, user });

describe('Performance Tests - Home Endpoints', () => {
  let req;
  let res;

  const measureExecutionTime = async (fn) => {
    const start = performance.now();
    const result = await fn();
    const end = performance.now();
    return { executionTime: end - start, result };
  };

  afterAll(async () => {
    if (db.closeAllPools) await db.closeAllPools();
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  beforeEach(() => {
    res = mockResponse();
    jest.clearAllMocks();
  });

  describe('Stress Test - getAmount', () => {
    it('should handle 50 concurrent getAmount requests efficiently', async () => {
      homeDao.getAmount.mockResolvedValue({ total: 500 });
      
      const createRequest = () => {
        const mockRes = mockResponse();
        const mockReq = mockRequest({}, { id: 1 });
        return homeEp.getAmount(mockReq, mockRes);
      };

      const requests = Array(50).fill().map(() => createRequest());

      const startTime = performance.now();
      await Promise.all(requests);
      const endTime = performance.now();
      const totalTime = endTime - startTime;

      expect(totalTime).toBeLessThan(500); 
    });
  });
});
