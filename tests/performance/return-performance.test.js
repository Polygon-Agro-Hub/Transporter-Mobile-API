const { performance } = require('perf_hooks');

jest.mock('../../startup/database', () => ({
  plantcare: { promise: () => ({ query: jest.fn() }), query: jest.fn() },
  closeAllPools: jest.fn().mockResolvedValue(),
  closePool: jest.fn().mockResolvedValue()
}));

jest.mock('../../dao/return-dao');
jest.mock('../../validations/return-validation', () => ({
  submitReturnSchema: { validate: jest.fn() },
  updateReturnReceivedSchema: { validate: jest.fn() }
}));

const returnEp = require('../../endpoint/return-ep');
const returnDao = require('../../dao/return-dao');
const returnValidation = require('../../validations/return-validation');
const db = require('../../startup/database');

const mockResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const mockRequest = (body = {}, user = {}) => ({ body, user });

describe('Performance Tests - Return Endpoints', () => {
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

  describe('GetDriverReturnOrders Performance', () => {
    it('should retrieve driver return orders extremely quickly (< 50ms)', async () => {
      returnDao.getDriverReturnOrdersDAO.mockResolvedValue([{ id: 1 }]);
      req = mockRequest({}, { id: 1 });

      const { executionTime } = await measureExecutionTime(async () => {
        await returnEp.GetDriverReturnOrders(req, res);
      });

      expect(executionTime).toBeLessThan(50);
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe('Stress Test - Submit Returns', () => {
    it('should handle 50 concurrent return submissions efficiently', async () => {
      returnValidation.submitReturnSchema.validate.mockReturnValue({ value: { orderIds: [1], returnReasonId: 1, note: '' } });
      returnDao.submitReturn.mockResolvedValue({ processOrdersUpdated: 1 });
      
      const createRequest = () => {
        const mockRes = mockResponse();
        const mockReq = mockRequest({ orderIds: [1], returnReasonId: 1, note: '' }, { id: 1 });
        return returnEp.submitReturn(mockReq, mockRes);
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
