import Student from '../models/student.model.js';
import { sendAttendanceNotification } from '../controllers/messaging.controller.js';
import crypto from 'crypto';

/**
 * Download a student's QR code as a PNG file
 */
export const downloadQRCode = async (req, res) => {
  try {
    const { indexNumber, name, studentId } = req.query;

    let student;
    
    if (studentId) {
      student = await Student.findById(studentId);
    } else if (indexNumber && name) {
      student = await Student.findOne({ indexNumber, name });
    } else {
      return res.status(400).json({ message: 'Either studentId OR both indexNumber and name are required' });
    }

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    if (!student.qrCode) {
      return res.status(404).json({ message: 'QR code not found for this student' });
    }

    const qrCodeBuffer = Buffer.from(student.qrCode.split(',')[1], 'base64');

    res.set('Content-Type', 'image/png');
    res.set('Content-Disposition', `attachment; filename=${student.indexNumber}_qr_code.png`);

    return res.send(qrCodeBuffer);
  } catch (error) {
    console.error('Error downloading QR code:', error);
    res.status(500).json({ message: 'Error downloading QR code', error });
  }
};

/**
 * Search for a student's QR code by name or index number
 */
export const searchQRCode = async (req, res) => {
  try {
    const { name, indexNumber } = req.query;

    if (!name && !indexNumber) {
      return res.status(400).json({ message: 'Either name or indexNumber is required' });
    }

    const student = await Student.findOne({
      $or: [{ name }, { indexNumber }]
    });

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    if (!student.qrCode) {
      return res.status(404).json({ message: 'QR Code not found for this student' });
    }
   res.status(200).json({ qrCode: student.qrCode });
  } catch (error) {
    console.error('Error searching for student:', error);
    res.status(500).json({ message: 'Error searching for student', error });
  }
};

/**
 * Mark student attendance via QR code scan
 * Handles both entry and exit scans
 */
export const markAttendance = async (req, res) => {
  const { qrCodeData, deviceInfo, scanLocation } = req.body;

  if (!qrCodeData) {
    return res.status(400).json({ message: "QR code didn't scan correctly." });
  }

  try {
    let studentData = qrCodeData;
    
    if (typeof qrCodeData === 'string') {
      try {
        studentData = JSON.parse(qrCodeData);
      } catch (error) {
        return res.status(400).json({ message: "Invalid QR code data format." });
      }
    }
    
    const { indexNumber, name, id, secureHash } = studentData;

    if (!indexNumber || !name) {
      return res.status(400).json({ message: 'Student information (indexNumber and name) are required.' });
    }

    let student;
    if (id) {
      student = await Student.findById(id);
    }
    
    if (!student) {
      student = await Student.findOne({ indexNumber, name });
    }

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }
    
    if (secureHash) {
      const expectedHash = crypto.createHash('sha256')
        .update(`${student._id}${student.indexNumber}${process.env.JWT_SECRET || 'qrattend-secret'}`)
        .digest('hex').substring(0, 16);
      
      if (secureHash !== expectedHash) {
        return res.status(401).json({ 
          message: 'Invalid QR code authentication',
          studentInfo: {
            name: student.name,
            indexNumber: student.indexNumber
          }
        });
      }
    }

    const currentScanTime = new Date();
    const todayDate = currentScanTime.toISOString().split('T')[0];

    const todayAttendanceIndex = student.attendanceHistory.findIndex(
      (entry) => entry.date.toISOString().split('T')[0] === todayDate
    );

    let statusToSave;
    
    if (todayAttendanceIndex === -1) {
      statusToSave = 'entered';
    } else {
      const todayRecord = student.attendanceHistory[todayAttendanceIndex];
      
      if (todayRecord.leaveTime) {
        statusToSave = 'entered';
      } else if (todayRecord.entryTime) {
        statusToSave = 'left';
      } else {
        statusToSave = 'entered';
      }
    }
    
    const userAgent = deviceInfo || req.headers['user-agent'] || 'Unknown Device';
    const location = scanLocation || req.body.scanLocation || 'Main Entrance';
    
    await student.markAttendance(
      statusToSave, 
      null,
      userAgent,
      location
    );

    let whatsappResult = null;
    if (student.parent_telephone) {
      try {
        whatsappResult = await sendAttendanceNotification(
          student._id,
          statusToSave,
          currentScanTime
        );

        if (whatsappResult && whatsappResult.success) {
          student.messages = student.messages || [];
          student.messages.push({
            content: whatsappResult.message,
            sentAt: currentScanTime,
            type: 'attendance',
            status: 'sent',
            messageId: whatsappResult.messageId,
            recipient: student.parent_telephone
          });

          await student.save();
          console.log(`WhatsApp notification sent successfully to ${student.parent_telephone} for ${student.name}'s attendance`);
        } else {
          console.log(`Failed to send WhatsApp notification to ${student.parent_telephone}: ${whatsappResult?.error || 'Unknown error'}`);
        }
      } catch (msgError) {
        console.error('Error sending WhatsApp message:', msgError);
        whatsappResult = { success: false, error: msgError.message };
      }
    } else {
      console.log('No parent telephone number available for student:', student.indexNumber);
    }
    
    const updatedStudent = await Student.findById(student._id);
    const latestAttendanceRecord = updatedStudent.attendanceHistory.find(
      record => record.date.toISOString().split('T')[0] === todayDate
    );
    
    return res.status(200).json({
      message: `Attendance ${statusToSave === 'left' ? 'exit' : 'entry'} recorded successfully`,
      attendanceStatus: statusToSave,
      studentInfo: {
        id: student._id,
        name: student.name,
        indexNumber: student.indexNumber,
        student_email: student.student_email,
        address: student.address,
        parent_telephone: student.parent_telephone || '',
        status: statusToSave === 'left' ? 'Left Campus' : 'On Campus',
        time: currentScanTime.toLocaleTimeString('en-US', { 
          hour: '2-digit', 
          minute: '2-digit',
          hour12: true,
          timeZone: 'Asia/Colombo'
        }),
        date: currentScanTime.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric'
        }),
        messageStatus: whatsappResult?.success ? 'sent' : 'failed'
      },
      student: {
        _id: student._id,
        name: student.name,
        indexNumber: student.indexNumber,
        student_email: student.student_email,
        address: student.address,
        parent_telephone: student.parent_telephone || '',
        status: student.status
      },
      attendanceRecord: latestAttendanceRecord,
      messageDetails: whatsappResult?.success ? {
        messageId: whatsappResult.messageId,
        status: 'sent'
      } : null
    });
  } catch (error) {
    console.error('Error marking attendance:', error);
    return res.status(500).json({ 
      message: 'Error marking attendance', 
      error: error.message 
    });
  }
};

/**
 * Get student profile details
 */
export const getStudentProfile = async (req, res) => {
  try {
    // Get studentId from either params or query
    const studentId = req.params.studentId || req.query.studentId;
    
    if (!studentId) {
      return res.status(400).json({ 
        message: 'Student ID is required. Please provide it as a URL parameter or query parameter.' 
      });
    }
    
    const student = await Student.findById(studentId).select('-qrCode');
    
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    res.status(200).json({
      message: 'Student profile retrieved successfully',
      student
    });
  } catch (error) {
    console.error('Error fetching student profile:', error);
    res.status(500).json({ message: 'Error fetching student profile', error });
  }
};

/**
 * Update student profile
 */
export const updateStudentProfile = async (req, res) => {
  try {
    // Get studentId from either params or query
    const studentId = req.params.studentId || req.query.studentId;
    
    if (!studentId) {
      return res.status(400).json({ 
        message: 'Student ID is required. Please provide it as a URL parameter or query parameter.' 
      });
    }
    
    const updates = req.body;

    const student = await Student.findByIdAndUpdate(
      studentId,
      { $set: updates },
      { new: true, runValidators: true }
    ).select('-qrCode');

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    res.status(200).json({
      message: 'Student profile updated successfully',
      student
    });
  } catch (error) {
    console.error('Error updating student profile:', error);
    res.status(500).json({ message: 'Error updating student profile', error });
  }
};

/**
 * Get attendance history for a specific student
 * Can filter by date range
 */
export const getAttendanceHistory = async (req, res) => {
  try {
    // Get studentId from either params or query
    const studentId = req.params.studentId || req.query.studentId;
    
    if (!studentId) {
      return res.status(400).json({ 
        message: 'Student ID is required. Please provide it as a URL parameter or query parameter.' 
      });
    }
    
    const { startDate, endDate } = req.query;

    const query = { _id: studentId };
    if (startDate && endDate) {
      query['attendanceHistory.date'] = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    const student = await Student.findOne(query)
      .select('name indexNumber attendanceHistory')
      .sort({ 'attendanceHistory.date': -1 });

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    res.status(200).json({
      message: 'Attendance history retrieved successfully',
      student: {
        name: student.name,
        indexNumber: student.indexNumber,
        attendanceHistory: student.attendanceHistory
      }
    });
  } catch (error) {
    console.error('Error fetching attendance history:', error);
    res.status(500).json({ message: 'Error fetching attendance history', error });
  }
};

/**
 * Get dashboard statistics for attendance visualization
 * Includes metrics for present/absent students and attendance trends
 */
export const getDashboardStats = async (req, res) => {
  try {
    // Get optional date range filter
    const { startDate, endDate } = req.query;
    
    // Default to today if no date range provided
    const start = startDate ? new Date(startDate) : new Date();
    start.setHours(0, 0, 0, 0); // Start of day
    
    const end = endDate ? new Date(endDate) : new Date();
    end.setHours(23, 59, 59, 999); // End of day
    
    // Get total student count
    const totalStudents = await Student.countDocuments({ status: 'active' });
    
    // Get students present today (those with entry time records for today)
    const studentsPresent = await Student.countDocuments({
      'attendanceHistory.entryTime': { $gte: start, $lte: end },
      status: 'active'
    });
    
    // Get students absent today
    const studentsAbsent = totalStudents - studentsPresent;
    
    // Get students currently in school (entered but not left)
    const studentsInSchool = await Student.countDocuments({
      'attendanceHistory.entryTime': { $gte: start, $lte: end },
      'attendanceHistory.leaveTime': null,
      status: 'active'
    });
    
    // Get students who have left (both entered and left)
    const studentsLeft = await Student.countDocuments({
      'attendanceHistory.entryTime': { $gte: start, $lte: end },
      'attendanceHistory.leaveTime': { $ne: null },
      status: 'active'
    });
    
    // Get attendance over time (last 7 days)
    const last7Days = [];
    for (let i = 6; i >= 0; i--) {
      const day = new Date();
      day.setDate(day.getDate() - i);
      day.setHours(0, 0, 0, 0);
      
      const nextDay = new Date(day);
      nextDay.setDate(nextDay.getDate() + 1);
      
      const count = await Student.countDocuments({
        'attendanceHistory.date': { $gte: day, $lt: nextDay },
        status: 'active'
      });
      
      last7Days.push({
        date: day.toISOString().split('T')[0],
        count
      });
    }
    
    // Calculate attendance rate
    const attendanceRate = totalStudents > 0 
      ? Math.round((studentsPresent / totalStudents) * 100) 
      : 0;
    
    // Get top 5 students with highest attendance
    const topAttenders = await Student.find({ status: 'active' })
      .select('name indexNumber attendanceCount attendancePercentage')
      .sort({ attendanceCount: -1, attendancePercentage: -1 })
      .limit(5);
    
    // Return dashboard stats
    res.status(200).json({
      success: true,
      timestamp: new Date(),
      metrics: {
        totalStudents,
        studentsPresent,
        studentsAbsent,
        studentsInSchool,
        studentsLeft,
        attendanceRate
      },
      trends: {
        last7Days
      },
      topAttenders: topAttenders.map(student => ({
        name: student.name,
        indexNumber: student.indexNumber,
        attendanceCount: student.attendanceCount,
        attendancePercentage: student.attendancePercentage
      }))
    });
    
  } catch (error) {
    console.error('Error getting dashboard stats:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error retrieving dashboard statistics', 
      error: error.message 
    });
  }
};
