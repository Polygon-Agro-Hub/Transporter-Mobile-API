const complainEp = require('../../endpoint/complain-ep');
const complainDao = require('../../dao/complain-dao');

// Mock Dependencies
jest.mock('../../dao/complain-dao');
jest.mock('../../dao/complain-dao', () => ({
  AddComplain: jest.fn(),
  GetComplainCategories: jest.fn(),
  GetMyComplains: jest.fn(),
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
  return {
    body,
    user,
  };
};

describe('Complain Endpoints', () => {
  let req;
  let res;

  beforeEach(() => {
    res = mockResponse();
    jest.clearAllMocks();
  });

  describe('AddComplain', () => {
    it('should return 401 if user is not authenticated', async () => {
      req = mockRequest({ complainCategory: 'Service', complain: 'Bad service' });

      await complainEp.AddComplain(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        status: 'error',
        message: 'Unauthorized: User authentication required',
      });
    });

    it('should return 400 if category or description is missing', async () => {
      req = mockRequest({ complain: 'Bad service' }, { id: 1 }); // Missing category

      await complainEp.AddComplain(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        status: 'error',
        message: 'Category and description are required',
      });
    });

    it('should return 400 if description is empty string', async () => {
      req = mockRequest({ complainCategory: 'Service', complain: '   ' }, { id: 1 }); 

      await complainEp.AddComplain(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        status: 'error',
        message: 'Category and description are required',
      });
    });

    it('should return 200 on successful complaint submission', async () => {
      req = mockRequest({ complainCategory: 'Support', complain: 'App crashed' }, { id: 10 });
      const mockResult = { insertId: 5 };
      complainDao.AddComplain.mockResolvedValue(mockResult);

      await complainEp.AddComplain(req, res);

      expect(complainDao.AddComplain).toHaveBeenCalledWith(10, 'Support', 'App crashed');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        message: 'Complaint submitted successfully',
        data: mockResult,
      });
    });

    it('should return 500 if DAO fails submitting complaint', async () => {
      req = mockRequest({ complainCategory: 'Support', complain: 'App crashed' }, { id: 10 });
      complainDao.AddComplain.mockRejectedValue(new Error('Database insertion failed'));

      await complainEp.AddComplain(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        status: 'error',
        message: 'Failed to submit complaint. Please try again.',
      });
    });
  });

  describe('GetComplainCategories', () => {
    it('should return 401 if user is not authenticated', async () => {
      req = mockRequest({}, null);

      await complainEp.GetComplainCategories(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        status: 'error',
        message: 'Unauthorized: User authentication required',
      });
    });

    it('should return 200 and categories successfully', async () => {
      req = mockRequest({}, { id: 1 });
      const mockCategories = [{ id: 1, name: 'Support' }, { id: 2, name: 'Technical' }];
      complainDao.GetComplainCategories.mockResolvedValue(mockCategories);

      await complainEp.GetComplainCategories(req, res);

      expect(complainDao.GetComplainCategories).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        message: 'Categories fetched successfully',
        data: mockCategories,
      });
    });

    it('should return 500 if DAO throws an error', async () => {
      req = mockRequest({}, { id: 1 });
      complainDao.GetComplainCategories.mockRejectedValue(new Error('Database fetch failed'));

      await complainEp.GetComplainCategories(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        status: 'error',
        message: 'Failed to fetch categories. Please try again.',
      });
    });
  });

  describe('GetMyComplains', () => {
    it('should return 401 if user is not authenticated', async () => {
      req = mockRequest({}, null);

      await complainEp.GetMyComplains(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        status: 'error',
        message: 'Unauthorized: User authentication required',
      });
    });

    it('should return 200 and user complaints successfully', async () => {
      req = mockRequest({}, { id: 5 }); // officerId 5
      const mockComplains = [
        { id: 1, complainCategory: 'Support', complain: 'App crashed' },
      ];
      complainDao.GetMyComplains.mockResolvedValue(mockComplains);

      await complainEp.GetMyComplains(req, res);

      expect(complainDao.GetMyComplains).toHaveBeenCalledWith(5);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        message: 'Complaints fetched successfully',
        data: mockComplains,
      });
    });

    it('should return 500 if DAO throws an error', async () => {
      req = mockRequest({}, { id: 5 });
      complainDao.GetMyComplains.mockRejectedValue(new Error('Database fetch failed'));

      await complainEp.GetMyComplains(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        status: 'error',
        message: 'Failed to fetch complaints. Please try again.',
      });
    });
  });
});
