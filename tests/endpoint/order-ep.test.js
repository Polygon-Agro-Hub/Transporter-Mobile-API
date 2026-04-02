const orderEp = require('../../endpoint/order-ep');
const orderDao = require('../../dao/order-dao');
const uploadFileToS3 = require('../../middlewares/s3upload');

// Mock Dependencies
jest.mock('../../dao/order-dao');
jest.mock('../../middlewares/s3upload');

// Mock Express response
const mockResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

// Mock Express request
const mockRequest = (body = {}, query = {}, user = null, file = null) => {
  return { body, query, user, file };
};

describe('Order Endpoints', () => {
  let req;
  let res;

  beforeEach(() => {
    res = mockResponse();
    jest.clearAllMocks();
  });

  describe('assignDriverOrder', () => {
    it('should return 401 if user is not authenticated', async () => {
      req = mockRequest({ invNo: 'INV123' }, {}, null);
      await orderEp.assignDriverOrder(req, res);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('should return 400 if invNo is missing', async () => {
      req = mockRequest({}, {}, { id: 1 });
      await orderEp.assignDriverOrder(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Invoice number is required' }));
    });

    it('should return 400 if order is still processing', async () => {
      req = mockRequest({ invNo: 'INV123' }, {}, { id: 1 });
      orderDao.GetDriverEmpId.mockResolvedValue('EMP001');
      orderDao.GetProcessOrderInfoByInvNo.mockResolvedValue({ id: 10, status: 'Processing', invNo: 'INV123' });
      orderDao.CheckOrderAlreadyAssigned.mockResolvedValue({ isAssigned: false });

      await orderEp.assignDriverOrder(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('Still processing this order') }));
    });
    
    it('should assign order successfully if it is Out For Delivery', async () => {
      req = mockRequest({ invNo: 'INV123' }, {}, { id: 1 });
      orderDao.GetDriverEmpId.mockResolvedValue('EMP001');
      orderDao.GetProcessOrderInfoByInvNo.mockResolvedValue({ id: 10, status: 'Out For Delivery', invNo: 'INV123' });
      orderDao.CheckOrderAlreadyAssigned.mockResolvedValue({ isAssigned: false });
      orderDao.SaveDriverOrder.mockResolvedValue({ success: true, assignId: 5 });

      await orderEp.assignDriverOrder(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(orderDao.SaveDriverOrder).toHaveBeenCalledWith(1, 10, expect.any(Date));
    });
  });

  describe('GetDriverOrders', () => {
    it('should return 200 with list of driver orders', async () => {
      req = mockRequest({}, { status: 'Todo' }, { id: 1 });
      orderDao.getDriverOrdersDAO.mockResolvedValue([{ id: 1, drvStatus: 'Todo' }]);
      
      await orderEp.GetDriverOrders(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ status: 'success' }));
    });
  });

  describe('StartJourney', () => {
    it('should return 400 if orderIds is missing', async () => {
      req = mockRequest({}, {}, { id: 1 });
      await orderEp.StartJourney(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should return 200 when journey starts successfully', async () => {
      req = mockRequest({ orderIds: '1,2,3' }, {}, { id: 1 });
      orderDao.startJourneyDAO.mockResolvedValue({ success: true, message: 'Started', updatedOrders: 3 });
      
      await orderEp.StartJourney(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(orderDao.startJourneyDAO).toHaveBeenCalledWith(1, [1, 2, 3]);
    });
  });

  describe('saveSignature', () => {
    it('should return 400 if no file is provided', async () => {
      req = mockRequest({ processOrderIds: [1, 2] }, {}, { id: 1 }, null);
      await orderEp.saveSignature(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Signature image is required' }));
    });

    it('should successfully save signature and update status', async () => {
      req = mockRequest({ processOrderIds: [1] }, {}, { id: 1 }, { mimetype: 'image/png', buffer: Buffer.from('data'), originalname: 'sig.png' });
      
      orderDao.verifyDriverAccessToOrdersDAO.mockResolvedValue({ hasAccess: true });
      uploadFileToS3.mockResolvedValue('https://s3.url/sig.png');
      orderDao.saveSignatureAndUpdateStatusDAO.mockResolvedValue({ signatureUrl: 'https://s3.url/sig.png' });

      await orderEp.saveSignature(req, res);
      
      expect(uploadFileToS3).toHaveBeenCalled();
      expect(orderDao.saveSignatureAndUpdateStatusDAO).toHaveBeenCalledWith([1], 'https://s3.url/sig.png', 1);
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });
});
