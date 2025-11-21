const express = require('express');
const admin = require('firebase-admin');
const router = express.Router();

// Initialize Firebase Admin if not already done
if (!admin.apps.length) {
  const serviceAccount = require('./firebase-service-key.json');
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

// Simple auth check - in production, use proper JWT validation
const requireAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  // In production, validate the actual token here
  req.user = { uid: 'authenticated-user' }; // Mock user for now
  next();
};

// Set no-cache headers
const setNoCacheHeaders = (res) => {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Surrogate-Control': 'no-store'
  });
};

// GET /api/productivity/layering - New endpoint with auth and query params
router.get('/', requireAuth, async (req, res) => {
  const requestId = Math.random().toString(36).substr(2, 9);
  const startTime = Date.now();
  
  // Set CORS and no-cache headers
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  setNoCacheHeaders(res);
  
  const { from, to, team, limit = 1000 } = req.query;
  
  // Validate dates if provided
  let fromDate, toDate;
  if (from) {
    fromDate = new Date(from);
    if (isNaN(fromDate.getTime())) {
      return res.status(400).json({ error: 'Invalid from date' });
    }
  }
  if (to) {
    toDate = new Date(to);
    if (isNaN(toDate.getTime())) {
      return res.status(400).json({ error: 'Invalid to date' });
    }
  }
  
  // Default to today if no dates provided
  const today = new Date().toISOString().split('T')[0];
  const queryDate = from ? fromDate.toISOString().split('T')[0] : today;
  try {
    
    // Get all users
    const usersSnapshot = await db.collection('users').get();
    const users = new Map();
    usersSnapshot.forEach(doc => {
      const userData = doc.data();
      users.set(doc.id, {
        userId: doc.id,
        name: userData.displayName || userData.email?.split('@')[0] || 'User'
      });
    });
    
    // Get layering hourly reports for the specified date
    let reportsQuery = db.collection('hourlyReports')
      .where('ymd', '==', queryDate)
      .where('category', '==', 'layering');
    
    // Apply team filter if provided
    if (team) {
      reportsQuery = reportsQuery.where('team', '==', team);
    }
    
    const reportsSnapshot = await reportsQuery.get();
    
    const userProductivity = new Map();
    
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
    
    const TARGET_SEC = 3600; // 1 hour target
    const data = [];
    
    for (const [userId, user] of users) {
      const productivity = userProductivity.get(userId);
      let productivityPercent = 0;
      
      if (productivity && productivity.totalSec > 0) {
        productivityPercent = Math.min((productivity.totalSec / TARGET_SEC) * 100, 100);
        
        data.push({
          userId: userId,
          name: user.name,
          productivity: Math.round(productivityPercent * 10) / 10,
          rawValue: productivity.totalSec,
          target: TARGET_SEC,
          reportCount: productivity.reportCount,
          lastUpdate: new Date().toISOString()
        });
      }
    }
    
    console.log(`[${requestId}] Found ${data.length} users with layering productivity data`);
    
    // Sort by layering_percent descending
    data.sort((a, b) => b.layering_percent - a.layering_percent);
    
    // Apply limit
    const limitedData = data.slice(0, parseInt(limit));
    
    // Log request details
    const processingTime = Date.now() - startTime;
    console.log(`[${requestId}] Request processed: user=${req.user?.uid || 'unknown'}, rows=${limitedData.length}, time_window=${queryDate}, processing_time=${processingTime}ms`);
    
    // Return array format as specified
    res.json(limitedData.map(item => ({
      user_id: item.userId,
      name: item.name,
      avatar_url: item.avatar_url || null,
      layering_percent: Math.round(item.productivity * 10) / 10, // Normalize to 0-100
      layering_seconds: item.rawValue,
      jobs_count: item.reportCount,
      last_updated: item.lastUpdate
    })));
    
  } catch (error) {
    console.error(`[${requestId}] Error fetching layering productivity:`, error);
    res.status(500).json({
      error: 'Failed to fetch layering productivity data',
      message: error.message
    });
  }
});

// Simple auth check for SSE (supports query param)
const requireAuthSSE = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const tokenParam = req.query.token;
  
  if ((!authHeader || !authHeader.startsWith('Bearer ')) && !tokenParam) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  req.user = { uid: 'authenticated-user' };
  next();
};

// GET /api/productivity/layering/stream - SSE endpoint for live updates
router.get('/stream', requireAuthSSE, (req, res) => {
  const requestId = Math.random().toString(36).substr(2, 9);
  console.log(`[${requestId}] SSE connection established`);
  
  // Set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control'
  });
  
  // Send initial connection event
  res.write(`data: ${JSON.stringify({ type: 'connected', timestamp: new Date().toISOString() })}\n\n`);
  
  // Set up heartbeat
  const heartbeat = setInterval(() => {
    res.write(`data: ${JSON.stringify({ type: 'heartbeat', timestamp: new Date().toISOString() })}\n\n`);
  }, 25000);
  
  // Listen for changes in hourlyReports collection
  const unsubscribe = db.collection('hourlyReports')
    .where('category', '==', 'layering')
    .onSnapshot((snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added' || change.type === 'modified') {
          const data = change.doc.data();
          const userId = data.userId;
          const reportedSec = Number(data.reportedSec || 0);
          const TARGET_SEC = 3600;
          const productivity = Math.min((reportedSec / TARGET_SEC) * 100, 100);
          
          // Send update event
          const updatePayload = {
            type: 'update',
            user_id: userId,
            name: data.displayName || data.userName || userId,
            avatar_url: null,
            layering_percent: Math.round(productivity * 10) / 10,
            layering_seconds: reportedSec,
            jobs_count: 1,
            last_updated: new Date().toISOString()
          };
          
          res.write(`data: ${JSON.stringify(updatePayload)}\n\n`);
        }
      });
    }, (error) => {
      console.error(`[${requestId}] SSE error:`, error);
      res.write(`data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`);
    });
  
  // Handle client disconnect
  req.on('close', () => {
    console.log(`[${requestId}] SSE connection closed`);
    clearInterval(heartbeat);
    unsubscribe();
  });
  
  req.on('error', (error) => {
    console.error(`[${requestId}] SSE connection error:`, error);
    clearInterval(heartbeat);
    unsubscribe();
  });
});

// Legacy endpoint for backward compatibility
router.get('/legacy', async (req, res) => {
  // Set CORS headers
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  try {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    
    // Get all users
    const usersSnapshot = await db.collection('users').get();
    const users = new Map();
    usersSnapshot.forEach(doc => {
      const userData = doc.data();
      users.set(doc.id, {
        userId: doc.id,
        name: userData.displayName || userData.email?.split('@')[0] || 'User'
      });
    });
    
    // Get layering hourly reports for today
    const reportsSnapshot = await db.collection('hourlyReports')
      .where('ymd', '==', today)
      .where('category', '==', 'layering')
      .get();
    
    const userProductivity = new Map();
    
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
    
    const TARGET_SEC = 3600; // 1 hour target
    const data = [];
    
    for (const [userId, user] of users) {
      const productivity = userProductivity.get(userId);
      let productivityPercent = 0;
      
      if (productivity && productivity.totalSec > 0) {
        productivityPercent = Math.min((productivity.totalSec / TARGET_SEC) * 100, 100);
        
        data.push({
          userId: userId,
          name: user.name,
          productivity: Math.round(productivityPercent * 10) / 10,
          rawValue: productivity.totalSec,
          target: TARGET_SEC,
          reportCount: productivity.reportCount,
          lastUpdate: new Date().toISOString()
        });
      }
    }
    
    console.log(`Found ${data.length} users with layering productivity data`);
    
    // Sort by productivity (highest first)
    data.sort((a, b) => b.productivity - a.productivity);
    
    res.json({
      success: true,
      data: data,
      timestamp: new Date().toISOString(),
      count: data.length,
      message: data.length === 0 ? 'No layering productivity data found for today' : `Found ${data.length} users with layering data`
    });
    
  } catch (error) {
    console.error('Error fetching layering productivity:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch layering productivity data',
      message: error.message
    });
  }
});

module.exports = router;