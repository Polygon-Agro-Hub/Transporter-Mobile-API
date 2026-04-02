const homeEp = require('../../endpoint/home-ep');
const homeDao = require('../../dao/home-dao');

// Mock Dependencies
jest.mock('../../dao/home-dao');

// Mock Express response
const mockResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

// Mock Express request
const mockRequest = (body = {}, user = null) => {
  return { body, user };
};

describe('Home Endpoints', () => {
  let req;
  let res;

  beforeEach(() => {
    res = mockResponse();
    jest.clearAllMocks();
  });

  describe('getAmount', () => {
    it('should return 401 if unauthorized', async () => {
      req = mockRequest({}, null);
      await homeEp.getAmount(req, res);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('should return 200 with amount', async () => {
      req = mockRequest({}, { id: 1 });
      homeDao.getAmount.mockResolvedValue({ total: 500 });
      
      await homeEp.getAmount(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ status: 'success', data: { total: 500 } }));
    });
  });

  describe('getReceivedCash', () => {
    it('should return 401 if unauthorized', async () => {
      req = mockRequest({}, null);
      await homeEp.getReceivedCash(req, res);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('should return 200 with received cash amount', async () => {
      req = mockRequest({}, { id: 1 });
      homeDao.getReceivedCash.mockResolvedValue({ total: 200 });
      
      await homeEp.getReceivedCash(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe('handOverCash', () => {
    it('should return 400 if orderIds missing', async () => {
      req = mockRequest({ totalAmount: 100, officerId: 'EMP01' }, { id: 1 });
      await homeEp.handOverCash(req, res);
      expect(res.status).toHaveBeenCalledWith(400); 
    });

    it('should return 404 if officer not found', async () => {
      req = mockRequest({ orderIds: [1], officerId: 'EMP01' }, { id: 1 });
      homeDao.getOfficerByEmpId.mockResolvedValue(null);
      
      await homeEp.handOverCash(req, res);
      expect(res.status).toHaveBeenCalledWith(404); 
    });

    it('should return 403 if officer is not approved', async () => {
      req = mockRequest({ orderIds: [1], officerId: 'EMP01' }, { id: 1 });
      homeDao.getOfficerByEmpId.mockResolvedValue({ id: 10, status: 'Not Approved' });
      
      await homeEp.handOverCash(req, res);
      expect(res.status).toHaveBeenCalledWith(403); 
    });

    it('should successfully hand over cash', async () => {
      req = mockRequest({ orderIds: [1, 2], totalAmount: 300, officerId: 'EMP01' }, { id: 1 });
      homeDao.getOfficerByEmpId.mockResolvedValue({ id: 10, status: 'Approved', distributedCenterId: 5 });
      homeDao.getDriverDistributedCenter.mockResolvedValue({ distributedCenterId: 5 });
      homeDao.getOrderAmounts.mockResolvedValue([{ id: 1, amount: 100 }, { id: 2, amount: 200 }]);
      homeDao.handOverCash.mockResolvedValue(true);

      await homeEp.handOverCash(req, res);
      
      expect(res.status).toHaveBeenCalledWith(200);
      expect(homeDao.handOverCash).toHaveBeenCalledWith([{ id: 1, amount: 100 }, { id: 2, amount: 200 }], 10);
    });
  });
});
