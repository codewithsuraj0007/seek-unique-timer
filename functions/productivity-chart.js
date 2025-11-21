// functions/productivity-chart.js
const admin = require('firebase-admin');

// Initialize Firebase Admin if not already done
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

// Test email domains to exclude
const TEST_DOMAINS = ['@example.com', '@test.com', '@dummy.com'];
const LAST_LOGIN_THRESHOLD_DAYS = 180;

/**
 * Aggregates productivity data for real, active company users
 * @param {Object} filters - Date and segment filters
 * @returns {Array} Array of user productivity data
 */
async function aggregateProductivityData(filters = {}) {
  const { date = new Date().toISOString().split('T')[0], companyId } = filters;
  
  try {
    // Get all users for the company
    const usersQuery = db.collection('users');
    const usersSnapshot = await usersQuery.get();
    
    const realUsers = [];
    const now = Date.now();
    const thresholdMs = now - (LAST_LOGIN_THRESHOLD_DAYS * 24 * 60 * 60 * 1000);
    
    // Filter for real, active users
    usersSnapshot.forEach(doc => {
      const userData = doc.data();
      const userId = doc.id;
      
      // Apply real user filters
      if (
        userData.is_active !== false &&
        userData.is_dummy !== true &&
        userData.role !== 'test' &&
        !TEST_DOMAINS.some(domain => (userData.email || '').includes(domain)) &&
        userData.account_verified !== false &&
        (userData.last_login ? new Date(userData.last_login.toDate()).getTime() > thresholdMs : true)
      ) {
        realUsers.push({
          userId,
          displayName: userData.displayName || userData.name || userId,
          email: userData.email
        });
      }
    });

    // Get hourly reports for the specified date
    const hourlyReportsQuery = db.collection('hourlyReports')
      .where('ymd', '==', date);
    
    const hourlySnapshot = await hourlyReportsQuery.get();
    
    // Group reports by user and calculate weighted average productivity
    const userProductivity = new Map();
    
    hourlySnapshot.forEach(doc => {
      const reportData = doc.data();
      
      // Skip test entries
      if (reportData.is_test || reportData.manual_test_entry) {
        return;
      }
      
      const userId = reportData.userId;
      const productivity = Number(reportData.productivity) || 0;
      const duration = Number(reportData.duration) || Number(reportData.reportedSec) || 3600; // Default 1 hour
      
      // Only include real users
      if (!realUsers.find(u => u.userId === userId)) {
        return;
      }
      
      if (!userProductivity.has(userId)) {
        userProductivity.set(userId, {
          totalWeightedProductivity: 0,
          totalDuration: 0,
          reportCount: 0,
          lastReportedAt: null
        });
      }
      
      const userStats = userProductivity.get(userId);
      userStats.totalWeightedProductivity += productivity * duration;
      userStats.totalDuration += duration;
      userStats.reportCount += 1;
      
      // Track last reported time
      const reportTime = reportData.createdAt?.toDate?.() || new Date();
      if (!userStats.lastReportedAt || reportTime > userStats.lastReportedAt) {
        userStats.lastReportedAt = reportTime;
      }
    });
    
    // Calculate final aggregated productivity for each user
    const result = [];
    
    realUsers.forEach(user => {
      const stats = userProductivity.get(user.userId);
      let aggregatedProductivity = 0;
      
      if (stats && stats.totalDuration > 0) {
        // Weighted average productivity
        aggregatedProductivity = stats.totalWeightedProductivity / stats.totalDuration;
      }
      
      result.push({
        user_id: user.userId,
        display_name: user.displayName,
        aggregated_productivity_percent: Math.round(aggregatedProductivity * 10) / 10, // 1 decimal place
        last_reported_at: stats?.lastReportedAt?.toISOString() || null,
        report_count: stats?.reportCount || 0
      });
    });
    
    // Sort by productivity descending
    result.sort((a, b) => b.aggregated_productivity_percent - a.aggregated_productivity_percent);
    
    return result;
    
  } catch (error) {
    console.error('Error aggregating productivity data:', error);
    throw error;
  }
}

/**
 * Cloud Function endpoint for productivity chart data
 */
exports.getProductivityChartData = async (req, res) => {
  // CORS headers
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  
  try {
    // Verify admin authorization
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await admin.auth().verifyIdToken(token);
    
    // Check if user is admin (you may need to adjust this based on your admin logic)
    const adminEmails = ['teamseekunique@gmail.com']; // From your existing code
    if (!adminEmails.includes(decodedToken.email)) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    // Extract filters from query parameters
    const filters = {
      date: req.query.date || new Date().toISOString().split('T')[0],
      companyId: req.query.companyId,
      limit: parseInt(req.query.limit) || null
    };
    
    const productivityData = await aggregateProductivityData(filters);
    
    // Apply limit if specified
    const limitedData = filters.limit ? productivityData.slice(0, filters.limit) : productivityData;
    
    res.json({
      success: true,
      data: limitedData,
      metadata: {
        date: filters.date,
        total_users: limitedData.length,
        generated_at: new Date().toISOString()
      }
    });
    
  } catch (error) {
    console.error('Productivity chart endpoint error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
};

module.exports = { aggregateProductivityData };