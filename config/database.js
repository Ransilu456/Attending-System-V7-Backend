// config/database.js
import mongoose from 'mongoose';
import { logInfo, logSuccess, logError, logWarning } from '../utils/terminal.js';

// Maximum connection attempts
const MAX_RETRIES = 3;
let retryCount = 0;

/**
 * Validate MongoDB URI
 */
const validateMongoURI = (uri) => {
  if (!uri) {
    throw new Error('MongoDB URI is not defined. Check your .env file');
  }
  
  // Basic validation for MongoDB URI format
  if (!uri.startsWith('mongodb://') && !uri.startsWith('mongodb+srv://')) {
    throw new Error('Invalid MongoDB URI format. Must start with mongodb:// or mongodb+srv://');
  }
  
  return true;
};

/**
 * Connect to MongoDB with retry logic
 */
export const connectDB = async () => {
  try {
    // Validate MongoDB URI before attempting connection
    const uri = process.env.MONGODB_URI;
    validateMongoURI(uri);
    
    logInfo(`Connecting to MongoDB (attempt ${retryCount + 1}/${MAX_RETRIES})...`);
    
    // Set connection options
    const options = {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      family: 4,  // Use IPv4, skip trying IPv6
      retryWrites: true,
      w: 'majority'
    };
    
    // Connect to MongoDB
    const conn = await mongoose.connect(uri, options);
    
    // Reset retry counter on successful connection
    retryCount = 0;
    
    // Register connection event listeners
    mongoose.connection.on('disconnected', () => {
      logWarning('MongoDB disconnected. Will attempt to reconnect...');
    });
    
    mongoose.connection.on('error', (err) => {
      logError(`MongoDB connection error: ${err.message}`);
    });
    
    logSuccess(`Connected to MongoDB at ${conn.connection.host}`);
    return conn;
  } catch (error) {
    logError(`Failed to connect to MongoDB: ${error.message}`);
    
    // Retry logic
    if (retryCount < MAX_RETRIES - 1) {
      retryCount++;
      logWarning(`Retrying connection in 5 seconds... (${retryCount}/${MAX_RETRIES})`);
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, 5000));
      return connectDB();
    }
    
    // For critical errors after max retries, exit the process
    logError('Max connection attempts reached. Exiting process.');
    process.exit(1);
  }
};

/**
 * Gracefully close MongoDB connection
 */
export const closeDB = async () => {
  try {
    // Check if there's an active connection before closing
    if (mongoose.connection.readyState === 0) {
      logInfo('No MongoDB connection to close');
      return true;
    }
    
    await mongoose.connection.close(false); // false = don't force close
    logInfo('MongoDB connection closed successfully');
    return true;
  } catch (error) {
    logError(`Error closing MongoDB connection: ${error.message}`);
    return false;
  }
};

export default { connectDB, closeDB };
