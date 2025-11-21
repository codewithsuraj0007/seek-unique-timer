// renderer/__tests__/layering-productivity-chart.test.js
// Test suite for Layering Productivity Chart functionality

describe('LayeringProductivityChart', () => {
  let mockContainer;
  let mockFirebaseExports;
  
  beforeEach(() => {
    // Mock DOM container
    mockContainer = document.createElement('div');
    mockContainer.id = 'testContainer';
    document.body.appendChild(mockContainer);
    
    // Mock Firebase exports
    mockFirebaseExports = {
      db: {},
      collection: jest.fn(),
      getDocs: jest.fn(),
      query: jest.fn(),
      where: jest.fn()
    };
    
    window.firebaseExports = mockFirebaseExports;
    
    // Mock fetch for API calls
    global.fetch = jest.fn();
  });
  
  afterEach(() => {
    // Clean up DOM
    if (mockContainer && mockContainer.parentNode) {
      mockContainer.parentNode.removeChild(mockContainer);
    }
    
    // Clean up globals
    delete window.firebaseExports;
    delete window.layeringProductivityChart;
    
    jest.clearAllMocks();
  });
  
  test('should initialize LayeringProductivityChart class', () => {
    // Load the module
    require('../productivity_layering.js');
    
    expect(window.LayeringProductivityChart).toBeDefined();
    expect(typeof window.LayeringProductivityChart).toBe('function');
  });
  
  test('should initialize chart with container element', () => {
    require('../productivity_layering.js');
    
    const chart = new window.LayeringProductivityChart({
      containerEl: mockContainer
    });
    
    expect(chart.container).toBe(mockContainer);
    expect(chart.chartData).toEqual([]);
    expect(chart.isVisible).toBe(false);
  });
  
  test('should handle missing container gracefully', () => {
    require('../productivity_layering.js');
    
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
    
    const chart = new window.LayeringProductivityChart({
      containerEl: null
    });
    
    expect(consoleSpy).toHaveBeenCalledWith('LayeringProductivityChart: Container not found');
    consoleSpy.mockRestore();
  });
  
  test('should show loading state initially', () => {
    require('../productivity_layering.js');
    
    const chart = new window.LayeringProductivityChart({
      containerEl: mockContainer
    });
    
    expect(mockContainer.innerHTML).toContain('Loading layering productivity data');
  });
  
  test('should handle API response correctly', async () => {
    require('../productivity_layering.js');
    
    // Mock successful API response
    const mockApiResponse = {
      success: true,
      data: [
        {
          userId: 'user1',
          name: 'Test User 1',
          productivity: 85.5
        },
        {
          userId: 'user2', 
          name: 'Test User 2',
          productivity: 72.3
        }
      ]
    };
    
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockApiResponse)
    });
    
    const chart = new window.LayeringProductivityChart({
      containerEl: mockContainer
    });
    
    // Wait for async operations
    await new Promise(resolve => setTimeout(resolve, 100));
    
    expect(global.fetch).toHaveBeenCalledWith('http://localhost:3001/api/layering-productivity/legacy');
  });
  
  test('should format productivity data correctly', () => {
    require('../productivity_layering.js');
    
    const chart = new window.LayeringProductivityChart({
      containerEl: mockContainer
    });
    
    // Test color intensity function
    expect(chart.getColorIntensity(30)).toBe('#4f46e580'); // Light
    expect(chart.getColorIntensity(60)).toBe('#4f46e5CC'); // Moderate  
    expect(chart.getColorIntensity(90)).toBe('#4f46e5'); // Deep
  });
  
  test('should truncate long names correctly', () => {
    require('../productivity_layering.js');
    
    const chart = new window.LayeringProductivityChart({
      containerEl: mockContainer
    });
    
    expect(chart.truncateName('Short')).toBe('Short');
    expect(chart.truncateName('Very Long Name')).toBe('Very Lo...');
    expect(chart.truncateName('')).toBe('User');
    expect(chart.truncateName(null)).toBe('User');
  });
  
  test('should handle global initialization function', () => {
    require('../productivity_layering.js');
    
    expect(window.initLayeringProductivityChart).toBeDefined();
    expect(typeof window.initLayeringProductivityChart).toBe('function');
    
    // Test initialization
    window.initLayeringProductivityChart({
      containerEl: mockContainer
    });
    
    expect(window.layeringProductivityChart).toBeDefined();
  });
  
  test('should handle global cleanup function', () => {
    require('../productivity_layering.js');
    
    // Initialize first
    window.initLayeringProductivityChart({
      containerEl: mockContainer
    });
    
    expect(window.layeringProductivityChart).toBeDefined();
    
    // Then cleanup
    window.destroyLayeringProductivityChart();
    
    expect(window.layeringProductivityChart).toBeNull();
  });
  
  test('should start and stop live updates correctly', () => {
    require('../productivity_layering.js');
    
    const chart = new window.LayeringProductivityChart({
      containerEl: mockContainer
    });
    
    // Mock setInterval and clearInterval
    const mockSetInterval = jest.spyOn(global, 'setInterval');
    const mockClearInterval = jest.spyOn(global, 'clearInterval');
    
    chart.startLiveUpdates();
    expect(mockSetInterval).toHaveBeenCalledWith(expect.any(Function), 60000);
    
    chart.stopLiveUpdates();
    expect(mockClearInterval).toHaveBeenCalled();
    
    mockSetInterval.mockRestore();
    mockClearInterval.mockRestore();
  });
});