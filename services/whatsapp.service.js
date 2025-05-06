import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode-terminal';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the directory name for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

/**
 * WhatsApp Web client instance
 * Used for sending automated notifications to parents
 */
let client = new Client({
  authStrategy: new LocalAuth({
    dataPath: 'whatsapp-session'
  }),
  puppeteer: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  }
});

// Internal state tracking
let qrCallback = null;
let isClientReady = false;
let clientError = null;
let currentQR = null;
let lastConnectionTime = null;
let connectionEvents = [];
let messageStats = {
  total: 0,
  successful: 0,
  failed: 0,
  pending: 0
};

// Start client initialization
client.initialize();

// Handle QR code generation
client.on('qr', (qr) => {
  console.log('New QR code generated');
  currentQR = qr;
  qrcode.generate(qr, { small: true });
  
  // Add event to history
  addConnectionEvent('QR Code Generated', 'info');
  
  if (qrCallback) {
    qrCallback(qr);
  }
});

// Add error handling for client initialization
client.on('loading_screen', (percent, message) => {
  console.log('Loading:', percent, message);
});

client.on('authenticated', () => {
  console.log('WhatsApp client authenticated');
  currentQR = null; // Clear QR code after authentication
  addConnectionEvent('Authenticated', 'success');
});

// Handle client ready state
client.on('ready', () => {
  console.log('WhatsApp client is ready!');
  isClientReady = true;
  clientError = null;
  lastConnectionTime = new Date();
  addConnectionEvent('Connected', 'success');
});

// Handle authentication failures
client.on('auth_failure', (error) => {
  console.error('WhatsApp authentication failed:', error);
  clientError = error;
  isClientReady = false;
  addConnectionEvent(`Authentication Failed: ${error.message}`, 'error');
  
  // Reset client state on auth failure
  client.destroy().then(() => client.initialize()).catch(console.error);
});

// Handle disconnections
client.on('disconnected', (reason) => {
  console.log('WhatsApp client disconnected:', reason);
  isClientReady = false;
  addConnectionEvent(`Disconnected: ${reason}`, 'warning');
});

/**
 * Add an event to the connection history
 */
const addConnectionEvent = (event, status = 'info') => {
  connectionEvents.unshift({
    timestamp: new Date(),
    event,
    status
  });
  
  // Keep only the last 50 events
  if (connectionEvents.length > 50) {
    connectionEvents = connectionEvents.slice(0, 50);
  }
};

/**
 * Set callback function for QR code scanning
 */
export const setQRCallback = (callback) => {
  qrCallback = callback;
};

/**
 * Get current QR code
 */
export const getCurrentQR = () => {
  return {
    qr: currentQR,
    timestamp: new Date()
  };
};

/**
 * Reset QR code and initialize new client
 */
export const resetQR = async () => {
  try {
    currentQR = null;
    isClientReady = false;
    addConnectionEvent('Resetting QR Code', 'info');
    
    if (client) {
      // Clean up existing client
      await client.destroy().catch(() => {});
      
      // Create and initialize new client
      client = new Client({
        authStrategy: new LocalAuth({
          dataPath: 'whatsapp-session'
        }),
        puppeteer: {
          headless: true,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--disable-gpu'
          ]
        }
      });

      // Re-register key event handlers
      client.on('qr', (qr) => {
        console.log('New QR code generated after reset');
        currentQR = qr;
        qrcode.generate(qr, { small: true });
        
        // Add event to history
        addConnectionEvent('QR Code Generated (After Reset)', 'info');
        
        if (qrCallback) {
          qrCallback(qr);
        }
      });

      client.on('ready', () => {
        console.log('WhatsApp client is ready after reset!');
        isClientReady = true;
        clientError = null;
        lastConnectionTime = new Date();
        addConnectionEvent('Connected After Reset', 'success');
      });

      // Initialize the client to trigger new QR code generation
      await client.initialize().catch((err) => {
        console.warn('Error initializing client during reset:', err.message);
        addConnectionEvent(`Reset Error: ${err.message}`, 'error');
      });
    }
    
    return {
      success: true,
      message: 'WhatsApp connection reset successfully'
    };
  } catch (error) {
    console.error('Error resetting QR code:', error);
    addConnectionEvent(`QR Reset Error: ${error.message}`, 'error');
    
    // Return success even on error since we've reset the state
    return {
      success: true,
      message: 'WhatsApp state reset',
      warning: error.message
    };
  }
};

/**
 * Handle WhatsApp logout with proper cleanup
 */
export const logout = async () => {
  try {
    // Reset internal state first
    currentQR = null;
    isClientReady = false;
    clientError = null;
    addConnectionEvent('Logging Out', 'warning');

    // Force logout from device by removing session files
    let logoutComplete = false;

    if (client) {
      // First try to gracefully close any browsers/pages
      try {
        console.log('Closing any active browser pages...');
        const pages = await client.pupPage?.browser()?.pages();
        if (pages && pages.length > 0) {
          console.log(`Found ${pages.length} active browser pages to close`);
          await Promise.all(pages.map(page => page.close().catch((e) => console.warn('Error closing page:', e.message))));
        }
      } catch (error) {
        console.warn('Error closing browser pages:', error);
      }

      // Try graceful logout through client API
      try {
        console.log('Attempting graceful logout through WhatsApp API...');
        await client.logout().catch((err) => {
          console.warn('Graceful logout encountered an error:', err.message);
          throw err;
        });
        logoutComplete = true;
        console.log('Graceful logout completed successfully through WhatsApp API');
      } catch (error) {
        console.warn('Graceful logout failed, will try force disconnection');
      }

      // Destroy client regardless of logout result
      try {
        console.log('Destroying WhatsApp client...');
        await client.destroy().catch((err) => {
          console.warn('Error destroying client:', err.message);
        });
        console.log('Client destroyed successfully');
      } catch (error) {
        console.warn('Error destroying client:', error);
      }
    }

    // Always delete session files for complete logout
    try {
      console.log('Deleting WhatsApp session files...');
      const sessionDir = path.join(projectRoot, 'whatsapp-session');
      console.log(`Session directory path: ${sessionDir}`);
      
      if (fs.existsSync(sessionDir)) {
        console.log('Session directory exists, proceeding with deletion');
        
        // Define deleteFolder function
        const deleteFolder = (folderPath) => {
          if (fs.existsSync(folderPath)) {
            // Get all files in directory
            const files = fs.readdirSync(folderPath);
            console.log(`Found ${files.length} files/folders in ${folderPath}`);
            
            // Process each file/folder
            for (const file of files) {
              const curPath = path.join(folderPath, file);
              
              // Check if it's a directory or file
              if (fs.statSync(curPath).isDirectory()) {
                // Recursively delete subdirectory
                deleteFolder(curPath);
              } else {
                // Delete file
                try {
                  fs.unlinkSync(curPath);
                  console.log(`Successfully deleted file: ${curPath}`);
                } catch (err) {
                  console.warn(`Failed to delete file ${curPath}:`, err.message);
                }
              }
            }
            
            // Now delete the empty directory
            try {
              fs.rmdirSync(folderPath);
              console.log(`Successfully deleted directory: ${folderPath}`);
            } catch (err) {
              console.warn(`Failed to delete directory ${folderPath}:`, err.message);
            }
          } else {
            console.log(`Directory not found: ${folderPath}`);
          }
        };
        
        // Execute directory deletion
        deleteFolder(sessionDir);
        logoutComplete = true;
        console.log('Session directory and files deleted successfully');
      } else {
        console.log('Session directory not found, nothing to delete');
      }
    } catch (fsError) {
      console.error('Error handling session files:', fsError);
    }

    // Create a new client instance
    console.log('Creating new WhatsApp client instance...');
    client = new Client({
      authStrategy: new LocalAuth({
        dataPath: 'whatsapp-session'
      }),
      puppeteer: {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu'
        ]
      }
    });

    // Re-register event handlers for the new client
    client.on('qr', (qr) => {
      console.log('New QR code generated after session reset');
      currentQR = qr;
      qrcode.generate(qr, { small: true });
      
      // Add event to history
      addConnectionEvent('QR Code Generated (After Reset)', 'info');
      
      if (qrCallback) {
        qrCallback(qr);
      }
    });

    client.on('loading_screen', (percent, message) => {
      console.log('Loading after reset:', percent, message);
    });

    client.on('authenticated', () => {
      console.log('WhatsApp client authenticated after reset');
      currentQR = null; // Clear QR code after authentication
      addConnectionEvent('Authenticated After Reset', 'success');
    });

    client.on('ready', () => {
      console.log('WhatsApp client is ready after reset!');
      isClientReady = true;
      clientError = null;
      lastConnectionTime = new Date();
      addConnectionEvent('Connected After Reset', 'success');
    });

    client.on('auth_failure', (error) => {
      console.error('WhatsApp authentication failed after reset:', error);
      clientError = error;
      isClientReady = false;
      addConnectionEvent(`Authentication Failed After Reset: ${error.message}`, 'error');
    });

    client.on('disconnected', (reason) => {
      console.log('WhatsApp client disconnected after reset:', reason);
      isClientReady = false;
      addConnectionEvent(`Disconnected After Reset: ${reason}`, 'warning');
    });

    // Initialize the new client
    console.log('Initializing new client...');
    await client.initialize().catch((err) => {
      console.warn('Error initializing new client:', err.message);
    });
    console.log('New client initialized');

    // Add success event
    addConnectionEvent('Logged Out Successfully', 'success');
    
    return {
      success: true,
      message: 'WhatsApp session cleared successfully',
      logoutComplete
    };
  } catch (error) {
    console.error('Error during WhatsApp logout:', error);
    addConnectionEvent(`Logout Error: ${error.message}`, 'error');
    
    // Even if there's an error, we want to consider it successful
    // as long as we've cleared the state
    return {
      success: true,
      message: 'WhatsApp state reset successfully',
      warning: error.message
    };
  }
};

/**
 * Get current connection state of WhatsApp client
 */
export const getClientState = () => {
  return {
    isReady: isClientReady,
    error: clientError,
    qrCode: currentQR, // Add QR code to status
    timestamp: new Date(),
    lastConnectionTime,
    connectionEvents: connectionEvents.slice(0, 10), // Return last 10 events
    messageStats
  };
};

/**
 * Format phone number for WhatsApp API
 * Removes non-numeric characters and handles country codes
 */
const formatPhoneNumber = (phoneNumber) => {
  // Remove all non-numeric characters
  let formatted = phoneNumber.replace(/\D/g, '');
  
  // If number starts with 0, replace with country code
  if (formatted.startsWith('0')) {
    formatted = '94' + formatted.substring(1); // Sri Lanka country code
  }
  
  // Ensure number starts with country code
  if (!formatted.startsWith('94')) {
    formatted = '94' + formatted;
  }
  
  return formatted;
};

/**
 * Send a text message via WhatsApp
 * Returns success status and message details
 */
export const sendTextMessage = async (phoneNumber, message) => {
  try {
    console.log(`Attempting to send WhatsApp message to ${phoneNumber}`);
    
    // Update message stats
    messageStats.total += 1;
    messageStats.pending += 1;
    
    if (!isClientReady) {
      console.log('WhatsApp client not ready, current state:', clientError || 'No specific error');
      messageStats.pending -= 1;
      messageStats.failed += 1;
      
      addConnectionEvent(`Message Failed: Client not ready`, 'error');
      
      return {
        success: false,
        error: 'WhatsApp client not ready. Please scan QR code to connect.',
        code: 'CLIENT_NOT_READY'
      };
    }

    const formattedNumber = formatPhoneNumber(phoneNumber);
    if (!formattedNumber) {
      console.log(`Invalid phone number format: ${phoneNumber}`);
      messageStats.pending -= 1;
      messageStats.failed += 1;
      
      addConnectionEvent(`Message Failed: Invalid phone number`, 'error');
      
      return {
        success: false,
        error: 'Invalid phone number format',
        code: 'INVALID_PHONE'
      };
    }

    const chatId = `${formattedNumber}@c.us`;
    
    try {
      // Check if client is still authenticated
      if (!client.info) {
        isClientReady = false;
        clientError = 'Client lost authentication';
        addConnectionEvent('Client lost authentication', 'error');
        
        return {
          success: false,
          error: 'WhatsApp client lost authentication. Please scan QR code again.',
          code: 'AUTH_LOST'
        };
      }

      const result = await client.sendMessage(chatId, message);
      console.log('WhatsApp message sent successfully:', result.id._serialized);
      
      // Update message stats
      messageStats.pending -= 1;
      messageStats.successful += 1;
      
      addConnectionEvent(`Message sent to ${phoneNumber}`, 'success');
      
      return {
        success: true,
        messageId: result.id._serialized,
        timestamp: result.timestamp,
        message: message
      };
    } catch (sendError) {
      console.error('Error in WhatsApp send operation:', sendError);
      
      // Check for specific error types
      if (sendError.message.includes('wid error: invalid wid')) {
        isClientReady = false;
        clientError = 'Invalid WhatsApp ID';
        addConnectionEvent('Invalid WhatsApp ID detected', 'error');
        
        return {
          success: false,
          error: 'WhatsApp client needs re-authentication. Please scan QR code again.',
          code: 'INVALID_WID'
        };
      }
      
      // Update message stats
      messageStats.pending -= 1;
      messageStats.failed += 1;
      
      addConnectionEvent(`Message Failed: ${sendError.message}`, 'error');
      
      return {
        success: false,
        error: sendError.message,
        code: 'SEND_ERROR',
        details: sendError.stack
      };
    }
  } catch (error) {
    console.error('Error sending WhatsApp message:', error);
    
    // Update message stats
    messageStats.pending -= 1;
    messageStats.failed += 1;
    
    addConnectionEvent(`Message Error: ${error.message}`, 'error');
    
    return {
      success: false,
      error: error.message,
      code: 'GENERAL_ERROR',
      details: error.stack
    };
  }
};

/**
 * Send an attendance notification to parent
 * Formats a detailed message with student's attendance status
 */
export const sendAttendanceAlert = async (phoneNumber, student, status, timestamp) => {
  try {
    if (!phoneNumber) {
      console.log('No phone number provided for attendance alert');
      return {
        success: false,
        error: 'No phone number provided',
        code: 'MISSING_PHONE'
      };
    }

    const formattedTime = new Date(timestamp).toLocaleString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone: 'Asia/Colombo' // Sri Lanka timezone
    });

    // Format readable status
    const displayStatus = status === 'entered' ? 'Entered School' : 
                          status === 'left' ? 'Left School' : 
                          status.charAt(0).toUpperCase() + status.slice(1);

    // Get student details with fallbacks
    const studentName = student.name || 'Student';
    const indexNumber = student.indexNumber || student.index || '';
    const email = student.student_email || student.email || 'N/A';
    const parentPhone = student.parent_telephone || student.parentPhone || phoneNumber;
    const address = student.address || 'N/A';

    // Create the message
    const message = `🏫 *Attendance Update*\n\n` +
      `Student: *${studentName}*\n` +
      `Index Number: *${indexNumber}*\n` +
      `Status: *${displayStatus}*\n` +
      `Time: *${formattedTime}*\n\n` +
      `Additional Details:\n` +
      `Email: ${email}\n` +
      `Parent Phone: ${parentPhone}\n` +
      `Address: ${address}`;

    // Log the message for debugging
    console.log('Sending WhatsApp attendance alert:', {
      to: phoneNumber,
      studentName,
      status: displayStatus,
      time: formattedTime
    });

    // Send the message
    const result = await sendTextMessage(phoneNumber, message);

    // Log the result
    if (result.success) {
      console.log('Successfully sent attendance alert:', {
        messageId: result.messageId,
        student: studentName,
        status: displayStatus,
        timestamp: formattedTime
      });
    } else {
      console.error('Failed to send attendance alert:', {
        error: result.error,
        student: studentName,
        status: displayStatus
      });
    }

    return {
      ...result,
      message
    };
  } catch (error) {
    console.error('Error in sendAttendanceAlert:', error);
    return {
      success: false,
      error: error.message,
      code: 'ALERT_ERROR'
    };
  }
};

/**
 * Send a bulk message to multiple recipients
 * @param {Array<string>} phoneNumbers - List of phone numbers
 * @param {string} message - Message to send
 * @returns {Promise<Object>} Result with success and failure counts
 */
export const sendBulkMessages = async (phoneNumbers, message) => {
  const results = {
    successful: [],
    failed: []
  };

  for (const phone of phoneNumbers) {
    try {
      const result = await sendTextMessage(phone, message);
      
      if (result.success) {
        results.successful.push({
          phone,
          messageId: result.messageId
        });
      } else {
        results.failed.push({
          phone,
          error: result.error
        });
      }
    } catch (error) {
      results.failed.push({
        phone,
        error: error.message
      });
    }
  }

  return {
    success: true,
    summary: {
      total: phoneNumbers.length,
      successful: results.successful.length,
      failed: results.failed.length
    },
    results
  };
};
