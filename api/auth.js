// api/auth.js - Simple authentication API endpoints
const express = require('express');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const rateLimit = require('express-rate-limit');

const router = express.Router();

// Rate limiting
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 requests per windowMs
  message: 'Too many authentication attempts, please try again later.'
});

const otpLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 3, // limit each IP to 3 OTP requests per windowMs
  message: 'Too many OTP requests, please try again later.'
});

// In-memory storage for demo (use proper database in production)
const users = new Map();
const otpStore = new Map();

// Email configuration (configure with your SMTP settings)
const transporter = nodemailer.createTransporter({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: process.env.SMTP_PORT || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

// Helper functions
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function hashPassword(password) {
  return await bcrypt.hash(password, 12);
}

async function hashPin(pin) {
  return await bcrypt.hash(pin, 12);
}

async function verifyPassword(password, hash) {
  return await bcrypt.compare(password, hash);
}

async function verifyPin(pin, hash) {
  return await bcrypt.compare(pin, hash);
}

async function sendOTPEmail(email, otp) {
  // Skip email sending if SMTP not configured, just log for testing
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.log(`📧 OTP for ${email}: ${otp} (SMTP not configured - check console)`);
    return;
  }

  const mailOptions = {
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: email,
    subject: 'Your Seek Unique Timer OTP',
    html: `
      <h2>Verification Code</h2>
      <p>Your OTP for Seek Unique Timer is: <strong>${otp}</strong></p>
      <p>This code will expire in 10 minutes.</p>
      <p>If you didn't request this code, please ignore this email.</p>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`📧 OTP sent to ${email}`);
  } catch (error) {
    console.error('Email send failed:', error.message);
    console.log(`📧 Fallback - OTP for ${email}: ${otp}`);
  }
}

// Routes

// POST /auth/check-email - Check if email exists and has PIN
router.post('/check-email', authLimiter, (req, res) => {
  const { email } = req.body;
  
  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  const user = users.get(email.toLowerCase());
  
  res.json({
    exists: !!user,
    hasPIN: !!(user && user.pin_created)
  });
});

// POST /auth/send-otp - Send OTP to email
router.post('/send-otp', otpLimiter, async (req, res) => {
  const { email } = req.body;
  
  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  // Check if email already exists with PIN
  const existingUser = users.get(email.toLowerCase());
  if (existingUser && existingUser.pin_created) {
    return res.status(400).json({ error: 'Email registered — please Login.' });
  }

  try {
    const otp = generateOTP();
    const expires = Date.now() + 10 * 60 * 1000; // 10 minutes
    
    // Store OTP
    otpStore.set(email.toLowerCase(), { otp, expires });
    
    // Send email
    await sendOTPEmail(email, otp);
    
    res.json({ success: true, message: 'OTP sent successfully' });
  } catch (error) {
    console.error('Send OTP error:', error);
    res.status(500).json({ error: 'Failed to send OTP' });
  }
});

// POST /auth/verify-otp - Verify OTP
router.post('/verify-otp', authLimiter, (req, res) => {
  const { email, otp } = req.body;
  
  if (!email || !otp) {
    return res.status(400).json({ error: 'Email and OTP are required' });
  }

  const storedOTP = otpStore.get(email.toLowerCase());
  
  if (!storedOTP) {
    return res.status(400).json({ error: 'No OTP found for this email' });
  }

  if (Date.now() > storedOTP.expires) {
    otpStore.delete(email.toLowerCase());
    return res.status(400).json({ error: 'OTP has expired' });
  }

  if (storedOTP.otp !== otp) {
    return res.status(400).json({ error: 'Invalid OTP' });
  }

  // OTP verified, remove from store
  otpStore.delete(email.toLowerCase());
  
  res.json({ success: true, message: 'OTP verified successfully' });
});

// POST /auth/signup - Complete signup with email, password, and PIN
router.post('/signup', authLimiter, async (req, res) => {
  const { email, password, pin } = req.body;
  
  if (!email || !password || !pin) {
    return res.status(400).json({ error: 'Email, password, and PIN are required' });
  }

  if (!/^\d{6}$/.test(pin)) {
    return res.status(400).json({ error: 'PIN must be exactly 6 digits' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  try {
    // Check if user already exists
    if (users.has(email.toLowerCase())) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Hash password and PIN
    const passwordHash = await hashPassword(password);
    const pinHash = await hashPin(pin);

    // Create user
    const user = {
      email: email.toLowerCase(),
      password_hash: passwordHash,
      pin_hash: pinHash,
      pin_created: true,
      pin_created_at: new Date(),
      last_login_at: null,
      created_at: new Date()
    };

    users.set(email.toLowerCase(), user);

    // Send admin notification (implement as needed)
    // await notifyAdminNewUser(email);

    res.json({ success: true, message: 'Account created successfully' });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Failed to create account' });
  }
});

// POST /auth/login - Login with email and PIN
router.post('/login', authLimiter, async (req, res) => {
  const { email, pin } = req.body;
  
  if (!email || !pin) {
    return res.status(400).json({ error: 'Email and PIN are required' });
  }

  if (!/^\d{6}$/.test(pin)) {
    return res.status(400).json({ error: 'Invalid PIN format' });
  }

  try {
    const user = users.get(email.toLowerCase());
    
    if (!user || !user.pin_created) {
      return res.status(401).json({ error: 'Incorrect email or PIN' });
    }

    // Verify PIN
    const pinValid = await verifyPin(pin, user.pin_hash);
    if (!pinValid) {
      return res.status(401).json({ error: 'Incorrect email or PIN' });
    }

    // Update last login
    user.last_login_at = new Date();

    // Create session token (implement proper JWT in production)
    const sessionToken = crypto.randomBytes(32).toString('hex');

    res.json({
      success: true,
      message: 'Login successful',
      user: {
        email: user.email,
        sessionToken
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// POST /auth/verify-pin - Verify PIN for actions (Cut/Logout)
router.post('/verify-pin', authLimiter, async (req, res) => {
  const { email, pin } = req.body;
  
  if (!email || !pin) {
    return res.status(400).json({ error: 'Email and PIN are required' });
  }

  if (!/^\d{6}$/.test(pin)) {
    return res.status(400).json({ error: 'Invalid PIN format' });
  }

  try {
    const user = users.get(email.toLowerCase());
    
    if (!user || !user.pin_created) {
      return res.status(401).json({ error: 'User not found' });
    }

    // Verify PIN
    const pinValid = await verifyPin(pin, user.pin_hash);
    
    res.json({ valid: pinValid });
  } catch (error) {
    console.error('PIN verification error:', error);
    res.status(500).json({ error: 'PIN verification failed' });
  }
});

module.exports = router;