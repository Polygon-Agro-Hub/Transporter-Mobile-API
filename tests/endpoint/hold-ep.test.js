const holdEp = require('../../endpoint/hold-ep');
const holdDao = require('../../dao/hold-dao');
const holdValidation = require('../../validations/hold-validation');

// Mock Dependencies
jest.mock('../../dao/hold-dao');
jest.mock('../../validations/hold-validation', () => ({
  submitHoldSchema: {
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

describe('Hold Endpoints', () => {
  let req;
  let res;

  beforeEach(() => {
    res = mockResponse();
    jest.clearAllMocks();
  });

  describe('getReason', () => {
    it('should return 401 if unauthorized', async () => {
      req = mockRequest({}, null);
      await holdEp.getReason(req, res);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('should return 200 with list of reasons', async () => {
      req = mockRequest({}, { id: 1 });
      holdDao.getReason.mockResolvedValue([{ id: 1, reason: 'Customer not available' }]);
      
      await holdEp.getReason(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ status: 'success' }));
    });

    it('should return 500 if dao throws error', async () => {
      req = mockRequest({}, { id: 1 });
      holdDao.getReason.mockRejectedValue(new Error('DB error'));
      await holdEp.getReason(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('submitHold', () => {
    it('should return 400 on validation error', async () => {
      req = mockRequest({}, { id: 1 });
      holdValidation.submitHoldSchema.validate.mockReturnValue({ error: { details: [{ message: 'Validation Failed' }] } });
      
      await holdEp.submitHold(req, res);
      
      expect(res.status).toHaveBeenCalledWith(400); 
    });

    it('should return 200 on successful hold submission', async () => {
      req = mockRequest({ orderIds: [1], holdReasonId: 1, note: '' }, { id: 1 });
      holdValidation.submitHoldSchema.validate.mockReturnValue({ value: req.body });
      holdDao.submitHold.mockResolvedValue({ processOrdersUpdated: 1 });
      
      await holdEp.submitHold(req, res);
      
      expect(res.status).toHaveBeenCalledWith(200);
      expect(holdDao.submitHold).toHaveBeenCalled();
    });

    it('should return 404 if no orders found', async () => {
      req = mockRequest({ orderIds: [1], holdReasonId: 1, note: '' }, { id: 1 });
      holdValidation.submitHoldSchema.validate.mockReturnValue({ value: req.body });
      holdDao.submitHold.mockRejectedValue(new Error('No orders found'));
      
      await holdEp.submitHold(req, res);
      
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('No orders found with the provided IDs') }));
    });
  });
});
