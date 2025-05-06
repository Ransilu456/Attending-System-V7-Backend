import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import studentRoutes from './routes/students.routes.js';
import adminRoutes from './routes/admin.routes.js';
import reportsRoutes from './routes/reports.routes.js';
import whatsappRoutes from './routes/whatsapp.routes.js';  
import { errorHandler } from './middleware/authMiddleware.js';
import { printBanner, logInfo, logSuccess, logWarning, logError, logSection, logServerStart, startSpinner, succeedSpinner, stopSpinner } from './utils/terminal.js';
import { connectDB, closeDB } from './config/database.js';
import mongoose from 'mongoose';
import { startScheduler } from './services/schedulerService.js';

dotenv.config();

const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  logInfo('Created uploads directory');
}

const app = express();
const port = process.env.PORT || 5001;

const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:4173',
  'http://127.0.0.1:5173',  
  'http://127.0.0.1:4000',
  'http://127.0.0.1:3000',
  process.env.CLIENT_URL
].filter(Boolean);

app.use(cors({
  origin: allowedOrigins,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: [
    'Content-Type', 
    'Authorization', 
    'mongodb-date-format',
    'preserve-mongodb-format',
    'time-format',
    'Accept'
  ],
  exposedHeaders: ['Content-Disposition'],
  preflightContinue: false,
  maxAge: 3600,
  optionsSuccessStatus: 200,
  credentials: true
}));

app.use((req, res, next) => {
  logInfo(`${req.method} ${req.url}`);
  next();
});

app.use((err, req, res, next) => {
  logError(`Error processing ${req.method} ${req.url}: ${err.message}`);
  next(err);
});

app.use(bodyParser.json({ 
  limit: '10mb',
  verify: (req, res, buf) => {
    try {
      JSON.parse(buf);
    } catch (e) {
      logError(`Invalid JSON received: ${e.message}`);
      res.status(400).json({ message: 'Invalid JSON payload' });
    }
  }
}));

app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

app.use('/api/students', studentRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/whatsapp', whatsappRoutes);  
app.use('/api/public', express.static('public'));

app.get('/api/health', (req, res) => {
  const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  res.status(200).json({ 
    status: 'ok',
    timestamp: new Date().toISOString(),
    database: dbStatus,
    environment: process.env.NODE_ENV,
    version: process.version
  });
});

app.use((req, res) => {
  logWarning(`Route not found: ${req.method} ${req.url}`);
  res.status(404).json({ 
    status: 'error',
    message: 'Route not found',
    path: req.url
  });
});

app.use(errorHandler);

// Start the server
const startServer = async () => {
  let server; 
  try {
    printBanner();
    
    if (!process.env.MONGODB_URI) {
      logError('Missing MONGODB_URI environment variable. Please check your .env file.');
      process.exit(1);
    }
    
    logSection('Configuration');
    logInfo(`Environment: ${process.env.NODE_ENV || 'development'}`);
    logInfo(`Port: ${port}`);
    logInfo(`CORS Origins: ${allowedOrigins.join(', ')}`);
    logInfo(`Weekend Attendance: ENABLED`);
    
    logSection('Database');
    await connectDB();
    succeedSpinner('db', 'Connected to MongoDB successfully');
    
    logSection('API Routes');
    logInfo('GET  /api/health - Health check endpoint');
    logInfo('POST /api/students/* - Student management endpoints');
    logInfo('POST /api/admin/* - Admin management endpoints');
    logInfo('POST /api/reports/* - Reports management endpoints');
    logInfo('POST /api/whatsapp/* - WhatsApp messaging endpoints');
    
    server = app.listen(port, '0.0.0.0', () => {
      stopSpinner('server');
      logServerStart(port);
      logSuccess(`Server is running in ${process.env.NODE_ENV || 'development'} mode`);
      
      startScheduler();
    });

    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        logError(`Port ${port} is already in use. Please choose a different port or terminate the existing process.`);
        process.exit(1);
      } else {
        logError(`Server error: ${error.message}`);
        process.exit(1);
      }
    });

    let connections = new Set();
    server.on('connection', (connection) => {
      connections.add(connection);
      connection.on('close', () => connections.delete(connection));
    });

    const gracefulShutdown = (signal) => {
      logWarning(`Received ${signal} signal. Shutting down gracefully...`);

      if (!server || server.listening === false) {
        logWarning('Server not running, proceeding to close database');
        closeDBAndExit();
        return;
      }
      

      const forceShutdownTimeout = setTimeout(() => {
        logError('Could not close connections in time, forcefully shutting down');
        process.exit(1);
      }, 10000);
      
      server.close(() => {
        logInfo('HTTP server closed.');
        clearTimeout(forceShutdownTimeout);
        
        if (connections && connections.size > 0) {
          logInfo(`Closing ${connections.size} active connections...`);
          for (const connection of connections) {
            try {
              connection.end();
            } catch (err) {
              logWarning(`Error closing a connection: ${err.message}`);
            }
          }
          connections.clear();
        }
        
        closeDBAndExit();
      });

      function closeDBAndExit() {
        if (mongoose && mongoose.connection && mongoose.connection.readyState !== 0) {
          closeDB().then(() => {
            logSuccess('Database connection closed.');
            process.exit(0);
          }).catch((err) => {
            logError(`Error closing database: ${err.message}`);
            process.exit(1);
          });
        } else {
          logInfo('No active database connection to close.');
          process.exit(0);
        }
      }
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('uncaughtException', (error) => {
      logError('Uncaught Exception:', error);
      gracefulShutdown('uncaughtException');
    });
    process.on('unhandledRejection', (reason, promise) => {
      logError('===== UNHANDLED REJECTION DETAILS =====');
      
      if (!reason) {
        logError('Reason: null or undefined');
      } else if (typeof reason === 'object') {
        if (reason instanceof Error) {
          logError('Error name:', reason.name);
          logError('Error message:', reason.message);
          logError('Error stack:', reason.stack);
        } else {
          try {
            logError('Reason (object):', JSON.stringify(reason, null, 2));
          } catch (e) {
            logError('Reason (non-stringifiable object):', Object.prototype.toString.call(reason));
          }
        }
      } else {
        logError('Reason type:', typeof reason);
        logError('Reason value:', String(reason));
      }
      
      if (!promise) {
        logError('Promise: null or undefined');
      } else {
        try {
          logError('Promise:', promise.toString());
        } catch (e) {
          logError('Promise (non-stringifiable)');
        }
      }
      
      logError('======================================');
      gracefulShutdown('unhandledRejection');
    });

  } catch (error) {
    logError('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
