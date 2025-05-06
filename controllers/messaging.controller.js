import { 
  getClientState, 
  setQRCallback, 
  sendTextMessage, 
  sendAttendanceAlert, 
  sendBulkMessages,
  getCurrentQR, 
  resetQR,
  logout as whatsappLogout 
} from '../services/whatsapp.service.js';
import Student from '../models/student.model.js';
import { DateTime } from 'luxon';
import { checkPreviousDayAttendance } from '../services/autoAttendanceService.js';

/**
 * Get WhatsApp connection status 
 */
export const getWhatsAppStatus = async (req, res) => {
  try {
    const status = getClientState();
    
    // Add additional information for the frontend
    const response = {
      success: true,
      status: {
        ...status,
        // Add formatted connection duration if connected
        connectionDuration: status.lastConnectionTime && status.isReady ? 
          formatDuration(new Date() - status.lastConnectionTime) : null,
        // Add server timestamp
        serverTime: new Date()
      }
    };
    
    res.status(200).json(response);
  } catch (error) {
    console.error('Error getting WhatsApp status:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Format duration in HH:MM:SS format
 */
const formatDuration = (ms) => {
  const seconds = Math.floor((ms / 1000) % 60);
  const minutes = Math.floor((ms / (1000 * 60)) % 60);
  const hours = Math.floor(ms / (1000 * 60 * 60));
  
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

/**
 * Set QR code callback for WhatsApp authentication
 */
export const setQRCodeCallback = (callback) => {
  setQRCallback(callback);
};

/**
 * Get current QR code for WhatsApp authentication
 */
export const getQRCode = async (req, res) => {
  try {
    // Get status of WhatsApp client
    const status = getClientState();
    
    // If client is already authenticated, no need for QR code
    if (status.isReady) {
      return res.status(200).json({
        success: true,
        message: 'WhatsApp is already connected',
        isConnected: true,
        connectionInfo: {
          lastConnection: status.lastConnectionTime,
          connectionDuration: status.lastConnectionTime ? 
            formatDuration(new Date() - status.lastConnectionTime) : null
        }
      });
    }
    
    // Try to get current QR code
    const { qr, timestamp } = getCurrentQR();
    
    if (!qr) {
      // Force reset and get a new QR code
      await resetQR();
      
      // Wait briefly for new QR code generation
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Try to get QR code again
      const newQR = getCurrentQR();
      
      if (!newQR.qr) {
        return res.status(404).json({
          success: false,
          message: 'No QR code available. Please try refreshing after a few seconds.',
          shouldRetry: true
        });
      }
      
      return res.status(200).json({
        success: true,
        qrCode: newQR.qr,
        timestamp: newQR.timestamp,
        expiresIn: 60 // QR codes typically expire in 60 seconds
      });
    }

    res.status(200).json({
      success: true,
      qrCode: qr,
      timestamp,
      expiresIn: 60 // QR codes typically expire in 60 seconds
    });
  } catch (error) {
    console.error('Error getting QR code:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving WhatsApp QR code',
      error: error.message,
      shouldRetry: true
    });
  }
};

/**
 * Force refresh the QR code
 */
export const refreshQRCode = async (req, res) => {
  try {
    // Check if client is already connected
    const clientState = getClientState();
    if (clientState.isReady) {
      return res.status(200).json({
        success: true,
        message: 'WhatsApp client is already connected',
        isConnected: true,
        connectionInfo: {
          lastConnection: clientState.lastConnectionTime,
          connectionDuration: clientState.lastConnectionTime ? 
            formatDuration(new Date() - clientState.lastConnectionTime) : null
        }
      });
    }
    
    // Forcefully reset WhatsApp client
    console.log('Refreshing QR code by resetting WhatsApp client...');
    await resetQR();
    
    // Wait for new QR code to be generated
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Get new QR code
    const qrCode = getCurrentQR();
    
    if (!qrCode || !qrCode.qr) {
      console.log('QR code refresh attempted but no QR code was generated');
      return res.status(202).json({
        success: false,
        message: 'QR code requested but not yet available. Please try again in a few seconds.',
        shouldRetry: true,
        retryAfter: 3 // Suggest retrying after 3 seconds
      });
    }
    
    console.log('QR code regenerated successfully at:', new Date().toISOString());
    res.status(200).json({
      success: true,
      qrCode: qrCode.qr,
      timestamp: qrCode.timestamp || new Date(),
      expiresIn: 60,
      message: 'QR code refreshed successfully'
    });
  } catch (error) {
    console.error('Error refreshing QR code:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to refresh QR code',
      error: error.message || 'Unknown error',
      shouldRetry: true,
      retryAfter: 5
    });
  }
};

/**
 * Handle WhatsApp logout
 */
export const logoutWhatsApp = async (req, res) => {
  try {
    console.log('Received logout request from user:', req.user?.name || 'Unknown user');
    
    // Check if client is connected first
    const status = getClientState();
    if (!status.isReady) {
      console.log('WhatsApp already logged out or not connected');
      return res.status(200).json({
        success: true,
        message: 'WhatsApp already logged out',
        wasConnected: false,
        deviceInstructions: 'No active connection to disconnect'
      });
    }
    
    // Execute logout procedure
    console.log('Executing WhatsApp logout procedure...');
    const logoutResult = await whatsappLogout();
    console.log('Logout completed with result:', logoutResult);
    
    // Always reset QR code state
    try {
      console.log('Resetting QR code state...');
      await resetQR();
      console.log('QR code reset completed');
    } catch (resetError) {
      console.warn('Error during QR reset:', resetError);
    }
    
    // Create response with device instructions
    const deviceInstructions = `
1. Open WhatsApp on your phone
2. Tap the three dots (⋮) in the top right corner
3. Select "Linked Devices"
4. Tap on "DP-Attending-System Web" or similar device
5. Select "Log Out"
`;
    
    // Send success response with instructions for the user
    res.status(200).json({
      success: true,
      message: 'WhatsApp session cleared from server.',
      details: logoutResult.logoutComplete 
        ? 'Session data has been deleted from the server.' 
        : 'Session data has been cleared, but some files may remain.',
      deviceInstructions: deviceInstructions.trim(),
      wasConnected: true,
      timestamp: new Date().toISOString(),
      resetRequired: true,
      warning: logoutResult.warning || null,
      note: 'Please also manually disconnect this device from your phone using the instructions above.'
    });
  } catch (error) {
    console.error('Error during WhatsApp logout:', error);
    
    // Send detailed instructions even if there was an error
    const deviceInstructions = `
1. Open WhatsApp on your phone
2. Tap the three dots (⋮) in the top right corner
3. Select "Linked Devices"
4. Tap on "DP-Attending-System Web" or similar device
5. Select "Log Out"
`;

    // Send success response even on error since we want the frontend to proceed
    res.status(200).json({
      success: true,
      message: 'WhatsApp session cleared with some errors',
      details: 'There were issues clearing the session data. Please disconnect manually from your phone.',
      deviceInstructions: deviceInstructions.trim(),
      warning: error.message,
      resetRequired: true,
      timestamp: new Date().toISOString(),
      note: 'IMPORTANT: You must manually disconnect this device from your phone using the instructions above.'
    });
  }
};

/**
 * Send a WhatsApp message to a parent when their child scans a QR code
 * Used for attendance notifications
 */
export const sendQrCodeScanMessage = async (studentData) => {
  try {
    const {
      name,
      indexNumber,
      status,
      timestamp,
      parentPhone
    } = studentData;

    if (!parentPhone) {
      console.log('No parent phone number available for student:', indexNumber);
      return {
        status: 'failed',
        message: 'No parent phone number available'
      };
    }

    // Format time for Sri Lanka timezone
    const time = DateTime.fromJSDate(timestamp)
      .setZone('Asia/Colombo')
      .toFormat('hh:mm a');

    // Create message content
    const message = `Dear Parent,\n\nThis is to inform you that your child ${name} (${indexNumber}) has ${status === 'entered' ? 'entered' : 'left'} the school at ${time}.\n\nThank you,\nSchool Administration`;

    const result = await sendAttendanceAlert(
      parentPhone,
      studentData,
      status,
      timestamp
    );

    return {
      status: result.success ? 'sent' : 'failed',
      messageId: result.messageId,
      content: result.message,
      timestamp: new Date(),
      recipientPhone: parentPhone
    };
  } catch (error) {
    console.error('Error sending QR code scan message:', error);
    return {
      status: 'failed',
      message: error.message
    };
  }
};

/**
 * Send a manual WhatsApp message
 */
export const sendMessage = async (req, res) => {
  try {
    const { phoneNumber, message, type = 'test' } = req.body;
    
    if (!phoneNumber || !message) {
      return res.status(400).json({
        success: false,
        message: 'Phone number and message are required'
      });
    }

    // Format phone number to remove spaces and ensure proper format
    let formattedPhone = phoneNumber.replace(/\s+/g, '');
    if (!formattedPhone.startsWith('+')) {
      formattedPhone = '+' + formattedPhone;
    }

    const result = await sendTextMessage(formattedPhone, message);
    
    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.error || 'Failed to send message',
        code: result.code
      });
    }
    
    return res.status(200).json({
      success: true,
      message: 'Message sent successfully',
      messageId: result.messageId,
      timestamp: result.timestamp
    });
  } catch (error) {
    console.error('Error in sendMessage:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to send message',
      error: error.message
    });
  }
};

/**
 * Send bulk WhatsApp messages to multiple students' parents
 */
export const adminSendBulkMessages = async (req, res) => {
  try {
    // Check WhatsApp client status first
    const clientState = getClientState();
    if (!clientState.isReady) {
      return res.status(503).json({
        success: false,
        message: 'WhatsApp service not ready',
        error: clientState.error || 'Please scan the QR code to connect WhatsApp'
      });
    }
    
    const { studentIds, message } = req.body;
    
    if (!studentIds || !Array.isArray(studentIds) || studentIds.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'At least one student ID is required' 
      });
    }
    
    if (!message || !message.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Message content is required'
      });
    }
    
    const students = await Student.find({ _id: { $in: studentIds } });
    
    if (!students || students.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No students found with the provided IDs'
      });
    }
    
    // Get list of phone numbers
    const phoneNumbers = students
      .filter(student => student.parent_telephone)
      .map(student => student.parent_telephone);

    if (phoneNumbers.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid phone numbers found for the selected students'
      });
    }

    const result = await sendBulkMessages(phoneNumbers, message);
    
    // Record messages for successful sends
    for (const student of students) {
      if (student.parent_telephone) {
        const successfulSend = result.results.successful.find(
          s => s.phone === student.parent_telephone
        );
        
        if (successfulSend) {
          student.messages = student.messages || [];
          student.messages.push({
            content: message,
            sentAt: new Date(),
            type: 'notification',
            status: 'sent',
            messageId: successfulSend.messageId,
            recipient: student.parent_telephone,
            sentBy: req.admin ? req.admin._id : null
          });
          await student.save();
        }
      }
    }
    
    return res.status(200).json({
      success: true,
      message: 'Bulk messages sent successfully',
      summary: result.summary,
      results: result.results
    });
  } catch (error) {
    console.error('Error sending bulk messages:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to send bulk messages',
      error: error.message
    });
  }
};

/**
 * Send an attendance notification to a student's parent
 */
export const sendAttendanceNotification = async (studentId, status, timestamp) => {
  try {
    // Check WhatsApp client status
    const clientState = getClientState();
    if (!clientState.isReady) {
      console.log('WhatsApp service not ready');
      return { 
        success: false, 
        error: 'WhatsApp service not ready',
        code: 'CLIENT_NOT_READY'
      };
    }
    
    // Find student by ID
    const student = await Student.findById(studentId);
    if (!student) {
      console.log(`Student not found with ID: ${studentId}`);
      return { 
        success: false, 
        error: 'Student not found',
        code: 'STUDENT_NOT_FOUND' 
      };
    }
    
    // Check if parent phone number exists
    if (!student.parent_telephone) {
      console.log(`No parent phone number available for student: ${student.name} (${student.indexNumber})`);
      return { 
        success: false, 
        error: 'No parent phone number available',
        code: 'NO_PHONE_NUMBER' 
      };
    }
    
    // Format status for display
    const displayStatus = status === 'entered' ? 'Entered School' : 
                         status === 'left' ? 'Left School' : 
                         status.charAt(0).toUpperCase() + status.slice(1);
    
    // Get current time if timestamp not provided
    const scanTime = timestamp || new Date();
    
    // Create student data object for WhatsApp message
    const studentData = {
      name: student.name,
      indexNumber: student.indexNumber,
      student_email: student.student_email,
      address: student.address,
      parent_telephone: student.parent_telephone,
      status: status,
      timestamp: scanTime
    };
    
    // Clean phone number
    const phoneNumber = student.parent_telephone.replace(/\s+/g, '');
    
    // Send WhatsApp message
    console.log(`Sending attendance notification to ${phoneNumber} for ${student.name}'s attendance (${displayStatus})`);
    
    // Send WhatsApp message with student data
    const result = await sendAttendanceAlert(
      phoneNumber,
      studentData,
      status,
      scanTime
    );
    
    // Log result for debugging
    if (result.success) {
      console.log(`WhatsApp notification sent successfully to ${phoneNumber} for ${student.name}'s attendance`);
    } else {
      console.error(`Failed to send WhatsApp notification to ${phoneNumber}:`, result.error || 'Unknown error');
    }
    
    return result;
  } catch (error) {
    console.error('Error sending attendance notification:', error);
    return { 
      success: false, 
      error: error.message,
      code: 'NOTIFICATION_ERROR'
    };
  }
};

export const checkPreviousDayMessages = async (req, res) => {
  try {
    await checkPreviousDayAttendance();
    res.status(200).json({
      success: true,
      message: 'Previous day attendance check completed successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Get students with their phone numbers for WhatsApp messaging
 */
export const getStudentsForMessaging = async (req, res) => {
  try {
    const { search = '', page = 1, limit = 10 } = req.query;
    
    // Build query
    const query = {};
    
    // Add search conditions if search term is provided
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { indexNumber: { $regex: search, $options: 'i' } },
        { student_email: { $regex: search, $options: 'i' } }
      ];
    }
    
    // Only include students with valid phone numbers
    query.parent_telephone = { $exists: true, $ne: null, $ne: '' };
    
    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Get students with pagination - use lean() to get plain JavaScript objects
    // This avoids triggering virtual getters that might cause errors
    const students = await Student.find(query)
      .select('_id name indexNumber parent_telephone student_email')
      .sort({ name: 1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean(); // Use lean() to get plain JavaScript objects
    
    // Get total count for pagination
    const total = await Student.countDocuments(query);
    
    return res.status(200).json({
      success: true,
      students,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error getting students for messaging:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch students',
      error: error.message
    });
  }
};

/**
 * Send a message to a specific student
 */
export const sendMessageToStudent = async (req, res) => {
  try {
    const { studentId, message, phoneNumber } = req.body;
    
    // Check WhatsApp client status
    const clientState = getClientState();
    if (!clientState.isReady) {
      return res.status(503).json({
        success: false,
        message: 'WhatsApp service not ready',
        error: clientState.error || 'Please scan the QR code to connect WhatsApp'
      });
    }
    
    if (!studentId && !phoneNumber) {
      return res.status(400).json({ 
        success: false, 
        message: 'Either studentId or phoneNumber is required' 
      });
    }
    
    let student = null;
    let recipient = phoneNumber;
    
    // If studentId is provided, get student data
    if (studentId) {
      student = await Student.findById(studentId);
      if (!student) {
        return res.status(404).json({ success: false, message: 'Student not found' });
      }
      
      // Use student's parent phone number if no specific phone is provided
      if (!phoneNumber && student.parent_telephone) {
        recipient = student.parent_telephone;
      }
    }
    
    if (!recipient) {
      return res.status(400).json({ 
        success: false, 
        message: 'No recipient phone number available' 
      });
    }

    // Send the message using sendTextMessage
    const result = await sendTextMessage(recipient, message);
    
    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: 'Failed to send WhatsApp message',
        error: result.error
      });
    }

    // If we have a student, record the message
    if (student) {
      student.messages = student.messages || [];
      student.messages.push({
        content: message,
        sentAt: new Date(),
        type: 'manual',
        status: 'sent',
        messageId: result.messageId,
        recipient: recipient,
        sentBy: req.admin ? req.admin._id : null
      });
      await student.save();
    }

    return res.status(200).json({
      success: true,
      message: 'WhatsApp message sent successfully',
      messageId: result.messageId,
      recipient: recipient,
      student: student ? {
        _id: student._id,
        name: student.name,
        indexNumber: student.indexNumber
      } : null
    });
  } catch (error) {
    console.error('WhatsApp Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to send WhatsApp message',
      error: error.message
    });
  }
};

export default {
  getWhatsAppStatus,
  setQRCodeCallback,
  getQRCode,
  refreshQRCode,
  sendQrCodeScanMessage,
  sendMessage,
  adminSendBulkMessages,
  logoutWhatsApp,
  checkPreviousDayMessages,
  getStudentsForMessaging,
  sendMessageToStudent,
  sendAttendanceNotification
};
