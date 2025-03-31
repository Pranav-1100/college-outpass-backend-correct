// src/index.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { sendError } = require('./utils/response.util');
const adminService = require('./services/admin.service');
const outpassService = require('./services/outpass.service');
const path = require('path');
const fs = require('fs');

const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' })); // Increased limit for potential larger payloads

// Health check route
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'production'
  });
});

// Routes
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/admin', require('./routes/admin.routes'));
app.use('/api/outpass', require('./routes/outpass.routes'));
app.use('/api/notifications', require('./routes/notification.routes'));
app.use('/api/student', require('./routes/student.routes')); // Added student routes

// Error handling
app.use((err, req, res, next) => {
  console.error('Error:', err);
  return sendError(res, 500, err.message || 'Internal server error');
});

// Initialize server
const PORT = process.env.PORT || 6979;
const initializeServer = async () => {
  try {
    // Create initial admin if needed
    if (process.env.INITIAL_ADMIN_EMAIL && process.env.INITIAL_ADMIN_PASSWORD) {
      try {
        const result = await adminService.createInitialAdmin(
          process.env.INITIAL_ADMIN_EMAIL,
          process.env.INITIAL_ADMIN_PASSWORD
        );
        if (result) {
          console.log('Initial admin created successfully');
        }
      } catch (adminError) {
        console.error('Error creating initial admin:', adminError);
        // Continue with server initialization anyway
      }
    }

    // Check if we should import student data on startup
    if (process.env.IMPORT_STUDENTS_ON_STARTUP === 'true') {
      const csvPath = process.env.STUDENT_CSV_PATH || path.join(__dirname, '../data/students.csv');
      
      // Check if the CSV file exists
      if (fs.existsSync(csvPath)) {
        try {
          console.log(`Importing students from ${csvPath}...`);
          
          // Import function is directly required here to avoid circular dependencies
          const importStudentsFromCSV = require('../scripts/import-students');
          const result = await importStudentsFromCSV(csvPath);
          
          console.log('Student import result:', result);
        } catch (importError) {
          console.error('Error importing students on startup:', importError);
          // Continue with server initialization
        }
      } else {
        console.warn(`Student CSV file not found at ${csvPath}. Skipping import.`);
      }
    }

    // Set up real-time listeners
    try {
      await outpassService.setupRealTimeListeners();
      console.log('Real-time notification system initialized');
    } catch (listenerError) {
      console.error('Error setting up real-time listeners:', listenerError);
      // Continue with server initialization
    }

    // Start the HTTP server
    app.listen(PORT, () => {
      console.log(`✨ Server running on port ${PORT}`);
      console.log(`Health check: http://localhost:${PORT}/health`);
    });
  } catch (error) {
    console.error('⚠️ Server initialization failed:', error);
    process.exit(1);
  }
};  

// Run the server
initializeServer();