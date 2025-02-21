// src/index.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { sendError } = require('./utils/response.util');
const adminService = require('./services/admin.service');
const outpassService = require('./services/outpass.service');

const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Health check route
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Routes
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/admin', require('./routes/admin.routes'));
app.use('/api/outpass', require('./routes/outpass.routes'));
app.use('/api/notifications', require('./routes/notification.routes'));


// Error handling
app.use((err, req, res, next) => {
  console.error('Error:', err);
  return sendError(res, 500, err.message || 'Internal server error');
});

// Initialize server
const PORT = process.env.PORT || 3000;
const initializeServer = async () => {
  try {
    // Create initial admin if needed
    if (process.env.INITIAL_ADMIN_EMAIL && process.env.INITIAL_ADMIN_PASSWORD) {
      const result = await adminService.createInitialAdmin(
        process.env.INITIAL_ADMIN_EMAIL,
        process.env.INITIAL_ADMIN_PASSWORD
      );
      if (result) {
        console.log('Initial admin created successfully');
      }
    }

    // Set up real-time listeners
    await outpassService.setupRealTimeListeners();
    console.log('Real-time notification system initialized');

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Server initialization failed:', error);
    process.exit(1);
  }
};  

initializeServer();