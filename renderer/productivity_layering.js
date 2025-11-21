// renderer/productivity_layering.js
// Layering Productivity Chart - Reads from console logs

class LayeringProductivityChart {
  constructor(options = {}) {
    this.container = options.containerEl;
    this.updateInterval = null;
    this.chartData = [];
    this.lastUpdateTime = null;
    
    if (!this.container) {
      console.warn('LayeringProductivityChart: Container not found');
      return;
    }
    
    this.init();
  }
  
  init() {
    console.log('LayeringProductivityChart: Initializing...');
    this.render();
    this.fetchData();
    this.startLiveUpdates();
  }
  
  async fetchData() {
    try {
      console.log('LayeringProductivityChart: Fetching data...');
      this.showLoading();
      
      const db = window.firebaseExports?.db;
      const collection = window.firebaseExports?.collection;
      const getDocs = window.firebaseExports?.getDocs;
      const query = window.firebaseExports?.query;
      const where = window.firebaseExports?.where;
      
      console.log('Firebase exports check:', { db: !!db, collection: !!collection, getDocs: !!getDocs, query: !!query, where: !!where });
      
      if (!db || !collection || !getDocs || !query || !where) {
        console.error('Missing Firebase exports');
        this.showError('Firebase not available');
        return;
      }
      
      const today = this.getYMD(new Date());
      console.log('Fetching for date:', today);
      
      // Get all users
      console.log('Fetching users...');
      const usersSnapshot = await getDocs(collection(db, 'users'));
      console.log('Users found:', usersSnapshot.size);
      
      const users = new Map();
      usersSnapshot.forEach(doc => {
        const userData = doc.data();
        users.set(doc.id, {
          userId: doc.id,
          name: userData.displayName || userData.email?.split('@')[0] || 'User'
        });
      });
      
      // Get all hourly reports for today
      console.log('Fetching hourly reports...');
      const reportsSnapshot = await getDocs(
        query(
          collection(db, 'hourlyReports'),
          where('ymd', '==', today)
        )
      );
      console.log('Hourly reports found:', reportsSnapshot.size);
      
      const userProductivity = new Map();
      const TARGET_SEC = 3600;
      
      reportsSnapshot.forEach(doc => {
        const reportData = doc.data();
        const category = (reportData.category || '').toLowerCase();
        
        // Filter for layering only
        if (category !== 'layering') return;
        
        const userId = reportData.userId;
        const reportedSec = Number(reportData.reportedSec || 0);
        console.log('Layering report:', { userId, reportedSec, category });
        
        if (!userProductivity.has(userId)) {
          userProductivity.set(userId, 0);
        }
        userProductivity.set(userId, userProductivity.get(userId) + reportedSec);
      });
      
      const data = [];
      for (const [userId, totalSec] of userProductivity) {
        const user = users.get(userId);
        if (user && totalSec > 0) {
          const productivityPercent = Math.min((totalSec / TARGET_SEC) * 100, 100);
          data.push({
            userId: userId,
            name: user.name,
            productivity: Math.round(productivityPercent * 10) / 10
          });
        }
      }
      
      console.log('Processed data:', data);
      
      if (data.length === 0) {
        this.showNoData();
        return;
      }
      
      data.sort((a, b) => b.productivity - a.productivity);
      this.chartData = data.slice(0, 20);
      this.lastUpdateTime = new Date();
      this.renderChart();
      this.updateLastUpdateTime();
      
      console.log('LayeringProductivityChart: Data loaded', this.chartData);
    } catch (error) {
      console.error('LayeringProductivityChart: Detailed error:', error);
      console.error('Error stack:', error.stack);
      this.showError('Failed to load data: ' + error.message);
    }
  }
  
  getYMD(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  
  renderChart() {
    if (!this.container || this.chartData.length === 0) return;
    
    let html = '<div class="productivity-chart">';
    
    this.chartData.forEach(user => {
      const displayProductivity = Math.min(user.productivity, 100);
      const height = Math.max((displayProductivity / 100) * 250, 20);
      const color = this.getColorIntensity(user.productivity);
      const displayName = this.truncateName(user.name);
      
      html += `
        <div class="productivity-bar" 
             style="height: ${height}px; background: linear-gradient(135deg, ${color}, ${color}90);"
             title="${user.name}: ${displayProductivity}%">
          <div class="productivity-bar-label">
            ${user.name}: ${displayProductivity}%
          </div>
          <div class="productivity-bar-name">${displayName}</div>
        </div>
      `;
    });
    
    html += '</div>';
    this.container.innerHTML = html;
  }
  
  getColorIntensity(productivity) {
    const capped = Math.min(productivity, 100);
    if (capped <= 40) return '#4f46e580';
    if (capped <= 70) return '#4f46e5CC';
    return '#4f46e5';
  }
  
  truncateName(name) {
    if (!name) return 'User';
    if (name.length <= 8) return name;
    return name.substring(0, 7) + '...';
  }
  
  showLoading() {
    if (this.container) {
      this.container.innerHTML = '<div class="chart-loading">Loading layering productivity data...</div>';
    }
  }
  
  showError(message) {
    if (this.container) {
      this.container.innerHTML = `<div class="chart-error">${message}</div>`;
    }
  }
  
  showNoData() {
    if (this.container) {
      this.container.innerHTML = '<div class="chart-no-data">No layering productivity data available</div>';
    }
  }
  
  updateLastUpdateTime() {
    const el = document.getElementById('chartLastUpdate');
    if (el && this.lastUpdateTime) {
      el.textContent = `Last updated: ${this.formatTime(this.lastUpdateTime)}`;
    }
  }
  
  formatTime(date) {
    if (!date) return '—';
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  
  startLiveUpdates() {
    if (this.updateInterval) clearInterval(this.updateInterval);
    this.updateInterval = setInterval(() => this.fetchData(), 60000);
  }
  
  stopLiveUpdates() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }
  
  render() {
    if (this.container) {
      this.container.innerHTML = '<div class="chart-loading">Initializing...</div>';
    }
  }
  
  destroy() {
    this.stopLiveUpdates();
    if (this.container) {
      this.container.innerHTML = '';
    }
  }
}

let layeringProductivityChart = null;

function initLayeringProductivityChart(options = {}) {
  try {
    console.log('Initializing LayeringProductivityChart...');
    
    if (layeringProductivityChart) {
      layeringProductivityChart.destroy();
    }
    
    layeringProductivityChart = new LayeringProductivityChart(options);
    window.layeringProductivityChart = layeringProductivityChart;
    
    console.log('LayeringProductivityChart initialized');
  } catch (error) {
    console.error('Failed to initialize LayeringProductivityChart:', error);
  }
}

function destroyLayeringProductivityChart() {
  try {
    if (layeringProductivityChart) {
      layeringProductivityChart.destroy();
      layeringProductivityChart = null;
    }
    if (window.layeringProductivityChart) {
      window.layeringProductivityChart = null;
    }
  } catch (error) {
    console.warn('Error destroying LayeringProductivityChart:', error);
  }
}

window.LayeringProductivityChart = LayeringProductivityChart;
window.initLayeringProductivityChart = initLayeringProductivityChart;
window.destroyLayeringProductivityChart = destroyLayeringProductivityChart;

console.log('LayeringProductivityChart module loaded');
