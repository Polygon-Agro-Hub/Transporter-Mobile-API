const { performance } = require('perf_hooks');

jest.mock('../../startup/database', () => ({
  plantcare: { promise: () => ({ query: jest.fn() }), query: jest.fn() },
  closeAllPools: jest.fn().mockResolvedValue(),
  closePool: jest.fn().mockResolvedValue()
}));

jest.mock('../../dao/hold-dao');
jest.mock('../../validations/hold-validation', () => ({
  submitHoldSchema: { validate: jest.fn() }
}));

const holdEp = require('../../endpoint/hold-ep');
const holdDao = require('../../dao/hold-dao');
const holdValidation = require('../../validations/hold-validation');
const db = require('../../startup/database');

const mockResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const mockRequest = (body = {}, user = {}) => ({ body, user });

describe('Performance Tests - Hold Endpoints', () => {
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

  describe('Stress Test - Submit Hold', () => {
    it('should handle 50 concurrent hold submissions efficiently', async () => {
      holdValidation.submitHoldSchema.validate.mockReturnValue({ value: { orderIds: [1], holdReasonId: 1, note: '' } });
      holdDao.submitHold.mockResolvedValue({ processOrdersUpdated: 1 });
      
      const createRequest = () => {
        const mockRes = mockResponse();
        const mockReq = mockRequest({ orderIds: [1], holdReasonId: 1, note: '' }, { id: 1 });
        return holdEp.submitHold(mockReq, mockRes);
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
