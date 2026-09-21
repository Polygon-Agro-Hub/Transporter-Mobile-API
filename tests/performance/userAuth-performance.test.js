const { performance } = require('perf_hooks');

// Mock all database connections FIRST
jest.mock('../../startup/database', () => ({
  plantcare: {
    promise: () => ({
      query: jest.fn()
    }),
    query: jest.fn()
  },
  collectionofficer: {
    promise: () => ({
      query: jest.fn()
    }),
    query: jest.fn()
  },
  admin: {
    promise: () => ({
      query: jest.fn()
    }),
    query: jest.fn()
  },
  closeAllPools: jest.fn().mockResolvedValue(),
  closePool: jest.fn().mockResolvedValue()
}));

// Mock other dependencies
jest.mock('../../dao/userAuth-dao');
jest.mock('jsonwebtoken', () => ({
  sign: jest.fn(() => 'mocked_token'),
  verify: jest.fn((token, secret, callback) => callback(null, { id: 1, empId: 'EMP001' }))
}));
jest.mock('../../middlewares/s3upload', () => jest.fn(() => Promise.resolve('https://s3.url/image.jpg')));

// Import after mocks
const userAuthEp = require('../../endpoint/userAuth-ep');
const userDao = require('../../dao/userAuth-dao');
const db = require('../../startup/database');

// Mock express response and request
const mockResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.cookie = jest.fn().mockReturnValue(res);
  return res;
};

const mockRequest = (body = {}, user = {}, file = null) => {
  return {
    body,
    user,
    file,
  };
};

describe('Performance Tests - User Authentication', () => {
  let req;
  let res;
  let originalConsoleLog;
  let originalConsoleError;

  // Helper function to measure execution time
  const measureExecutionTime = async (fn) => {
    const start = performance.now();
    const result = await fn();
    const end = performance.now();
    return {
      executionTime: end - start,
      result
    };
  };

  beforeAll(() => {
    // Suppress console logs during tests for cleaner output
    originalConsoleLog = console.log;
    originalConsoleError = console.error;
    console.log = jest.fn();
    console.error = jest.fn();
  });

  afterAll(async () => {
    // Close all database connections
    if (db.closeAllPools) {
      await db.closeAllPools();
    }
    
    // Restore console logs
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
    
    // Give a small delay for any pending operations
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  beforeEach(() => {
    res = mockResponse();
    jest.clearAllMocks();
    
    // Set up environment variables
    process.env.JWT_SECRET = 'test_secret';
    process.env.NODE_ENV = 'test';
  });

  describe('Login Performance', () => {
    it('should handle login within acceptable time (< 100ms)', async () => {
      const mockResult = {
        empId: 'EMP001',
        id: 1,
        passwordUpdated: 1,
        firstNameEnglish: 'John',
        lastNameEnglish: 'Doe',
        image: 'img.png'
      };
      userDao.loginUser.mockResolvedValue(mockResult);

      req = mockRequest({ empId: 'EMP001', password: 'Password123' });

      const { executionTime } = await measureExecutionTime(async () => {
        await userAuthEp.login(req, res);
        return res;
      });

      // Use original console to show results
      originalConsoleLog(`✅ Login execution time: ${executionTime.toFixed(2)}ms`);
      expect(executionTime).toBeLessThan(100);
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should handle login validation error quickly (< 50ms)', async () => {
      req = mockRequest({ password: 'Password123' });

      const { executionTime } = await measureExecutionTime(async () => {
        await userAuthEp.login(req, res);
        return res;
      });

      originalConsoleLog(`✅ Login validation error time: ${executionTime.toFixed(2)}ms`);
      expect(executionTime).toBeLessThan(50);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should handle invalid credentials quickly (< 50ms)', async () => {
      userDao.loginUser.mockRejectedValue(new Error('Invalid credentials'));

      req = mockRequest({ empId: 'EMP001', password: 'WrongPassword' });

      const { executionTime } = await measureExecutionTime(async () => {
        await userAuthEp.login(req, res);
        return res;
      });

      originalConsoleLog(`✅ Invalid credentials response time: ${executionTime.toFixed(2)}ms`);
      expect(executionTime).toBeLessThan(50);
      expect(res.status).toHaveBeenCalledWith(401);
    });
  });

  describe('Get Profile Performance', () => {
    it('should retrieve profile within acceptable time (< 50ms)', async () => {
      const mockProfile = {
        empId: 'EMP001',
        firstNameEnglish: 'John',
        lastNameEnglish: 'Doe',
        phoneCode01: '+94',
        phoneNumber01: '123456789',
        email: 'john@example.com'
      };
      userDao.getUserProfile.mockResolvedValue(mockProfile);

      req = mockRequest({}, { empId: 'EMP001' });

      const { executionTime } = await measureExecutionTime(async () => {
        await userAuthEp.getProfile(req, res);
        return res;
      });

      originalConsoleLog(`✅ Get profile execution time: ${executionTime.toFixed(2)}ms`);
      expect(executionTime).toBeLessThan(50);
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should handle missing empId quickly (< 50ms)', async () => {
      req = mockRequest({}, {});

      const { executionTime } = await measureExecutionTime(async () => {
        await userAuthEp.getProfile(req, res);
        return res;
      });

      originalConsoleLog(`✅ Missing empId response time: ${executionTime.toFixed(2)}ms`);
      expect(executionTime).toBeLessThan(50);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should handle profile not found quickly (< 50ms)', async () => {
      userDao.getUserProfile.mockRejectedValue(new Error('User not found'));

      req = mockRequest({}, { empId: 'EMP999' });

      const { executionTime } = await measureExecutionTime(async () => {
        await userAuthEp.getProfile(req, res);
        return res;
      });

      originalConsoleLog(`✅ Profile not found error time: ${executionTime.toFixed(2)}ms`);
      expect(executionTime).toBeLessThan(50);
    });
  });

  describe('Change Password Performance', () => {
    it('should handle password change within acceptable time (< 100ms)', async () => {
      userDao.changePassword.mockResolvedValue({ 
        message: 'Password changed successfully' 
      });

      req = mockRequest(
        { currentPassword: 'OldPass123', newPassword: 'NewPass123' },
        { id: 1 }
      );

      const { executionTime } = await measureExecutionTime(async () => {
        await userAuthEp.changePassword(req, res);
        return res;
      });

      originalConsoleLog(`✅ Password change execution time: ${executionTime.toFixed(2)}ms`);
      expect(executionTime).toBeLessThan(100);
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should handle incorrect current password quickly (< 50ms)', async () => {
      userDao.changePassword.mockRejectedValue(new Error('Current password is incorrect'));

      req = mockRequest(
        { currentPassword: 'WrongPass', newPassword: 'NewPass123' },
        { id: 1 }
      );

      const { executionTime } = await measureExecutionTime(async () => {
        await userAuthEp.changePassword(req, res);
        return res;
      });

      originalConsoleLog(`✅ Incorrect password response time: ${executionTime.toFixed(2)}ms`);
      expect(executionTime).toBeLessThan(50);
      expect(res.status).toHaveBeenCalledWith(401);
    });
  });

  describe('Update Profile Image Performance', () => {
    it('should handle missing file quickly (< 50ms)', async () => {
      req = mockRequest({}, { empId: 'EMP001' }, null);

      const { executionTime } = await measureExecutionTime(async () => {
        await userAuthEp.updateProfileImage(req, res);
        return res;
      });

      originalConsoleLog(`✅ Missing file response time: ${executionTime.toFixed(2)}ms`);
      expect(executionTime).toBeLessThan(50);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should handle invalid file type quickly (< 50ms)', async () => {
      req = mockRequest(
        {}, 
        { empId: 'EMP001' }, 
        { mimetype: 'application/pdf', size: 1000 }
      );

      const { executionTime } = await measureExecutionTime(async () => {
        await userAuthEp.updateProfileImage(req, res);
        return res;
      });

      originalConsoleLog(`✅ Invalid file type response time: ${executionTime.toFixed(2)}ms`);
      expect(executionTime).toBeLessThan(50);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should handle valid image upload within acceptable time (< 200ms for mock)', async () => {
      const mockFile = {
        mimetype: 'image/jpeg',
        size: 1024 * 1024, // 1MB
        buffer: Buffer.from('test image data'),
        originalname: 'test.jpg'
      };
      
      userDao.getUserProfile.mockResolvedValue({ empId: 'EMP001', image: '' });
      userDao.updateProfileImage.mockResolvedValue({ success: true });

      req = mockRequest({}, { empId: 'EMP001' }, mockFile);

      const { executionTime } = await measureExecutionTime(async () => {
        await userAuthEp.updateProfileImage(req, res);
        return res;
      });

      originalConsoleLog(`✅ Image upload execution time: ${executionTime.toFixed(2)}ms`);
      expect(executionTime).toBeLessThan(200);
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe('Concurrent Operations Performance', () => {
    it('should handle 10 concurrent profile requests efficiently', async () => {
      const mockProfile = {
        empId: 'EMP001',
        firstNameEnglish: 'John',
        lastNameEnglish: 'Doe'
      };
      userDao.getUserProfile.mockResolvedValue(mockProfile);

      const createRequest = () => {
        const mockRes = mockResponse();
        const mockReq = mockRequest({}, { empId: 'EMP001' });
        return userAuthEp.getProfile(mockReq, mockRes);
      };

      const requests = Array(10).fill().map(() => createRequest());

      const startTime = performance.now();
      await Promise.all(requests);
      const endTime = performance.now();
      const totalTime = endTime - startTime;

      originalConsoleLog(`✅ 10 concurrent profile requests: ${totalTime.toFixed(2)}ms`);
      originalConsoleLog(`✅ Average per request: ${(totalTime / 10).toFixed(2)}ms`);
      originalConsoleLog(`✅ Throughput: ${(10 / (totalTime / 1000)).toFixed(2)} req/sec`);

      expect(totalTime).toBeLessThan(500);
    });

    it('should handle 20 sequential login requests', async () => {
      const mockResult = {
        empId: 'EMP001',
        id: 1,
        passwordUpdated: 1,
        firstNameEnglish: 'John',
        lastNameEnglish: 'Doe'
      };
      userDao.loginUser.mockResolvedValue(mockResult);

      const times = [];

      for (let i = 0; i < 20; i++) {
        const mockRes = mockResponse();
        const mockReq = mockRequest({ empId: 'EMP001', password: 'Password123' });
        
        const start = performance.now();
        await userAuthEp.login(mockReq, mockRes);
        const end = performance.now();
        times.push(end - start);
      }

      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      const maxTime = Math.max(...times);
      const minTime = Math.min(...times);

      originalConsoleLog(`✅ 20 sequential logins:`);
      originalConsoleLog(`   - Average: ${avgTime.toFixed(2)}ms`);
      originalConsoleLog(`   - Min: ${minTime.toFixed(2)}ms`);
      originalConsoleLog(`   - Max: ${maxTime.toFixed(2)}ms`);

      expect(avgTime).toBeLessThan(100);
      expect(maxTime).toBeLessThan(200);
    });
  });

  describe('Stress Test', () => {
    it('should handle mixed workload (50 requests)', async () => {
      // Setup mocks for different operations
      userDao.loginUser.mockResolvedValue({
        empId: 'EMP001',
        id: 1,
        passwordUpdated: 1,
        firstNameEnglish: 'John',
        lastNameEnglish: 'Doe'
      });
      
      userDao.getUserProfile.mockResolvedValue({
        empId: 'EMP001',
        firstNameEnglish: 'John',
        lastNameEnglish: 'Doe'
      });
      
      userDao.changePassword.mockResolvedValue({ 
        message: 'Password changed successfully' 
      });

      // Create mix of operations
      const operations = [
        ...Array(20).fill().map(() => async () => {
          const mockRes = mockResponse();
          const mockReq = mockRequest({ empId: 'EMP001', password: 'Password123' });
          await userAuthEp.login(mockReq, mockRes);
        }),
        ...Array(20).fill().map(() => async () => {
          const mockRes = mockResponse();
          const mockReq = mockRequest({}, { empId: 'EMP001' });
          await userAuthEp.getProfile(mockReq, mockRes);
        }),
        ...Array(10).fill().map(() => async () => {
          const mockRes = mockResponse();
          const mockReq = mockRequest(
            { currentPassword: 'OldPass123', newPassword: 'NewPass123' },
            { id: 1 }
          );
          await userAuthEp.changePassword(mockReq, mockRes);
        })
      ];

      // Shuffle operations
      const shuffledOps = operations.sort(() => Math.random() - 0.5);
      
      const startTime = performance.now();
      await Promise.all(shuffledOps.map(op => op()));
      const endTime = performance.now();
      const totalTime = endTime - startTime;

      originalConsoleLog(`✅ Mixed workload (${operations.length} requests) completed in: ${totalTime.toFixed(2)}ms`);
      originalConsoleLog(`✅ Throughput: ${(operations.length / (totalTime / 1000)).toFixed(2)} req/sec`);
      
      expect(totalTime).toBeLessThan(3000);
    });
  });

  describe('Memory Usage Test', () => {
    it('should not leak memory during repeated profile requests', async () => {
      const mockProfile = {
        empId: 'EMP001',
        firstNameEnglish: 'John',
        lastNameEnglish: 'Doe'
      };
      userDao.getUserProfile.mockResolvedValue(mockProfile);

      const iterations = 50;
      const memorySnapshots = [];

      for (let i = 0; i < iterations; i++) {
        const memUsageBefore = process.memoryUsage();
        
        const mockRes = mockResponse();
        const mockReq = mockRequest({}, { empId: 'EMP001' });
        await userAuthEp.getProfile(mockReq, mockRes);
        
        const memUsageAfter = process.memoryUsage();
        const heapDelta = memUsageAfter.heapUsed - memUsageBefore.heapUsed;
        memorySnapshots.push(heapDelta);
        
        // Allow GC to run periodically
        if (i % 10 === 0) {
          await new Promise(resolve => setImmediate(resolve));
        }
      }

      // Calculate statistics
      const avgDelta = memorySnapshots.reduce((a, b) => a + b, 0) / memorySnapshots.length;
      const maxDelta = Math.max(...memorySnapshots);
      
      originalConsoleLog(`✅ Memory usage statistics:`);
      originalConsoleLog(`   - Average heap increase per request: ${(avgDelta / 1024).toFixed(2)} KB`);
      originalConsoleLog(`   - Max heap increase: ${(maxDelta / 1024).toFixed(2)} KB`);
      
      // Average memory increase should be less than 500KB
      expect(avgDelta).toBeLessThan(500 * 1024);
    });
  });
});