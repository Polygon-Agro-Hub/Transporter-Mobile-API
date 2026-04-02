const { performance } = require('perf_hooks');

// Mock all database connections FIRST
jest.mock('../../startup/database', () => ({
  plantcare: { promise: () => ({ query: jest.fn() }), query: jest.fn() },
  closeAllPools: jest.fn().mockResolvedValue(),
  closePool: jest.fn().mockResolvedValue()
}));

// Mock other dependencies
jest.mock('../../dao/complain-dao');

// Import after mocks
const complainEp = require('../../endpoint/complain-ep');
const complainDao = require('../../dao/complain-dao');
const db = require('../../startup/database');

// Mock express response and request
const mockResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const mockRequest = (body = {}, user = {}) => ({ body, user });

describe('Performance Tests - Complain Endpoints', () => {
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

  describe('AddComplain Performance', () => {
    it('should handle adding complain quickly (< 50ms)', async () => {
      complainDao.AddComplain.mockResolvedValue({ insertId: 5 });
      req = mockRequest({ complainCategory: 'Support', complain: 'App crashed' }, { id: 10 });

      const { executionTime } = await measureExecutionTime(async () => {
        await complainEp.AddComplain(req, res);
      });

      expect(executionTime).toBeLessThan(50);
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe('Stress Test - GetComplains', () => {
    it('should handle 50 concurrent fetch requests efficiently', async () => {
      complainDao.GetMyComplains.mockResolvedValue([{ id: 1, complainCategory: 'Support', complain: 'App crashed' }]);
      
      const createRequest = () => {
        const mockRes = mockResponse();
        const mockReq = mockRequest({}, { id: 5 });
        return complainEp.GetMyComplains(mockReq, mockRes);
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
