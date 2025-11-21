const functions = require('firebase-functions');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');

admin.initializeApp();
const db = admin.firestore();

// Configure SMTP via environment variables or Firebase functions config
const SMTP_HOST = process.env.SMTP_HOST || functions.config().smtp?.host;
const SMTP_PORT = process.env.SMTP_PORT || functions.config().smtp?.port || 587;
const SMTP_USER = process.env.SMTP_USER || functions.config().smtp?.user;
const SMTP_PASS = process.env.SMTP_PASS || functions.config().smtp?.pass;

if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
  console.warn('SMTP is not fully configured. Set smtp.host, smtp.user and smtp.pass via functions config or env.');
}

const transporter = nodemailer.createTransporter({
  host: SMTP_HOST,
  port: Number(SMTP_PORT) || 587,
  secure: Number(SMTP_PORT) === 465, // true for 465, false for other ports
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASS
  }
});

exports.sendOutgoingEmail = functions.firestore
  .document('outgoingEmails/{emailId}')
  .onCreate(async (snap, context) => {
    const data = snap.data();
    if (!data) return null;

    const id = context.params.emailId;

    // Compose email
    const to = data.to;
    const subject = data.subject || `Notification`;
    const body = data.body || '';

    try{
      // Send email via SMTP
      await transporter.sendMail({ from: SMTP_USER, to, subject, text: body });

      // mark sent
      await snap.ref.update({ status: 'sent', sentAt: admin.firestore.FieldValue.serverTimestamp() });
      console.log('Email sent for', id);
    }catch(err){
      console.error('Failed to send email', err);
      await snap.ref.update({ status: 'failed', error: String(err), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    }

    return null;
  });

// Import productivity chart functions
const { getProductivityChartData } = require('./productivity-chart');

// Cache for trimming comparison data (30-60 seconds TTL)
let trimmingComparisonCache = {
  data: null,
  timestamp: 0,
  ttl: 45000 // 45 seconds
};

// Productivity chart endpoint
exports.getProductivityChartData = getProductivityChartData;

// Read-only endpoint for trimming comparison data
exports.getTrimmingComparison = functions.https.onRequest(async (req, res) => {
  // CORS headers
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.status(200).send('');
    return;
  }
  
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const now = Date.now();
    
    // Check cache first
    if (trimmingComparisonCache.data && 
        (now - trimmingComparisonCache.timestamp) < trimmingComparisonCache.ttl) {
      res.json(trimmingComparisonCache.data);
      return;
    }

    // Get date parameter or use today
    const dateParam = req.query.date;
    const targetDate = dateParam || new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    
    // Limit parameter (default 30, max 50)
    const limit = Math.min(parseInt(req.query.limit) || 30, 50);

    console.log(`Fetching trimming comparison for date: ${targetDate}, limit: ${limit}`);

    // Query hourly reports for trimming category on the target date
    const hourlyReportsRef = db.collection('hourlyReports');
    const snapshot = await hourlyReportsRef
      .where('ymd', '==', targetDate)
      .where('category', '==', 'trimming')
      .get();

    console.log(`Found ${snapshot.size} trimming reports for ${targetDate}`);

    // Aggregate by user
    const userTrimmingMap = new Map();
    const userNamesMap = new Map();

    snapshot.forEach(doc => {
      const data = doc.data();
      const userId = data.userId;
      const reportedSec = Number(data.reportedSec || 0);
      
      if (userId && reportedSec > 0) {
        const current = userTrimmingMap.get(userId) || 0;
        userTrimmingMap.set(userId, current + reportedSec);
      }
    });

    console.log(`Aggregated data for ${userTrimmingMap.size} users`);

    // Get user display names
    if (userTrimmingMap.size > 0) {
      const userIds = Array.from(userTrimmingMap.keys());
      const usersSnapshot = await db.collection('users')
        .where(admin.firestore.FieldPath.documentId(), 'in', userIds.slice(0, 10)) // Firestore 'in' limit
        .get();
      
      usersSnapshot.forEach(doc => {
        const userData = doc.data();
        const displayName = userData.displayName || userData.email || doc.id;
        userNamesMap.set(doc.id, displayName);
      });

      // Handle remaining users if more than 10
      if (userIds.length > 10) {
        for (let i = 10; i < userIds.length; i += 10) {
          const batch = userIds.slice(i, i + 10);
          const batchSnapshot = await db.collection('users')
            .where(admin.firestore.FieldPath.documentId(), 'in', batch)
            .get();
          
          batchSnapshot.forEach(doc => {
            const userData = doc.data();
            const displayName = userData.displayName || userData.email || doc.id;
            userNamesMap.set(doc.id, displayName);
          });
        }
      }
    }

    // Convert to array and sort by trimming time (descending)
    const userTrimmingArray = Array.from(userTrimmingMap.entries())
      .map(([userId, seconds]) => ({
        userId,
        name: userNamesMap.get(userId) || `User ${userId.slice(-4)}`,
        grandTrimmingSeconds: seconds
      }))
      .sort((a, b) => b.grandTrimmingSeconds - a.grandTrimmingSeconds)
      .slice(0, limit);

    // Calculate max for normalization
    const maxTrimmingSeconds = userTrimmingArray.length > 0 
      ? userTrimmingArray[0].grandTrimmingSeconds 
      : 0;

    // Prepare response
    const responseData = {
      date: targetDate,
      users: userTrimmingArray,
      maxTrimmingSeconds,
      totalUsers: userTrimmingArray.length,
      generatedAt: new Date().toISOString()
    };

    // Cache the response
    trimmingComparisonCache = {
      data: responseData,
      timestamp: now,
      ttl: 45000
    };

    console.log(`Returning ${userTrimmingArray.length} users with max trimming: ${maxTrimmingSeconds}s`);
    
    res.json(responseData);

  } catch (error) {
    console.error('Error in getTrimmingComparison:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
});