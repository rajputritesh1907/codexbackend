// ...existing code...
var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var cors = require("cors");
var session = require('express-session');
const multer = require('multer');

// Load environment variables
require('dotenv').config();

// Do not crash the process on unhandled rejections during dev; log instead
process.on('unhandledRejection', (reason) => {
  console.error('[Process] Unhandled Rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[Process] Uncaught Exception:', err);
});

// Database connection
const connectDB = require('./config/database');

var indexRouter = require('./routes/index');
var communityRouter = require('./routes/community');
// Removed meeting feature: meeting routes no longer required
// var profileRouter = require('./routes/profile');
var profileRouter = require('./routes/profile');

// Add multer for image upload
const upload = multer({ storage: multer.memoryStorage() });

// Add Image model (create models/Image.js with mongoose schema for real use)
const Image = require('./models/Image'); // <-- You need to create this file

var app = express();

// Connect to database (non-blocking start handled in bin/www if needed)
connectDB().catch(err => {
  console.error('[App] Continuing without an active MongoDB connection:', err.message);
});

app.use(logger('dev'));
// Increase payload size limit to 10MB
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Session configuration (ensure SESSION_SECRET is set in .env)
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev_fallback_secret_change_me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: false, // set to true if behind HTTPS proxy
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 8 // 8 hours
  }
}));

// Passport init (after session)
const passport = require('./config/passport');
app.use(passport.initialize());
app.use(passport.session());

// CORS configuration for production
const corsOptions = {
  origin: [
    'http://localhost:5173',
    'http://localhost:3000',
    process.env.FRONTEND_URL,
    'https://your-frontend-domain.vercel.app'
  ],
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));

// Mount admin routes AFTER session + CORS so they can use req.session
const adminRoutes = require('./routes/admin');
app.use('/api/admin', adminRoutes);

// OAuth routes
const authRoutes = require('./routes/auth');
app.use('/auth', authRoutes);

// Email verification & password reset routes (users)
const authEmailRoutes = require('./routes/authEmail');
app.use('/api/auth', authEmailRoutes);

app.use('/api', indexRouter);
app.use('/', indexRouter);
// app.use('/api', profileRouter);
// app.use('/', profileRouter);
// Mount community routes (provides /community/post/:id delete and other community endpoints)
app.use('/community', communityRouter);
// Meeting feature removed: '/api/meeting' endpoint no longer available

app.use('/test', (req, res) => {
  res.send('Test route is working');
});

// Image upload endpoint
app.post('/api/upload-image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No image uploaded' });
    }
    // Convert image buffer to base64
    const base64Image = req.file.buffer.toString('base64');
    // Save to MongoDB
    const imageDoc = new Image({
      filename: req.file.originalname,
      mimetype: req.file.mimetype,
      data: base64Image,
      uploadedAt: new Date()
    });
    await imageDoc.save();
    res.json({ success: true, message: 'Image uploaded', imageId: imageDoc._id });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  // Return JSON error for API
  res.status(err.status || 500);
  res.json({
    success: false,
    message: err.message,
    error: req.app.get('env') === 'development' ? err : {}
  });
});
module.exports = app;