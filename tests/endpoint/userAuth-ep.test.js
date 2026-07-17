const userAuthEp = require('../../endpoint/userAuth-ep');
const userDao = require('../../dao/userAuth-dao');
const jwt = require('jsonwebtoken');
const uploadFileToS3 = require('../../middlewares/s3upload');

// Mock dependencies
jest.mock('../../dao/userAuth-dao');
jest.mock('jsonwebtoken');
jest.mock('../../middlewares/s3upload');
jest.mock('../../dao/userAuth-dao', () => ({
  loginUser: jest.fn(),
  changePassword: jest.fn(),
  getUserProfile: jest.fn(),
  updateProfileImage: jest.fn(),
  getEarnings: jest.fn(),
  getEarningsHistory: jest.fn(),
}));

// Mock express response
const mockResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.cookie = jest.fn().mockReturnValue(res);
  return res;
};

// Mock express request
const mockRequest = (body = {}, user = {}, file = null) => {
  return {
    body,
    user,
    file,
  };
};

describe('User Authentication Endpoints', () => {
  let req;
  let res;

  beforeEach(() => {
    res = mockResponse();
    jest.clearAllMocks();
  });

  describe('login', () => {
    beforeEach(() => {
      // Mock process.env needed for login
      process.env.JWT_SECRET = 'test_secret';
      process.env.NODE_ENV = 'test';
    });

    it('should return 400 if validation fails (e.g. missing empId)', async () => {
      req = mockRequest({ password: 'Password123' }); // Missing empId

      await userAuthEp.login(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        message: 'Validation error',
      }));
    });

    it('should return 401 if login fails due to incorrect credentials', async () => {
      req = mockRequest({ empId: 'USR123', password: 'wrongpassword' });
      userDao.loginUser.mockRejectedValue(new Error('Invalid credentials'));

      await userAuthEp.login(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Invalid credentials',
      });
    });

    it('should return 200 and set cookie on successful login', async () => {
      req = mockRequest({ empId: 'USR123', password: 'Password123' });
      const mockResult = {
        empId: 'USR123',
        id: 1,
        passwordUpdated: 1,
        firstNameEnglish: 'John',
        lastNameEnglish: 'Doe',
        image: 'img.png'
      };
      userDao.loginUser.mockResolvedValue(mockResult);
      jwt.sign.mockReturnValue('mocked_token');

      await userAuthEp.login(req, res);

      expect(userDao.loginUser).toHaveBeenCalledWith('USR123', 'Password123');
      expect(jwt.sign).toHaveBeenCalled();
      expect(res.cookie).toHaveBeenCalledWith('authToken', 'mocked_token', expect.any(Object));
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Login successful',
        data: {
          empId: 'USR123',
          id: 1,
          token: 'mocked_token',
          passwordUpdated: 1,
          firstNameEnglish: 'John',
          lastNameEnglish: 'Doe',
          image: 'img.png',
        },
      });
    });
  });

  describe('changePassword', () => {
    it('should return 200 on successful password change', async () => {
      req = mockRequest({ currentPassword: 'Old', newPassword: 'New' }, { id: 1 });
      userDao.changePassword.mockResolvedValue({ message: 'Password updated successfully' });

      await userAuthEp.changePassword(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        message: 'Password updated successfully',
      });
    });

    it('should return 401 if current password is incorrect', async () => {
      req = mockRequest({ currentPassword: 'Wrong', newPassword: 'New' }, { id: 1 });
      userDao.changePassword.mockRejectedValue(new Error('Current password is incorrect'));

      await userAuthEp.changePassword(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        status: 'error',
        message: 'Current password is incorrect',
      });
    });

    it('should return 404 if officer not found', async () => {
      req = mockRequest({ currentPassword: 'Old', newPassword: 'New' }, { id: 99 });
      userDao.changePassword.mockRejectedValue(new Error('Officer not found'));

      await userAuthEp.changePassword(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        status: 'error',
        message: 'Officer not found',
      });
    });
  });

  describe('getProfile', () => {
    it('should return 400 if empId is not in token', async () => {
      req = mockRequest({}, { }); // no empId

      await userAuthEp.getProfile(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        status: 'error',
        message: 'Employee ID not found in token',
      });
    });

    it('should return 200 and profile if successful', async () => {
      req = mockRequest({}, { empId: 'USR123' });
      const mockProfile = { name: 'John Doe', empId: 'USR123' };
      userDao.getUserProfile.mockResolvedValue(mockProfile);

      await userAuthEp.getProfile(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        status: 'success',
        message: 'User profile fetched successfully',
        data: mockProfile,
      });
    });

    it('should return 404 if User not found error thrown', async () => {
      req = mockRequest({}, { empId: 'USR123' });
      userDao.getUserProfile.mockRejectedValue(new Error('User not found in DB'));

      await userAuthEp.getProfile(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        status: 'error',
        message: 'User account not found or not approved. Please contact support.',
      });
    });

    it('should return 500 if Database error thrown', async () => {
      req = mockRequest({}, { empId: 'USR123' });
      userDao.getUserProfile.mockRejectedValue(new Error('Database error during fetch'));

      await userAuthEp.getProfile(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        status: 'error',
        message: 'Database error occurred. Please try again.',
      });
    });
  });

  describe('updateProfileImage', () => {
    it('should return 400 if no file is provided', async () => {
      req = mockRequest({}, { empId: 'USR123' }, null);

      await userAuthEp.updateProfileImage(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Profile image is required',
      });
    });

    it('should return 400 if invalid file type', async () => {
      req = mockRequest({}, { empId: 'USR123' }, { mimetype: 'application/pdf', size: 1000 });

      await userAuthEp.updateProfileImage(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Only JPEG, JPG, and PNG images are allowed',
      });
    });

    it('should return 400 if file size exceeds 5MB', async () => {
      req = mockRequest({}, { empId: 'USR123' }, { mimetype: 'image/jpeg', size: 10 * 1024 * 1024 });

      await userAuthEp.updateProfileImage(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Image size should not exceed 5MB',
      });
    });

    it('should return 400 if empId not in token', async () => {
      req = mockRequest({}, {}, { mimetype: 'image/jpeg', size: 1000 }); // missing empId in user

      await userAuthEp.updateProfileImage(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Employee ID not found in token',
      });
    });

    it('should return 200 on successful upload and database update', async () => {
      req = mockRequest({}, { empId: 'USR123' }, {
        mimetype: 'image/jpeg',
        size: 1000,
        buffer: Buffer.from('test'),
        originalname: 'test.jpg'
      });
      userDao.getUserProfile.mockResolvedValue({ empId: 'USR123', image: '' }); // no old image
      uploadFileToS3.mockResolvedValue('https://s3.url/test.jpg');
      userDao.updateProfileImage.mockResolvedValue({ success: true });

      await userAuthEp.updateProfileImage(req, res);

      expect(uploadFileToS3).toHaveBeenCalled();
      expect(userDao.updateProfileImage).toHaveBeenCalledWith('USR123', 'https://s3.url/test.jpg');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Profile image updated successfully',
        data: {
          imageUrl: 'https://s3.url/test.jpg',
          empId: 'USR123',
        },
      });
    });

    it('should return 404 if dao update returned success: false', async () => {
      req = mockRequest({}, { empId: 'USR123' }, {
        mimetype: 'image/jpeg',
        size: 1000,
        buffer: Buffer.from('test'),
        originalname: 'test.jpg'
      });
      userDao.getUserProfile.mockResolvedValue({ empId: 'USR123', image: '' });
      uploadFileToS3.mockResolvedValue('https://s3.url/test.jpg');
      userDao.updateProfileImage.mockResolvedValue({ success: false, message: 'User not found' });

      await userAuthEp.updateProfileImage(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'User not found',
      });
    });

    it('should return 500 if an unexpected error occurs', async () => {
      req = mockRequest({}, { empId: 'USR123' }, { mimetype: 'image/jpeg', size: 1000 });
      userDao.getUserProfile.mockRejectedValue(new Error('Unexpected DAO Error'));

      await userAuthEp.updateProfileImage(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Failed to update profile image: Unexpected DAO Error',
      });
    });
  });

  describe('getEarnings', () => {
    it('should successfully return earnings', async () => {
      req = {
        user: { id: 1 },
        query: { date: '2026-07-15' }
      };

      const mockEarnings = {
        todayDate: '2026-07-15T00:00:00.000Z',
        totalEarnings: 1000,
        cashEarnings: 600,
        cashOrders: 2,
        cardEarnings: 400,
        cardOrders: 1
      };

      userDao.getEarnings.mockResolvedValue(mockEarnings);

      await userAuthEp.getEarnings(req, res);

      expect(userDao.getEarnings).toHaveBeenCalledWith(1, '2026-07-15');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        status: 'success',
        message: 'Earnings fetched successfully',
        data: mockEarnings
      });
    });

    it('should return 500 on DAO error', async () => {
      req = {
        user: { id: 1 },
        query: { date: '2026-07-15' }
      };

      userDao.getEarnings.mockRejectedValue(new Error('DAO Error'));

      await userAuthEp.getEarnings(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        status: 'error',
        message: 'Failed to fetch earnings: DAO Error'
      });
    });
  });

  describe('getEarningsHistory', () => {
    it('should return 400 if from or to date is missing', async () => {
      req = {
        user: { id: 1 },
        query: { from: '2026-07-15' } // missing 'to'
      };

      await userAuthEp.getEarningsHistory(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        status: 'error',
        message: 'From date and to date are required'
      });
    });

    it('should successfully return earnings history', async () => {
      req = {
        user: { id: 1 },
        query: { from: '2026-07-10', to: '2026-07-15' }
      };

      const mockHistory = {
        summary: {
          fromDate: '2026-07-10',
          toDate: '2026-07-15',
          cashEarnings: 600,
          cashOrders: 2,
          cardEarnings: 400,
          cardOrders: 1
        },
        orders: [
          { orderId: 'INV1', dateTime: '2026-07-15T12:00:00Z', method: 'cash', earnings: 300 }
        ]
      };

      userDao.getEarningsHistory.mockResolvedValue(mockHistory);

      await userAuthEp.getEarningsHistory(req, res);

      expect(userDao.getEarningsHistory).toHaveBeenCalledWith(1, '2026-07-10', '2026-07-15');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        status: 'success',
        message: 'Earnings history fetched successfully',
        data: mockHistory
      });
    });

    it('should return 500 on DAO error', async () => {
      req = {
        user: { id: 1 },
        query: { from: '2026-07-10', to: '2026-07-15' }
      };

      userDao.getEarningsHistory.mockRejectedValue(new Error('DAO Error'));

      await userAuthEp.getEarningsHistory(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        status: 'error',
        message: 'Failed to fetch earnings history: DAO Error'
      });
    });
  });
});
