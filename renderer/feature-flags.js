// renderer/feature-flags.js
// Feature flag management for staged rollout

class FeatureFlags {
  constructor() {
    this.flags = {
      PRODUCTIVITY_CHART: {
        enabled: true,
        rolloutPercentage: 100, // 0-100
        adminOnly: true,
        description: 'Live productivity comparison chart in Tools section'
      }
    };
    
    this.init();
  }
  
  init() {
    // Load flags from localStorage if available
    const savedFlags = localStorage.getItem('FEATURE_FLAGS');
    if (savedFlags) {
      try {
        const parsed = JSON.parse(savedFlags);
        this.flags = { ...this.flags, ...parsed };
      } catch (e) {
        console.warn('Failed to parse saved feature flags:', e);
      }
    }
    
    // Expose to window for debugging
    window.FEATURE_FLAGS = this.flags;
  }
  
  isEnabled(flagName, userContext = {}) {
    const flag = this.flags[flagName];
    if (!flag) return false;
    
    // Check if flag is globally disabled
    if (!flag.enabled) return false;
    
    // Check admin-only restriction
    if (flag.adminOnly && !userContext.isAdmin) return false;
    
    // Check rollout percentage
    if (flag.rolloutPercentage < 100) {
      const userId = userContext.userId || 'anonymous';
      const hash = this.hashUserId(userId);
      const userPercentile = hash % 100;
      if (userPercentile >= flag.rolloutPercentage) return false;
    }
    
    return true;
  }
  
  enable(flagName) {
    if (this.flags[flagName]) {
      this.flags[flagName].enabled = true;
      this.save();
    }
  }
  
  disable(flagName) {
    if (this.flags[flagName]) {
      this.flags[flagName].enabled = false;
      this.save();
    }
  }
  
  setRolloutPercentage(flagName, percentage) {
    if (this.flags[flagName]) {
      this.flags[flagName].rolloutPercentage = Math.max(0, Math.min(100, percentage));
      this.save();
    }
  }
  
  save() {
    localStorage.setItem('FEATURE_FLAGS', JSON.stringify(this.flags));
    window.FEATURE_FLAGS = this.flags;
  }
  
  // Simple hash function for consistent user bucketing
  hashUserId(userId) {
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      const char = userId.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }
  
  // Admin interface methods
  getAllFlags() {
    return { ...this.flags };
  }
  
  getFlagStatus(flagName) {
    return this.flags[flagName] || null;
  }
  
  // Reset to defaults
  reset() {
    localStorage.removeItem('FEATURE_FLAGS');
    this.init();
  }
}

// Initialize feature flags
const featureFlags = new FeatureFlags();

// Export for use in other modules
export default featureFlags;

// Also expose globally for console debugging
window.featureFlags = featureFlags;

// Admin helper functions
window.enableProductivityChart = () => {
  featureFlags.enable('PRODUCTIVITY_CHART');
  console.log('Productivity chart enabled');
};

window.disableProductivityChart = () => {
  featureFlags.disable('PRODUCTIVITY_CHART');
  console.log('Productivity chart disabled');
};

window.setProductivityChartRollout = (percentage) => {
  featureFlags.setRolloutPercentage('PRODUCTIVITY_CHART', percentage);
  console.log(`Productivity chart rollout set to ${percentage}%`);
};