const { performance } = require('perf_hooks');

// Mock all database connections FIRST
jest.mock('../../startup/database', () => ({
  plantcare: { promise: () => ({ query: jest.fn() }), query: jest.fn() },
  closeAllPools: jest.fn().mockResolvedValue(),
  closePool: jest.fn().mockResolvedValue()
}));

// Mock other dependencies
jest.mock('../../dao/order-dao');
jest.mock('../../middlewares/s3upload', () => jest.fn(() => Promise.resolve('https://s3.url/image.jpg')));

// Import after mocks
const orderEp = require('../../endpoint/order-ep');
const orderDao = require('../../dao/order-dao');
const db = require('../../startup/database');

const mockResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const mockRequest = (body = {}, query = {}, user = {}, file = null) => ({ body, query, user, file });

describe('Performance Tests - Order Endpoints', () => {
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

  describe('GetDriverOrders Performance', () => {
    it('should retrieve driver orders quickly (< 50ms)', async () => {
      orderDao.getDriverOrdersDAO.mockResolvedValue([{ id: 1, drvStatus: 'Todo' }]);
      req = mockRequest({}, { status: 'Todo' }, { id: 1 });

      const { executionTime } = await measureExecutionTime(async () => {
        await orderEp.GetDriverOrders(req, res);
      });

      expect(executionTime).toBeLessThan(50);
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe('Stress Test - Order Updates', () => {
    it('should handle 50 concurrent journey starts efficiently', async () => {
      orderDao.startJourneyDAO.mockResolvedValue({ success: true, message: 'Started', updatedOrders: 3 });
      
      const createRequest = () => {
        const mockRes = mockResponse();
        const mockReq = mockRequest({ orderIds: '1,2,3' }, {}, { id: 1 });
        return orderEp.StartJourney(mockReq, mockRes);
      };

      const requests = Array(50).fill().map(() => createRequest());

      const startTime = performance.now();
      await Promise.all(requests);
      const endTime = performance.now();
      const totalTime = endTime - startTime;

      expect(totalTime).toBeLessThan(500); // Expect all 50 parallel requests to resolve under 500ms
    });
  });
});
