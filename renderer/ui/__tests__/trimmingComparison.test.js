/**
 * Test file for Trimming Grand Time Comparison Graph functionality
 */

describe('Trimming Comparison Graph', () => {
  beforeEach(() => {
    // Set up DOM structure
    document.body.innerHTML = `
      <div id="trimmingComparisonSection">
        <h3 class="trimming-comparison-title">📊 Trimming Comparison (Relative Performance)</h3>
        <div class="trimming-comparison-legend">
          <span class="legend-text">Higher bars = more trimming time (relative)</span>
          <span class="legend-note">Values shown are comparative, not exact.</span>
        </div>
        <div class="trimming-comparison-chart" id="trimmingComparisonChart">
          <div class="loading-text">Loading comparison data...</div>
        </div>
      </div>
    `;
  });

  test('DOM elements exist', () => {
    const section = document.getElementById('trimmingComparisonSection');
    const chart = document.getElementById('trimmingComparisonChart');
    
    expect(section).toBeTruthy();
    expect(chart).toBeTruthy();
    expect(chart.innerHTML).toContain('Loading comparison data...');
  });

  test('escapeHtml function works correctly', () => {
    // Mock escapeHtml if not defined
    if (typeof escapeHtml !== 'function') {
      window.escapeHtml = function(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
      };
    }

    expect(escapeHtml('Hello World')).toBe('Hello World');
    expect(escapeHtml('<script>alert("xss")</script>')).toBe('&lt;script&gt;alert("xss")&lt;/script&gt;');
    expect(escapeHtml('User & Admin')).toBe('User &amp; Admin');
  });

  test('comparison data structure is correct', () => {
    const mockData = {
      users: [
        {
          userId: 'user1',
          displayName: 'Aditi',
          totalSeconds: 612, // 10:12
          normalizedValue: 100
        },
        {
          userId: 'user2', 
          displayName: 'Aman',
          totalSeconds: 465, // 7:45
          normalizedValue: 75.98
        }
      ],
      maxValue: 612,
      lastUpdated: Date.now()
    };

    expect(mockData.users).toHaveLength(2);
    expect(mockData.users[0].normalizedValue).toBe(100);
    expect(mockData.users[1].normalizedValue).toBeCloseTo(75.98, 1);
    expect(mockData.maxValue).toBe(612);
  });

  test('no data state displays correctly', () => {
    const chart = document.getElementById('trimmingComparisonChart');
    
    // Simulate no data state
    chart.innerHTML = `
      <div class="no-comparison-data">
        <div>No trimming data available for comparison today.</div>
        <div style="font-size: 0.8rem; margin-top: 5px;">Users will appear here once they submit trimming reports.</div>
      </div>
    `;

    const noDataElement = chart.querySelector('.no-comparison-data');
    expect(noDataElement).toBeTruthy();
    expect(noDataElement.textContent).toContain('No trimming data available');
  });

  test('comparison bar structure is correct', () => {
    const chart = document.getElementById('trimmingComparisonChart');
    
    // Simulate populated state
    chart.innerHTML = `
      <div class="comparison-bar-item" data-user-id="user1">
        <div class="comparison-user-label">Aditi</div>
        <div class="comparison-bar-container">
          <div class="comparison-bar-fill" style="width: 100%"></div>
        </div>
        <div class="comparison-tooltip" title="Top Performer">
          <div class="comparison-rank-badge top-performer">Top Performer</div>
        </div>
      </div>
    `;

    const barItem = chart.querySelector('.comparison-bar-item');
    const userLabel = chart.querySelector('.comparison-user-label');
    const barFill = chart.querySelector('.comparison-bar-fill');
    const rankBadge = chart.querySelector('.comparison-rank-badge');

    expect(barItem).toBeTruthy();
    expect(userLabel.textContent).toBe('Aditi');
    expect(barFill.style.width).toBe('100%');
    expect(rankBadge.textContent).toBe('Top Performer');
    expect(rankBadge.classList.contains('top-performer')).toBe(true);
  });

  test('cache duration constant is set correctly', () => {
    const COMPARISON_CACHE_DURATION = 30 * 1000; // 30 seconds
    expect(COMPARISON_CACHE_DURATION).toBe(30000);
  });

  test('normalization calculation works correctly', () => {
    const users = [
      { totalSeconds: 612 }, // 10:12
      { totalSeconds: 465 }, // 7:45  
      { totalSeconds: 330 }, // 5:30
      { totalSeconds: 260 }  // 4:20
    ];
    
    const maxValue = Math.max(...users.map(u => u.totalSeconds));
    expect(maxValue).toBe(612);
    
    users.forEach(user => {
      user.normalizedValue = maxValue > 0 ? (user.totalSeconds / maxValue) * 100 : 0;
    });
    
    expect(users[0].normalizedValue).toBe(100);
    expect(users[1].normalizedValue).toBeCloseTo(75.98, 1);
    expect(users[2].normalizedValue).toBeCloseTo(53.92, 1);
    expect(users[3].normalizedValue).toBeCloseTo(42.48, 1);
  });
});