// functions/__tests__/productivity-chart.test.js

const { aggregateProductivityData } = require('../productivity-chart');

// Mock Firebase Admin
const mockFirestore = {
  collection: jest.fn(),
  doc: jest.fn()
};

const mockCollection = {
  get: jest.fn(),
  where: jest.fn(() => mockCollection),
  orderBy: jest.fn(() => mockCollection)
};

const mockAdmin = {
  firestore: () => mockFirestore,
  auth: () => ({
    verifyIdToken: jest.fn()
  }),
  apps: { length: 0 },
  initializeApp: jest.fn()
};

jest.mock('firebase-admin', () => mockAdmin);

describe('Productivity Chart Backend', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFirestore.collection.mockReturnValue(mockCollection);
  });

  describe('aggregateProductivityData', () => {
    test('should filter out test users correctly', async () => {
      // Mock users collection
      const mockUsersSnapshot = {
        forEach: jest.fn((callback) => {
          // Real user
          callback({
            id: 'user1',
            data: () => ({
              displayName: 'John Doe',
              email: 'john@company.com',
              is_active: true,
              is_dummy: false,
              role: 'editor',
              account_verified: true,
              last_login: { toDate: () => new Date() }
            })
          });
          
          // Test user (should be filtered out)
          callback({
            id: 'user2',
            data: () => ({
              displayName: 'Test User',
              email: 'test@example.com',
              is_active: true,
              is_dummy: false,
              role: 'editor'
            })
          });
          
          // Dummy user (should be filtered out)
          callback({
            id: 'user3',
            data: () => ({
              displayName: 'Dummy User',
              email: 'dummy@company.com',
              is_active: true,
              is_dummy: true,
              role: 'editor'
            })
          });
          
          // Inactive user (should be filtered out)
          callback({
            id: 'user4',
            data: () => ({
              displayName: 'Inactive User',
              email: 'inactive@company.com',
              is_active: false,
              is_dummy: false,
              role: 'editor'
            })
          });
        })
      };

      // Mock hourly reports collection
      const mockHourlySnapshot = {
        forEach: jest.fn((callback) => {
          callback({
            data: () => ({
              userId: 'user1',
              productivity: 85,
              duration: 3600,
              createdAt: { toDate: () => new Date() }
            })
          });
          
          // Test entry (should be filtered out)
          callback({
            data: () => ({
              userId: 'user2',
              productivity: 95,
              duration: 3600,
              is_test: true,
              createdAt: { toDate: () => new Date() }
            })
          });
        })
      };

      mockCollection.get
        .mockResolvedValueOnce(mockUsersSnapshot)
        .mockResolvedValueOnce(mockHourlySnapshot);

      const result = await aggregateProductivityData({ date: '2024-01-15' });

      expect(result).toHaveLength(1);
      expect(result[0].display_name).toBe('John Doe');
      expect(result[0].aggregated_productivity_percent).toBe(85);
    });

    test('should calculate weighted average productivity correctly', async () => {
      const mockUsersSnapshot = {
        forEach: jest.fn((callback) => {
          callback({
            id: 'user1',
            data: () => ({
              displayName: 'John Doe',
              email: 'john@company.com',
              is_active: true,
              is_dummy: false,
              role: 'editor'
            })
          });
        })
      };

      const mockHourlySnapshot = {
        forEach: jest.fn((callback) => {
          // First report: 80% productivity for 2 hours (7200 seconds)
          callback({
            data: () => ({
              userId: 'user1',
              productivity: 80,
              duration: 7200,
              createdAt: { toDate: () => new Date() }
            })
          });
          
          // Second report: 90% productivity for 1 hour (3600 seconds)
          callback({
            data: () => ({
              userId: 'user1',
              productivity: 90,
              duration: 3600,
              createdAt: { toDate: () => new Date() }
            })
          });
        })
      };

      mockCollection.get
        .mockResolvedValueOnce(mockUsersSnapshot)
        .mockResolvedValueOnce(mockHourlySnapshot);

      const result = await aggregateProductivityData({ date: '2024-01-15' });

      // Weighted average: (80*7200 + 90*3600) / (7200+3600) = 83.3
      expect(result[0].aggregated_productivity_percent).toBe(83.3);
    });

    test('should handle users with no productivity data', async () => {
      const mockUsersSnapshot = {
        forEach: jest.fn((callback) => {
          callback({
            id: 'user1',
            data: () => ({
              displayName: 'John Doe',
              email: 'john@company.com',
              is_active: true,
              is_dummy: false,
              role: 'editor'
            })
          });
        })
      };

      const mockHourlySnapshot = {
        forEach: jest.fn(() => {
          // No hourly reports for this user
        })
      };

      mockCollection.get
        .mockResolvedValueOnce(mockUsersSnapshot)
        .mockResolvedValueOnce(mockHourlySnapshot);

      const result = await aggregateProductivityData({ date: '2024-01-15' });

      expect(result).toHaveLength(1);
      expect(result[0].aggregated_productivity_percent).toBe(0);
    });

    test('should sort results by productivity descending', async () => {
      const mockUsersSnapshot = {
        forEach: jest.fn((callback) => {
          callback({
            id: 'user1',
            data: () => ({
              displayName: 'Low Performer',
              email: 'low@company.com',
              is_active: true,
              is_dummy: false,
              role: 'editor'
            })
          });
          
          callback({
            id: 'user2',
            data: () => ({
              displayName: 'High Performer',
              email: 'high@company.com',
              is_active: true,
              is_dummy: false,
              role: 'editor'
            })
          });
        })
      };

      const mockHourlySnapshot = {
        forEach: jest.fn((callback) => {
          callback({
            data: () => ({
              userId: 'user1',
              productivity: 60,
              duration: 3600,
              createdAt: { toDate: () => new Date() }
            })
          });
          
          callback({
            data: () => ({
              userId: 'user2',
              productivity: 95,
              duration: 3600,
              createdAt: { toDate: () => new Date() }
            })
          });
        })
      };

      mockCollection.get
        .mockResolvedValueOnce(mockUsersSnapshot)
        .mockResolvedValueOnce(mockHourlySnapshot);

      const result = await aggregateProductivityData({ date: '2024-01-15' });

      expect(result).toHaveLength(2);
      expect(result[0].display_name).toBe('High Performer');
      expect(result[0].aggregated_productivity_percent).toBe(95);
      expect(result[1].display_name).toBe('Low Performer');
      expect(result[1].aggregated_productivity_percent).toBe(60);
    });

    test('should handle last_login threshold correctly', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 200); // 200 days ago (beyond threshold)
      
      const recentDate = new Date();
      recentDate.setDate(recentDate.getDate() - 30); // 30 days ago (within threshold)

      const mockUsersSnapshot = {
        forEach: jest.fn((callback) => {
          // User with old last_login (should be filtered out)
          callback({
            id: 'user1',
            data: () => ({
              displayName: 'Old User',
              email: 'old@company.com',
              is_active: true,
              is_dummy: false,
              role: 'editor',
              last_login: { toDate: () => oldDate }
            })
          });
          
          // User with recent last_login (should be included)
          callback({
            id: 'user2',
            data: () => ({
              displayName: 'Recent User',
              email: 'recent@company.com',
              is_active: true,
              is_dummy: false,
              role: 'editor',
              last_login: { toDate: () => recentDate }
            })
          });
          
          // User with no last_login (should be included by default)
          callback({
            id: 'user3',
            data: () => ({
              displayName: 'New User',
              email: 'new@company.com',
              is_active: true,
              is_dummy: false,
              role: 'editor'
            })
          });
        })
      };

      const mockHourlySnapshot = {
        forEach: jest.fn(() => {
          // No hourly reports for simplicity
        })
      };

      mockCollection.get
        .mockResolvedValueOnce(mockUsersSnapshot)
        .mockResolvedValueOnce(mockHourlySnapshot);

      const result = await aggregateProductivityData({ date: '2024-01-15' });

      expect(result).toHaveLength(2);
      expect(result.map(r => r.display_name)).toEqual(['Recent User', 'New User']);
    });

    test('should handle missing or malformed data gracefully', async () => {
      const mockUsersSnapshot = {
        forEach: jest.fn((callback) => {
          // User with minimal data
          callback({
            id: 'user1',
            data: () => ({
              // Missing displayName and other fields
              email: 'minimal@company.com'
            })
          });
          
          // User with null data
          callback({
            id: 'user2',
            data: () => null
          });
        })
      };

      const mockHourlySnapshot = {
        forEach: jest.fn((callback) => {
          // Report with missing fields
          callback({
            data: () => ({
              userId: 'user1'
              // Missing productivity and duration
            })
          });
          
          // Report with null data
          callback({
            data: () => null
          });
        })
      };

      mockCollection.get
        .mockResolvedValueOnce(mockUsersSnapshot)
        .mockResolvedValueOnce(mockHourlySnapshot);

      const result = await aggregateProductivityData({ date: '2024-01-15' });

      // Should handle gracefully and return valid results
      expect(Array.isArray(result)).toBe(true);
    });

    test('should use default date when not provided', async () => {
      const mockUsersSnapshot = { forEach: jest.fn() };
      const mockHourlySnapshot = { forEach: jest.fn() };

      mockCollection.get
        .mockResolvedValueOnce(mockUsersSnapshot)
        .mockResolvedValueOnce(mockHourlySnapshot);

      await aggregateProductivityData({});

      // Should use today's date by default
      const expectedDate = new Date().toISOString().split('T')[0];
      expect(mockCollection.where).toHaveBeenCalledWith('ymd', '==', expectedDate);
    });

    test('should handle database errors gracefully', async () => {
      mockCollection.get.mockRejectedValue(new Error('Database connection failed'));

      await expect(aggregateProductivityData({ date: '2024-01-15' }))
        .rejects
        .toThrow('Database connection failed');
    });
  });

  describe('Real User Filtering', () => {
    test('should exclude test email domains', async () => {
      const mockUsersSnapshot = {
        forEach: jest.fn((callback) => {
          callback({
            id: 'user1',
            data: () => ({
              displayName: 'Test User 1',
              email: 'user@example.com', // Should be excluded
              is_active: true,
              is_dummy: false,
              role: 'editor'
            })
          });
          
          callback({
            id: 'user2',
            data: () => ({
              displayName: 'Test User 2',
              email: 'user@test.com', // Should be excluded
              is_active: true,
              is_dummy: false,
              role: 'editor'
            })
          });
          
          callback({
            id: 'user3',
            data: () => ({
              displayName: 'Real User',
              email: 'user@company.com', // Should be included
              is_active: true,
              is_dummy: false,
              role: 'editor'
            })
          });
        })
      };

      const mockHourlySnapshot = { forEach: jest.fn() };

      mockCollection.get
        .mockResolvedValueOnce(mockUsersSnapshot)
        .mockResolvedValueOnce(mockHourlySnapshot);

      const result = await aggregateProductivityData({ date: '2024-01-15' });

      expect(result).toHaveLength(1);
      expect(result[0].display_name).toBe('Real User');
    });

    test('should exclude test roles', async () => {
      const mockUsersSnapshot = {
        forEach: jest.fn((callback) => {
          callback({
            id: 'user1',
            data: () => ({
              displayName: 'Test Role User',
              email: 'user@company.com',
              is_active: true,
              is_dummy: false,
              role: 'test' // Should be excluded
            })
          });
          
          callback({
            id: 'user2',
            data: () => ({
              displayName: 'Editor User',
              email: 'editor@company.com',
              is_active: true,
              is_dummy: false,
              role: 'editor' // Should be included
            })
          });
        })
      };

      const mockHourlySnapshot = { forEach: jest.fn() };

      mockCollection.get
        .mockResolvedValueOnce(mockUsersSnapshot)
        .mockResolvedValueOnce(mockHourlySnapshot);

      const result = await aggregateProductivityData({ date: '2024-01-15' });

      expect(result).toHaveLength(1);
      expect(result[0].display_name).toBe('Editor User');
    });
  });
});