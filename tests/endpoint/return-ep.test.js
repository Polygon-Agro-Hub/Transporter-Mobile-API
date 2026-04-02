const returnEp = require('../../endpoint/return-ep');
const returnDao = require('../../dao/return-dao');
const returnValidation = require('../../validations/return-validation');

// Mock Dependencies
jest.mock('../../dao/return-dao');
jest.mock('../../validations/return-validation', () => ({
  submitReturnSchema: {
    validate: jest.fn()
  },
  updateReturnReceivedSchema: {
    validate: jest.fn()
  }
}));

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

describe('Return Endpoints', () => {
  let req;
  let res;

  beforeEach(() => {
    res = mockResponse();
    jest.clearAllMocks();
  });

  describe('getReason', () => {
    it('should return 401 if unauthorized', async () => {
      req = mockRequest({}, null);
      await returnEp.getReason(req, res);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('should return 200 with list of reasons', async () => {
      req = mockRequest({}, { id: 1 });
      returnDao.getReason.mockResolvedValue([{ id: 1, reason: 'Damaged' }]);
      
      await returnEp.getReason(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ status: 'success' }));
    });
  });

  describe('submitReturn', () => {
    it('should return 400 on validation error', async () => {
      req = mockRequest({}, { id: 1 });
      returnValidation.submitReturnSchema.validate.mockReturnValue({ error: { details: [{ message: 'Validation Failed' }] } });
      
      await returnEp.submitReturn(req, res);
      
      expect(res.status).toHaveBeenCalledWith(400); 
    });

    it('should return 200 on successful return submission', async () => {
      req = mockRequest({ orderIds: [1], returnReasonId: 1, note: '' }, { id: 1 });
      returnValidation.submitReturnSchema.validate.mockReturnValue({ value: req.body });
      returnDao.submitReturn.mockResolvedValue({ processOrdersUpdated: 1 });
      
      await returnEp.submitReturn(req, res);
      
      expect(res.status).toHaveBeenCalledWith(200);
      expect(returnDao.submitReturn).toHaveBeenCalled();
    });
  });

  describe('GetDriverReturnOrders', () => {
    it('should return 200 with return orders', async () => {
      req = mockRequest({}, { id: 1 });
      returnDao.getDriverReturnOrdersDAO.mockResolvedValue([{ id: 1 }]);
      
      await returnEp.GetDriverReturnOrders(req, res);
      
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe('updateReturnReceived', () => {
    it('should return 400 on validation error', async () => {
      req = mockRequest({}, { id: 1 });
      returnValidation.updateReturnReceivedSchema.validate.mockReturnValue({ error: { details: [{ message: 'Validation Failed' }] } });
      
      await returnEp.updateReturnReceived(req, res);
      
      expect(res.status).toHaveBeenCalledWith(400); 
    });

    it('should return 200 when updated successfully', async () => {
      req = mockRequest({ invoiceNumbers: ['INV1'] }, { id: 1 });
      returnValidation.updateReturnReceivedSchema.validate.mockReturnValue({ value: req.body });
      returnDao.updateReturnReceived.mockResolvedValue({ driverOrdersUpdated: 1 });
      
      await returnEp.updateReturnReceived(req, res);
      
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });
});
