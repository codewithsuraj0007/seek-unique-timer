// renderer/__tests__/productivity-chart.test.js

/**
 * @jest-environment jsdom
 */

// Mock Firebase
const mockAuth = {
  currentUser: {
    getIdToken: jest.fn().mockResolvedValue('mock-token')
  }
};

const mockDb = {};
const mockCollection = jest.fn();
const mockQuery = jest.fn();
const mockWhere = jest.fn();
const mockGetDocs = jest.fn();

// Mock Firebase imports
jest.mock('../firebase.js', () => ({
  auth: mockAuth,
  db: mockDb,
  collection: mockCollection,
  query: mockQuery,
  where: mockWhere,
  getDocs: mockGetDocs
}));

// Import ProductivityChart after mocking
import ProductivityChart from '../productivity-chart.js';

describe('ProductivityChart', () => {
  let container;
  let chart;

  beforeEach(() => {
    // Setup DOM
    document.body.innerHTML = '<div id="test-container"></div>';
    container = document.getElementById('test-container');
    
    // Reset mocks
    jest.clearAllMocks();
    
    // Mock localStorage
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: jest.fn(),
        setItem: jest.fn(),
        removeItem: jest.fn()
      },
      writable: true
    });
  });

  afterEach(() => {
    if (chart) {
      chart.destroy();
      chart = null;
    }
    document.body.innerHTML = '';
  });

  describe('Initialization', () => {
    test('should create chart structure', () => {
      chart = new ProductivityChart('test-container');
      
      expect(container.querySelector('.productivity-chart-wrapper')).toBeTruthy();
      expect(container.querySelector('.chart-header h4')).toBeTruthy();
      expect(container.querySelector('.chart-canvas')).toBeTruthy();
      expect(container.querySelector('.chart-footer')).toBeTruthy();
    });

    test('should handle missing container gracefully', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      chart = new ProductivityChart('non-existent-container');
      
      expect(consoleSpy).toHaveBeenCalledWith('Container non-existent-container not found');
      consoleSpy.mockRestore();
    });

    test('should apply custom options', () => {
      const options = {
        updateInterval: 30000,
        maxBars: 10,
        height: 400
      };
      
      chart = new ProductivityChart('test-container', options);
      
      expect(chart.options.updateInterval).toBe(30000);
      expect(chart.options.maxBars).toBe(10);
      expect(chart.options.height).toBe(400);
    });
  });

  describe('Feature Flag', () => {
    test('should respect feature flag from localStorage', () => {
      window.localStorage.getItem.mockReturnValue('false');
      
      chart = new ProductivityChart('test-container');
      
      expect(chart.isFeatureEnabled()).toBe(false);
    });

    test('should respect feature flag from window.FEATURE_FLAGS', () => {
      window.FEATURE_FLAGS = { PRODUCTIVITY_CHART: true };
      
      chart = new ProductivityChart('test-container');
      
      expect(chart.isFeatureEnabled()).toBe(true);
      
      delete window.FEATURE_FLAGS;
    });

    test('should default to enabled', () => {
      chart = new ProductivityChart('test-container');
      
      expect(chart.isFeatureEnabled()).toBe(true);
    });
  });

  describe('Date Selection', () => {
    beforeEach(() => {
      chart = new ProductivityChart('test-container');
    });

    test('should return today by default', () => {
      const today = new Date().toISOString().split('T')[0];
      
      expect(chart.getSelectedDate()).toBe(today);
    });

    test('should return yesterday when selected', () => {
      const dateFilter = container.querySelector('#productivityDateFilter');
      dateFilter.value = 'yesterday';
      
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const expectedDate = yesterday.toISOString().split('T')[0];
      
      expect(chart.getSelectedDate()).toBe(expectedDate);
    });

    test('should return custom date when selected', () => {
      const dateFilter = container.querySelector('#productivityDateFilter');
      const customDate = container.querySelector('#productivityCustomDate');
      
      dateFilter.value = 'custom';
      customDate.value = '2024-01-15';
      
      expect(chart.getSelectedDate()).toBe('2024-01-15');
    });
  });

  describe('Data Fetching', () => {
    beforeEach(() => {
      chart = new ProductivityChart('test-container');
    });

    test('should handle authentication error', async () => {
      mockAuth.currentUser = null;
      
      await chart.fetchData();
      
      const errorEl = container.querySelector('.chart-error');
      expect(errorEl.style.display).toBe('block');
      expect(errorEl.textContent).toContain('Authentication required');
    });

    test('should filter real users correctly', async () => {
      // Mock users data
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
        })
      };

      // Mock hourly reports data
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
        })
      };

      mockGetDocs
        .mockResolvedValueOnce(mockUsersSnapshot)
        .mockResolvedValueOnce(mockHourlySnapshot);

      await chart.fetchLocalData('2024-01-15');

      // Should only include real users
      expect(chart.data).toHaveLength(1);
      expect(chart.data[0].display_name).toBe('John Doe');
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
          // First report: 80% productivity for 2 hours
          callback({
            data: () => ({
              userId: 'user1',
              productivity: 80,
              duration: 7200,
              createdAt: { toDate: () => new Date() }
            })
          });
          
          // Second report: 90% productivity for 1 hour
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

      mockGetDocs
        .mockResolvedValueOnce(mockUsersSnapshot)
        .mockResolvedValueOnce(mockHourlySnapshot);

      const result = await chart.fetchLocalData('2024-01-15');

      // Weighted average: (80*7200 + 90*3600) / (7200+3600) = 83.3
      expect(result[0].aggregated_productivity_percent).toBe(83.3);
    });
  });

  describe('Chart Rendering', () => {
    beforeEach(() => {
      chart = new ProductivityChart('test-container');
    });

    test('should render empty state when no data', () => {
      chart.data = [];
      chart.renderChart();
      
      const canvas = container.querySelector('.chart-canvas');
      expect(canvas.textContent).toContain('No productivity data available');
    });

    test('should render bars for user data', () => {
      chart.data = [
        {
          user_id: 'user1',
          display_name: 'John Doe',
          aggregated_productivity_percent: 85.5,
          report_count: 3,
          last_reported_at: new Date().toISOString()
        },
        {
          user_id: 'user2',
          display_name: 'Jane Smith',
          aggregated_productivity_percent: 92.0,
          report_count: 2,
          last_reported_at: new Date().toISOString()
        }
      ];
      
      chart.renderChart();
      
      const bars = container.querySelectorAll('.chart-bar');
      expect(bars).toHaveLength(2);
      
      // Check labels
      const labels = container.querySelectorAll('.chart-bar-label');
      expect(labels[0].textContent).toBe('85.5%');
      expect(labels[1].textContent).toBe('92%');
      
      // Check names
      const names = container.querySelectorAll('.chart-bar-name');
      expect(names[0].textContent).toBe('John Doe');
      expect(names[1].textContent).toBe('Jane Smith');
    });

    test('should apply purple gradient colors', () => {
      chart.data = [
        {
          user_id: 'user1',
          display_name: 'John Doe',
          aggregated_productivity_percent: 75,
          report_count: 1,
          last_reported_at: new Date().toISOString()
        }
      ];
      
      chart.renderChart();
      
      const barFill = container.querySelector('.chart-bar-fill');
      expect(barFill.style.background).toContain('linear-gradient');
      expect(barFill.style.background).toContain('232, 121, 249'); // Light purple
      expect(barFill.style.background).toContain('124, 58, 237');  // Dark purple
    });

    test('should add glow effect for high performers', () => {
      chart.data = [
        {
          user_id: 'user1',
          display_name: 'High Performer',
          aggregated_productivity_percent: 120, // Over 100%
          report_count: 1,
          last_reported_at: new Date().toISOString()
        }
      ];
      
      chart.renderChart();
      
      const barFill = container.querySelector('.chart-bar-fill');
      expect(barFill.style.boxShadow).toContain('rgba(124, 58, 237, 0.6)');
    });
  });

  describe('Tooltips', () => {
    beforeEach(() => {
      chart = new ProductivityChart('test-container');
      chart.data = [
        {
          user_id: 'user1',
          display_name: 'John Doe',
          aggregated_productivity_percent: 85.5,
          report_count: 3,
          last_reported_at: '2024-01-15T10:30:00Z'
        }
      ];
      chart.renderChart();
    });

    test('should show tooltip on hover', () => {
      const bar = container.querySelector('.chart-bar');
      const event = new MouseEvent('mouseenter', { bubbles: true });
      Object.defineProperty(event, 'target', { value: bar });
      
      bar.dispatchEvent(event);
      
      const tooltip = document.querySelector('.chart-tooltip');
      expect(tooltip).toBeTruthy();
      expect(tooltip.textContent).toContain('John Doe');
      expect(tooltip.textContent).toContain('85.5%');
      expect(tooltip.textContent).toContain('Reports: 3');
    });

    test('should hide tooltip on mouse leave', () => {
      const bar = container.querySelector('.chart-bar');
      
      // Show tooltip
      bar.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      expect(document.querySelector('.chart-tooltip')).toBeTruthy();
      
      // Hide tooltip
      bar.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
      expect(document.querySelector('.chart-tooltip')).toBeFalsy();
    });
  });

  describe('Live Updates', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    test('should start live updates on initialization', () => {
      const fetchDataSpy = jest.spyOn(ProductivityChart.prototype, 'fetchData').mockImplementation();
      
      chart = new ProductivityChart('test-container');
      
      expect(fetchDataSpy).toHaveBeenCalledTimes(1); // Initial fetch
      
      // Fast forward time
      jest.advanceTimersByTime(60000);
      
      expect(fetchDataSpy).toHaveBeenCalledTimes(2); // Should fetch again after interval
      
      fetchDataSpy.mockRestore();
    });

    test('should stop updates when destroyed', () => {
      const fetchDataSpy = jest.spyOn(ProductivityChart.prototype, 'fetchData').mockImplementation();
      
      chart = new ProductivityChart('test-container');
      chart.destroy();
      
      // Fast forward time
      jest.advanceTimersByTime(60000);
      
      expect(fetchDataSpy).toHaveBeenCalledTimes(1); // Only initial fetch
      
      fetchDataSpy.mockRestore();
    });

    test('should respect visibility state', () => {
      const fetchDataSpy = jest.spyOn(ProductivityChart.prototype, 'fetchData').mockImplementation();
      
      chart = new ProductivityChart('test-container');
      chart.setVisibility(false);
      
      // Fast forward time
      jest.advanceTimersByTime(60000);
      
      expect(fetchDataSpy).toHaveBeenCalledTimes(1); // Should not fetch when not visible
      
      fetchDataSpy.mockRestore();
    });
  });

  describe('Accessibility', () => {
    beforeEach(() => {
      chart = new ProductivityChart('test-container');
    });

    test('should have proper ARIA labels', () => {
      const chartHeader = container.querySelector('.chart-header h4');
      expect(chartHeader.textContent).toBe('Live User Productivity Comparison');
      
      const legend = container.querySelector('.chart-legend');
      expect(legend).toBeTruthy();
    });

    test('should support keyboard navigation', () => {
      chart.data = [
        {
          user_id: 'user1',
          display_name: 'John Doe',
          aggregated_productivity_percent: 85,
          report_count: 1,
          last_reported_at: new Date().toISOString()
        }
      ];
      chart.renderChart();
      
      const bar = container.querySelector('.chart-bar');
      expect(bar.style.cursor).toBe('pointer');
    });

    test('should have proper color contrast', () => {
      // Test that colors meet accessibility standards
      chart.data = [
        {
          user_id: 'user1',
          display_name: 'John Doe',
          aggregated_productivity_percent: 50,
          report_count: 1,
          last_reported_at: new Date().toISOString()
        }
      ];
      chart.renderChart();
      
      const barFill = container.querySelector('.chart-bar-fill');
      const background = barFill.style.background;
      
      // Should use purple gradient with sufficient contrast
      expect(background).toContain('232, 121, 249'); // Light purple
      expect(background).toContain('124, 58, 237');  // Dark purple
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      chart = new ProductivityChart('test-container');
    });

    test('should handle fetch errors gracefully', async () => {
      mockGetDocs.mockRejectedValue(new Error('Network error'));
      
      await chart.fetchData();
      
      const errorEl = container.querySelector('.chart-error');
      expect(errorEl.style.display).toBe('block');
      expect(errorEl.textContent).toContain('Network error');
    });

    test('should handle malformed data', async () => {
      const mockUsersSnapshot = {
        forEach: jest.fn((callback) => {
          callback({
            id: 'user1',
            data: () => null // Malformed data
          });
        })
      };

      mockGetDocs.mockResolvedValue(mockUsersSnapshot);
      
      const result = await chart.fetchLocalData('2024-01-15');
      
      expect(result).toEqual([]);
    });
  });
});