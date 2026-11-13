require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const rateLimit = require('express-rate-limit');

const connectDB = require('./backend/config/db');
const seedAdmin = require('./backend/config/seedAdmin');

const app = express();

app.set('trust proxy', 1);
app.use(helmet({
  contentSecurityPolicy: false
}));

app.use(cors());

app.use(express.json({ limit: '5mb' }))// API Routes
app.use('/api/auth', require('./backend/routes/auth'));
app.use('/api/bookings', require('./backend/routes/bookings'));
app.use('/api/food', require('./backend/routes/food'));
app.use('/api/offers', require('./backend/routes/offers'));
app.use('/api/notifications', require('./backend/routes/notifications'));
app.use('/api/admin', require('./backend/routes/admin'));

app.use(express.urlencoded({ extended: true }));

app.use('/api/', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: {
    success: false,
    message: 'Too many requests. Please try again later.'
  }
}));

app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Hotel Pragati API is running',
    database: mongoose.connection.readyState === 1
      ? 'Connected'
      : 'Disconnected'
  });
});

// Existing website
// API Routes
app.use(express.static(__dirname));

const PORT = process.env.PORT || 5050;

const startServer = async () => {
  await connectDB();
  await seedAdmin();

  app.listen(PORT, () => {
    console.log(`Hotel Pragati running on port ${PORT}`);
  });
};

startServer();
