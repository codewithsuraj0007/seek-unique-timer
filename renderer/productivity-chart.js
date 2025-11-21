// renderer/productivity-chart.js
// Productivity Comparison Chart - Live dynamic vertical bar chart
// Fetches data from Admin KPI (Per Editor → Productivity column)

class ProductivityChart {
  constructor(containerId) {
    this.containerId = containerId;
    this.container = document.getElementById(containerId);
    this.updateInterval = null;
    this.isVisible = false;
    this.lastUpdateTime = null;
    this.chartData = [];
    this.metric = 'trimming'; // Default metric
    
    // Firebase imports (available globally from app.js)
    this.db = window.firebaseExports?.db;
    this.collection = window.firebaseExports?.collection;
    this.getDocs = window.firebaseExports?.getDocs;
    this.query = window.firebaseExports?.query;
    this.where = window.firebaseExports?.where;
    this.doc = window.firebaseExports?.doc;
    this.getDoc = window.firebaseExports?.getDoc;
    
    if (!this.container) {
      console.warn('ProductivityChart: Container not found:', containerId);
      return;
    }
    
    this.init();
  }
  
  init() {
    console.log('ProductivityChart: Initializing...');
    this.setupStyles();
    this.setupDropdown();
    this.render();
    this.fetchData();
  }
  
  setupDropdown() {
    const dropdown = document.getElementById('productivityMetricSelect');
    if (dropdown) {
      dropdown.addEventListener('change', (e) => {
        this.metric = e.target.value;
        this.switchMetric(e.target.value);
      });
    }
  }
  
  switchMetric(metric) {
    console.log('ProductivityChart: Switching to metric:', metric);
    
    if (metric === 'layering') {
      console.log('ProductivityChart: Initializing layering chart...');
      console.log('ProductivityChart: Available functions:', {
        initLayeringProductivityChart: !!window.initLayeringProductivityChart,
        destroyLayeringProductivityChart: !!window.destroyLayeringProductivityChart
      });
      
      // Initialize layering chart
      if (window.initLayeringProductivityChart) {
        // Clear container first
        if (this.container) {
          this.container.innerHTML = '<div class="loading-text">Switching to layering productivity...</div>';
        }
        
        try {
          window.initLayeringProductivityChart({
            containerEl: this.container,
            dropdownEl: document.getElementById('productivityMetricSelect')
          });
          console.log('ProductivityChart: Layering chart initialized successfully');
        } catch (error) {
          console.error('ProductivityChart: Error initializing layering chart:', error);
          this.showError('Failed to initialize layering chart: ' + error.message);
        }
      } else {
        console.error('ProductivityChart: Layering chart module not loaded');
        this.showError('Layering chart not available - module not loaded');
      }
    } else {
      console.log('ProductivityChart: Switching back to trimming chart...');
      // Destroy layering chart if it exists and reinitialize trimming chart
      if (window.destroyLayeringProductivityChart) {
        try {
          window.destroyLayeringProductivityChart();
          console.log('ProductivityChart: Layering chart destroyed');
        } catch (error) {
          console.error('ProductivityChart: Error destroying layering chart:', error);
        }
      }
      this.fetchData();
    }
  }
  
  setupStyles() {
    // Add chart-specific styles if not already present
    if (document.getElementById('productivity-chart-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'productivity-chart-styles';
    style.textContent = `
      .productivity-chart {
        width: 100%;
        height: 300px;
        display: flex;
        align-items: end;
        justify-content: center;
        gap: 12px;
        padding: 20px 0;
        overflow-x: auto;
        overflow-y: hidden;
      }
      
      .productivity-bar {
        position: relative;
        min-width: 50px;
        max-width: 80px;
        border-radius: 8px 8px 0 0;
        transition: all 0.3s ease;
        cursor: pointer;
        display: flex;
        flex-direction: column;
        align-items: center;
        box-shadow: 0 4px 12px rgba(124, 58, 237, 0.3);
        animation: barGrow 0.8s ease-out;
      }
      
      .productivity-bar:hover {
        transform: translateY(-3px) scale(1.05);
        box-shadow: 0 8px 20px rgba(124, 58, 237, 0.4);
      }
      
      .productivity-bar-label {
        position: absolute;
        top: -35px;
        left: 50%;
        transform: translateX(-50%);
        color: var(--text);
        font-size: 12px;
        font-weight: bold;
        white-space: nowrap;
        background: rgba(0, 0, 0, 0.8);
        padding: 4px 8px;
        border-radius: 6px;
        opacity: 0;
        transition: opacity 0.3s ease;
        z-index: 10;
      }
      
      .productivity-bar:hover .productivity-bar-label {
        opacity: 1;
      }
      
      .productivity-bar-name {
        margin-top: 8px;
        color: var(--text);
        font-size: 11px;
        text-align: center;
        max-width: 80px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-weight: 600;
      }
      
      .chart-loading {
        color: var(--text-muted);
        text-align: center;
        font-style: italic;
        padding: 40px;
      }
      
      .chart-error {
        color: #ef4444;
        text-align: center;
        font-style: italic;
        padding: 40px;
      }
      
      .chart-no-data {
        color: var(--text-muted);
        text-align: center;
        font-style: italic;
        padding: 40px;
      }
      
      .chart-debug {
        color: var(--text-muted);
        text-align: center;
        font-size: 12px;
        padding: 20px;
        background: rgba(255, 255, 255, 0.05);
        border-radius: 8px;
        margin: 10px;
      }
      
      @keyframes barGrow {
        from {
          height: 0;
          opacity: 0;
        }
        to {
          opacity: 1;
        }
      }
      
@media (max-width: 1200px) {
        .productivity-chart {
          gap: 10px;
          padding: 15px 0;
        }
        .productivity-bar {
          min-width: 45px;
          max-width: 70px;
        }
      }
      
      @media (max-width: 768px) {
        .productivity-bar {
          min-width: 40px;
          max-width: 60px;
        }
        
        .productivity-chart {
          gap: 8px;
          height: 250px;
          padding: 10px 0;
        }
        
        .productivity-bar-label {
          font-size: 11px;
          top: -30px;
        }
        
        .productivity-bar-name {
          font-size: 10px;
        }
      }
      
      @media (max-width: 480px) {
        .productivity-bar {
          min-width: 30px;
          max-width: 45px;
        }
        
        .productivity-chart {
          gap: 4px;
          height: 200px;
          padding: 8px 0;
        }
        
        .productivity-bar-label {
          font-size: 10px;
          top: -25px;
          padding: 2px 4px;
        }
        
        .productivity-bar-name {
          font-size: 9px;
          margin-top: 4px;
        }
      }
      
      @media (max-width: 320px) {
        .productivity-bar {
          min-width: 25px;
          max-width: 35px;
        }
        
        .productivity-chart {
          gap: 2px;
          height: 180px;
        }
        
        .productivity-bar-label {
          font-size: 9px;
        }
        
        .productivity-bar-name {
          font-size: 8px;
        }
      }
    `;
    document.head.appendChild(style);
  }
  
  async fetchData() {
    if (!this.db || !this.collection || !this.getDocs) {
      console.warn('ProductivityChart: Firebase not available');
      this.showError('Firebase not available');
      return;
    }
    
    try {
      console.log(`ProductivityChart: Fetching ${this.metric} data...`);
      this.showLoading();
      
      let finalData = [];
      if (this.metric === 'layering') {
        // Layering is now handled by the separate layering chart module
        return;
      } else {
        // For trimming, use existing logic
        const publicProductivityData = await this.fetchPublicProductivity();
        const userData = publicProductivityData.length === 0 ? await this.fetchUsersProductivity() : [];
        finalData = publicProductivityData.length > 0 ? publicProductivityData : userData;
      }
      
      if (finalData.length === 0) {
        this.showNoData();
        return;
      }
      
      // Sort by productivity (highest first)
      finalData.sort((a, b) => b.productivity - a.productivity);
      
      // Limit to top 20 users
      this.chartData = finalData.slice(0, 20);
      
      this.lastUpdateTime = new Date();
      this.renderChart();
      this.updateLastUpdateTime();
      
      console.log(`ProductivityChart: ${this.metric} data loaded successfully`, this.chartData);
      
    } catch (error) {
      console.error('ProductivityChart: Error fetching data:', error);
      this.showError('Failed to load productivity data');
    }
  }
  

  

  
  async fetchPublicProductivity() {
    try {
      const today = this.getYMD(new Date());
      const snapshot = await this.getDocs(this.collection(this.db, 'publicProductivity'));
      
      const data = [];
      snapshot.forEach(doc => {
        const docData = doc.data();
        let productivityValue = 0;
        
        if (this.metric === 'layering') {
          // Try multiple possible field names for layering productivity
          productivityValue = docData.layeringProductivity || docData.layering_productivity || docData.layering || 0;
        } else {
          productivityValue = docData.productivity || 0;
        }
        
        if (docData.date === today && productivityValue >= 0) {
          data.push({
            userId: docData.userId,
            name: docData.displayName || 'User',
            productivity: productivityValue
          });
        }
      });
      
      console.log(`PublicProductivity data (${this.metric}):`, data);
      return data;
    } catch (error) {
      console.warn('Error fetching public productivity:', error);
      return [];
    }
  }
  
  async fetchLayeringProductivityData() {
    try {
      // Fetch from API first
      const response = await fetch('http://localhost:3001/api/layering-productivity');
      
      if (response.ok) {
        const result = await response.json();
        if (result.success && result.data) {
          console.log('API layering data:', result.data);
          return result.data;
        }
      }
      
      // Fallback to direct Firebase query
      return await this.fetchLayeringDataFallback();
    } catch (error) {
      console.warn('API failed, using fallback:', error);
      return await this.fetchLayeringDataFallback();
    }
  }
  
  async fetchLayeringDataFallback() {
    try {
      const today = this.getYMD(new Date());
      
      // Get all users
      const usersSnapshot = await this.getDocs(this.collection(this.db, 'users'));
      const users = new Map();
      usersSnapshot.forEach(doc => {
        const userData = doc.data();
        users.set(doc.id, {
          userId: doc.id,
          name: userData.displayName || userData.email?.split('@')[0] || 'User'
        });
      });
      
      // Get layering hourly reports for today
      const reportsSnapshot = await this.getDocs(
        this.query(
          this.collection(this.db, 'hourlyReports'),
          this.where('ymd', '==', today),
          this.where('category', '==', 'layering')
        )
      );
      
      const userProductivity = new Map();
      const TARGET_SEC = 3600;
      
      reportsSnapshot.forEach(doc => {
        const reportData = doc.data();
        const userId = reportData.userId;
        const reportedSec = Number(reportData.reportedSec || 0);
        
        if (!userProductivity.has(userId)) {
          userProductivity.set(userId, {
            totalSec: 0,
            reportCount: 0
          });
        }
        
        const current = userProductivity.get(userId);
        current.totalSec += reportedSec;
        current.reportCount += 1;
        userProductivity.set(userId, current);
      });
      
      const data = [];
      
      for (const [userId, user] of users) {
        const productivity = userProductivity.get(userId);
        let productivityPercent = 0;
        
        if (productivity && productivity.totalSec > 0) {
          productivityPercent = Math.min((productivity.totalSec / TARGET_SEC) * 100, 100);
        }
        
        if (productivityPercent > 0) {
          data.push({
            userId: userId,
            name: user.name,
            productivity: Math.round(productivityPercent * 10) / 10,
            rawValue: productivity.totalSec,
            target: TARGET_SEC,
            reportCount: productivity.reportCount,
            lastUpdate: new Date()
          });
        }
      }
      
      console.log('Fallback layering data:', data);
      return data;
    } catch (error) {
      console.warn('Fallback layering data fetch failed:', error);
      return [];
    }
  }
  
  async fetchUsersProductivity() {
    try {
      const snapshot = await this.getDocs(this.collection(this.db, 'users'));
      
      const data = [];
      snapshot.forEach(doc => {
        const docData = doc.data();
        const productivity = docData.productivity || 0;
        
        if (productivity >= 0) {
          data.push({
            userId: doc.id,
            name: docData.displayName || docData.email?.split('@')[0] || 'User',
            productivity: productivity
          });
        }
      });
      
      console.log('Users productivity data:', data);
      return data;
    } catch (error) {
      console.warn('Error fetching users productivity:', error);
      return [];
    }
  }
  
  getYMD(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  
  getColorIntensity(productivity) {
    // Cap productivity at 100% and scale color intensity accordingly
    const cappedProductivity = Math.min(productivity, 100);
    const baseColor = '#7d20a4';
    
    if (cappedProductivity <= 40) {
      return `${baseColor}80`; // Light (50% opacity)
    } else if (cappedProductivity <= 70) {
      return `${baseColor}CC`; // Moderate (80% opacity)
    } else {
      return baseColor; // Deep (100% opacity)
    }
  }
  
  renderChart() {
    if (!this.container || this.chartData.length === 0) return;
    
    let html = '<div class="productivity-chart">';
    
    this.chartData.forEach(user => {
      // Cap productivity display at 100% and scale height accordingly
      const displayProductivity = Math.min(user.productivity, 100);
      const height = Math.max((displayProductivity / 100) * 250, 20); // Scale to 100% max
      const color = this.getColorIntensity(user.productivity);
      const displayName = this.truncateName(user.name);
      
      html += `
        <div class="productivity-bar" 
             style="height: ${height}px; background: linear-gradient(135deg, ${color}, ${color}90);"
             onclick="window.productivityChart?.showUserDetails('${user.userId}', '${user.name}', ${displayProductivity})"
             title="${user.name}: ${displayProductivity}%">
          <div class="productivity-bar-label">
            ${user.name}: ${displayProductivity}%<br>
            <small>Last updated: ${this.formatTime(this.lastUpdateTime)}</small>
          </div>
          <div class="productivity-bar-name">${displayName}</div>
        </div>
      `;
    });
    
    html += '</div>';
    
    this.container.innerHTML = html;
  }
  
  truncateName(name) {
    if (!name) return 'User';
    if (name.length <= 8) return name;
    return name.substring(0, 7) + '...';
  }
  
  showUserDetails(userId, name, productivity) {
    const message = `User: ${name}\nProductivity: ${productivity}%\nLast Updated: ${this.formatTime(this.lastUpdateTime)}`;
    alert(message);
  }
  
  showLoading() {
    if (this.container) {
      this.container.innerHTML = '<div class="chart-loading">Loading productivity data...</div>';
    }
  }
  
  showError(message) {
    if (this.container) {
      this.container.innerHTML = `<div class="chart-error">${message}</div>`;
    }
  }
  
  showNoData() {
    if (this.container) {
      const debugInfo = this.metric === 'layering' ? 
        '<div class="chart-debug">Debug: Checking API at http://localhost:3001/api/layering-productivity<br>Looking for hourlyReports with category="layering" for today</div>' : '';
      this.container.innerHTML = `<div class="chart-no-data">No ${this.metric} productivity data available</div>${debugInfo}`;
    }
  }
  
  updateLastUpdateTime() {
    const lastUpdateEl = document.getElementById('chartLastUpdate');
    if (lastUpdateEl && this.lastUpdateTime) {
      lastUpdateEl.textContent = `Last updated: ${this.formatTime(this.lastUpdateTime)}`;
    }
  }
  
  formatTime(date) {
    if (!date) return '—';
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  
  startLiveUpdates() {
    console.log('ProductivityChart: Starting live updates (60s interval)');
    
    // Clear existing interval
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
    
    // Update every 60 seconds
    this.updateInterval = setInterval(() => {
      if (this.isVisible) {
        this.fetchData();
      }
    }, 60000);
  }
  
  stopLiveUpdates() {
    console.log('ProductivityChart: Stopping live updates');
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }
  
  setVisibility(visible) {
    this.isVisible = visible;
    if (visible && !this.updateInterval) {
      this.startLiveUpdates();
    } else if (!visible && this.updateInterval) {
      this.stopLiveUpdates();
    }
  }
  
  render() {
    if (!this.container) return;
    this.container.innerHTML = '<div class="chart-loading">Initializing chart...</div>';
  }
  
  destroy() {
    console.log('ProductivityChart: Destroying...');
    this.stopLiveUpdates();
    
    // Also destroy layering chart if it exists
    if (window.destroyLayeringProductivityChart) {
      window.destroyLayeringProductivityChart();
    }
    
    if (this.container) {
      this.container.innerHTML = '';
    }
    
    // Remove styles
    const styleEl = document.getElementById('productivity-chart-styles');
    if (styleEl) {
      styleEl.remove();
    }
  }
  
  // Manual refresh method
  refresh() {
    console.log('ProductivityChart: Manual refresh triggered');
    this.fetchData();
  }
}

// Global initialization function
function initProductivityChart() {
  try {
    console.log('Initializing ProductivityChart...');
    
    // Wait for container to be available
    const container = document.getElementById('productivityChartContainer');
    if (!container) {
      console.warn('ProductivityChart container not found, retrying...');
      setTimeout(initProductivityChart, 1000);
      return;
    }
    
    // Wait for Firebase to be available
    if (!window.firebaseExports?.db) {
      console.warn('Firebase not available, retrying...');
      setTimeout(initProductivityChart, 1000);
      return;
    }
    
    // Create chart instance
    if (window.productivityChart) {
      window.productivityChart.destroy();
    }
    
    window.productivityChart = new ProductivityChart('productivityChartContainer');
    window.productivityChart.startLiveUpdates();
    window.productivityChart.setVisibility(true);
    
    console.log('ProductivityChart initialized successfully');
    
  } catch (error) {
    console.error('Failed to initialize ProductivityChart:', error);
  }
}

// Cleanup function
function cleanupProductivityChart() {
  try {
    if (window.productivityChart) {
      window.productivityChart.destroy();
      window.productivityChart = null;
    }
  } catch (error) {
    console.warn('Error during ProductivityChart cleanup:', error);
  }
}

// Export for global access
window.ProductivityChart = ProductivityChart;
window.initProductivityChart = initProductivityChart;
window.cleanupProductivityChart = cleanupProductivityChart;

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(initProductivityChart, 2000);
  });
} else {
  setTimeout(initProductivityChart, 2000);
}

console.log('ProductivityChart module loaded');