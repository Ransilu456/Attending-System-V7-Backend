import Student from '../models/student.model.js';
import { DateTime } from 'luxon';
import { sendAttendanceNotification } from '../controllers/messaging.controller.js';

const getDateRange = (date = new Date()) => {
  const startOfDay = DateTime.fromJSDate(new Date(date)).startOf('day').toJSDate();
  const endOfDay = DateTime.fromJSDate(new Date(date)).endOf('day').toJSDate();
  return { startOfDay, endOfDay };
};

// Auto checkout settings defaults
let autoCheckoutSettings = {
  enabled: false,
  time: '18:30',
  sendNotification: true,
  lastRun: null
};

export const markStudentAttendance = async (req, res) => {
  try {
    const { studentId, status, date, adminNote, scanLocation, deviceInfo, sendNotification } = req.body;

    if (!studentId) {
      return res.status(400).json({
        status: 'error',
        message: 'Student ID is required'
      });
    }

    // Find the student
    const student = await Student.findById(studentId);
    
    if (!student) {
      return res.status(404).json({
        status: 'error',
        message: 'Student not found'
      });
    }

    // Valid status values
    const validStatus = ['entered', 'left', 'present', 'absent'];
    
    if (!validStatus.includes(status)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid status. Must be one of: entered, left, present, absent'
      });
    }

    // Mark attendance with the provided status
    await student.markAttendance(
      status, 
      req.user?._id || null, 
      deviceInfo || 'Manual entry by admin',
      scanLocation || 'Admin Portal'
    );

    // If notification is requested, send WhatsApp message
    if (sendNotification !== false && student.parent_telephone) {
      try {
        // Include additional info
        const attendanceData = {
          id: student._id,
          name: student.name,
          indexNumber: student.indexNumber,
          status,
          timestamp: new Date(),
          entryTime: new Date(),
          student_email: student.student_email,
          parent_telephone: student.parent_telephone,
          parent_email: student.parent_email,
          address: student.address
        };

        // Use the messaging service to send notification
        await sendAttendanceNotification(student._id, status, new Date());
        
        console.log(`WhatsApp notification sent to ${student.parent_telephone}`);
      } catch (notificationError) {
        console.error('Error sending WhatsApp notification:', notificationError);
        // Continue even if notification fails
      }
    }

    return res.status(200).json({
      status: 'success',
      message: `Student ${status === 'entered' ? 'checked in' : status === 'left' ? 'checked out' : 'marked as ' + status} successfully`,
      data: {
        student: {
          id: student._id,
          name: student.name,
          indexNumber: student.indexNumber,
          status: student.status,
          lastAttendance: student.lastAttendance
        }
      }
    });
  } catch (error) {
    console.error('Error marking student attendance:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to mark attendance',
      error: error.message
    });
  }
};

// Configure auto checkout settings
export const configureAutoCheckout = async (req, res) => {
  try {
    const { enabled, time, sendNotification } = req.body;
    
    // Validate time format (HH:MM)
    if (time && !/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(time)) {
      return res.status(400).json({ 
        status: 'error',
        message: 'Invalid time format. Must be in HH:MM format (24-hour)'
      });
    }
    
    // Update settings
    autoCheckoutSettings = {
      ...autoCheckoutSettings,
      enabled: enabled !== undefined ? enabled : autoCheckoutSettings.enabled,
      time: time || autoCheckoutSettings.time,
      sendNotification: sendNotification !== undefined ? sendNotification : autoCheckoutSettings.sendNotification
    };
    
    return res.status(200).json({
      status: 'success',
      message: 'Auto checkout settings updated successfully',
      data: autoCheckoutSettings
    });
  } catch (error) {
    console.error('Error configuring auto checkout:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to configure auto checkout',
      error: error.message
    });
  }
};

// Get auto checkout settings
export const getAutoCheckoutSettings = async (req, res) => {
  try {
    return res.status(200).json({
      status: 'success',
      data: autoCheckoutSettings
    });
  } catch (error) {
    console.error('Error getting auto checkout settings:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to get auto checkout settings',
      error: error.message
    });
  }
};

// Run auto checkout for all students who haven't checked out
export const runAutoCheckout = async (req, res) => {
  try {
    // Get current date
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Get all students who checked in today but didn't check out
    const students = await Student.find({
      'attendanceHistory.date': {
        $gte: today
      },
      'attendanceHistory.status': 'entered',
      'attendanceHistory.leaveTime': null
    });
    
    console.log(`Found ${students.length} students who need auto checkout`);
    
    let processed = 0;
    let failed = 0;
    
    // Process each student
    for (const student of students) {
      try {
        // Find today's attendance record
        const todayRecord = student.attendanceHistory.find(record => {
          const recordDate = new Date(record.date);
          recordDate.setHours(0, 0, 0, 0);
          return recordDate.getTime() === today.getTime() && 
                 record.status === 'entered' && 
                 !record.leaveTime;
        });
        
        if (todayRecord) {
          // Mark the student as left
          await student.markAttendance(
            'left',
            req.user?._id || null,
            'Auto checkout system',
            'Auto Checkout'
          );
          
          // Send notification if enabled
          if (autoCheckoutSettings.sendNotification && student.parent_telephone) {
            try {
              await sendAttendanceNotification(
                student._id,
                'left', 
                new Date()
              );
            } catch (notificationError) {
              console.error(`Error sending auto checkout notification to ${student.name}:`, notificationError);
            }
          }
          
          processed++;
        }
      } catch (studentError) {
        console.error(`Error processing auto checkout for student ${student.name}:`, studentError);
        failed++;
      }
    }
    
    // Update last run timestamp
    autoCheckoutSettings.lastRun = new Date();
    
    return res.status(200).json({
      status: 'success',
      message: `Auto checkout completed: ${processed} students processed, ${failed} failed`,
      data: {
        processed,
        failed,
        timestamp: new Date()
      }
    });
  } catch (error) {
    console.error('Error running auto checkout:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to run auto checkout',
      error: error.message
    });
  }
};

export const getScannedStudentsToday = async (req, res) => {
  try {
    // Get today's date range (from start of day to current time)
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    
    // Get all active students first
    const allStudents = await Student.find({ status: 'active' })
      .select('_id name firstName lastName indexNumber status email student_email parent_email parent_telephone class attendanceHistory')
      .sort('indexNumber')
      .lean();
    
    // Set today's date boundaries
    const endOfDay = new Date(today);
    endOfDay.setUTCHours(23, 59, 59, 999);
    
    // Create a map of student attendance
    const studentAttendanceMap = {};
    
    // Process each student's attendance history to find today's records
    allStudents.forEach(student => {
      const studentId = student._id.toString();
      
      // Filter attendance records for today
      const todayAttendance = (student.attendanceHistory || []).filter(record => {
        const recordDate = new Date(record.date);
        return recordDate >= today && recordDate <= endOfDay;
      });
      
      if (todayAttendance.length > 0) {
        // Sort by timestamp descending to get the latest record first
        todayAttendance.sort((a, b) => new Date(b.date) - new Date(a.date));
        
        // Start with the latest record as the base
        studentAttendanceMap[studentId] = {
          status: todayAttendance[0].status,
          timestamp: todayAttendance[0].date
        };
        
        // Find entry and exit times from all of today's records
        todayAttendance.forEach(record => {
          // Track entry time (from 'entered' record or explicitly set entryTime)
          if (record.status === 'entered' || record.entryTime) {
            if (!studentAttendanceMap[studentId].entryTime) {
              studentAttendanceMap[studentId].entryTime = record.entryTime || record.date;
            }
          }
          
          // Track leave time (from 'left' record or explicitly set leaveTime)
          if (record.status === 'left' || record.leaveTime) {
            if (!studentAttendanceMap[studentId].leaveTime) {
              studentAttendanceMap[studentId].leaveTime = record.leaveTime || record.date;
            }
          }
        });
      }
    });
    
    // Process students with their attendance status
    const students = allStudents.map(student => {
      const studentId = student._id.toString();
      const attendance = studentAttendanceMap[studentId];
      
      if (!attendance) {
        // Student has no attendance record for today
      return {
          ...student,
          status: 'absent',
          entryTime: null,
          leaveTime: null
        };
      }
      
      return {
        ...student,
        status: attendance.status,
        entryTime: attendance.entryTime || attendance.timestamp,
        leaveTime: attendance.leaveTime
      };
    });

    // Calculate statistics
    const totalCount = students.length;
    const presentCount = students.filter(s => s.status === 'entered').length;
    const leftCount = students.filter(s => s.status === 'left').length;
    const absentCount = students.filter(s => s.status === 'absent').length;

    res.status(200).json({
      status: 'success',
      message: 'Today\'s attendance data retrieved successfully',
      students,
      totalCount,
      presentCount,
      leftCount,
      absentCount
    });
  } catch (error) {
    console.error('Error in getScannedStudentsToday:', error);
    res.status(500).json({ 
      status: 'error',
      message: 'Failed to retrieve today\'s attendance data',
      error: error.message 
    });
  }
};

export const getAttendanceByDate = async (req, res) => {
  try {
    // Get date from params, expecting YYYY-MM-DD format
    const { date } = req.params;
    
    if (!date) {
      return res.status(400).json({ 
        status: 'error',
        message: 'Date parameter is required in YYYY-MM-DD format' 
      });
    }

    // Validate date format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
      return res.status(400).json({ 
        status: 'error',
        message: 'Invalid date format. Please use YYYY-MM-DD format' 
      });
    }

    const { startOfDay, endOfDay } = getDateRange(date);
    
    const students = await Student.find({
      "attendanceHistory": {
        $elemMatch: {
          date: {
            $gte: startOfDay,
            $lt: endOfDay
          }
        }
      }
    }).select('name indexNumber student_email attendanceHistory');

    if (!students || students.length === 0) {
      return res.status(200).json({
        status: 'success',
        message: "No attendance records found for the specified date",
        data: {
          students: [],
          stats: {
            totalCount: 0,
            presentCount: 0,
            absentCount: 0,
            lateCount: 0
          }
        }
      });
    }

    const processedStudents = students.map(student => {
      const dateAttendance = student.attendanceHistory.find(record => {
        const recordDate = DateTime.fromJSDate(record.date);
        const targetDate = DateTime.fromJSDate(startOfDay);
        return recordDate.hasSame(targetDate, 'day');
      });

      return {
        id: student._id,
        name: student.name,
        indexNumber: student.indexNumber.toUpperCase(),
        email: student.student_email,
        status: dateAttendance?.status || 'absent',
        entryTime: dateAttendance?.entryTime || null,
        leaveTime: dateAttendance?.leaveTime || null
      };
    });

    const stats = processedStudents.reduce((acc, student) => {
      acc.totalCount++;
      switch(student.status) {
        case 'present':
        case 'entered':
          acc.presentCount++;
          break;
        case 'late':
          acc.lateCount++;
          break;
        case 'absent':
          acc.absentCount++;
          break;
      }
      return acc;
    }, { totalCount: 0, presentCount: 0, absentCount: 0, lateCount: 0 });

    res.status(200).json({
      status: 'success',
      message: "Attendance records fetched successfully",
      data: {
        students: processedStudents,
        stats
      }
    });

  } catch (error) {
    console.error(`Error fetching attendance by date: ${error.message}`);
    res.status(500).json({ 
      status: 'error',
      message: 'Error fetching attendance records',
      error: error.message 
    });
  }
};

export const clearStudentAttendanceHistory = async (req, res) => {
  try {
    const { studentId } = req.params;
    
    if (!studentId) {
      return res.status(400).json({
        status: 'error',
        message: 'Student ID is required'
      });
    }

    // Find the student
    const student = await Student.findById(studentId);
    
    if (!student) {
      return res.status(404).json({
        status: 'error',
        message: 'Student not found'
      });
    }

    // Save original count for response
    const originalCount = student.attendanceHistory.length;
    
    // Use the new model method to clear attendance history
    await student.clearAttendanceHistory();
    
    return res.status(200).json({
      status: 'success',
      message: `Successfully cleared ${originalCount} attendance records`,
      data: {
        student: {
          id: student._id,
          name: student.name,
          indexNumber: student.indexNumber,
          attendanceHistory: [],
          attendanceCount: 0
        }
      }
    });
  } catch (error) {
    console.error('Error clearing student attendance history:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to clear attendance history',
      error: error.message
    });
  }
};

export const deleteAttendanceRecord = async (req, res) => {
  try {
    const { studentId, recordId } = req.params;
    
    if (!studentId || !recordId) {
      return res.status(400).json({
        status: 'error',
        message: 'Student ID and attendance record ID are required'
      });
    }

    // Find the student
    const student = await Student.findById(studentId);
    
    if (!student) {
      return res.status(404).json({
        status: 'error',
        message: 'Student not found'
      });
    }
    
    // Use the new model method to delete the record
    try {
      const { deletedRecord, updatedStudent } = await student.deleteAttendanceRecord(recordId);
      
      return res.status(200).json({
        status: 'success',
        message: 'Successfully deleted attendance record',
        data: {
          deletedRecord: {
            id: deletedRecord._id,
            date: deletedRecord.date,
            status: deletedRecord.status
          },
          student: {
            id: updatedStudent._id,
            name: updatedStudent.name,
            indexNumber: updatedStudent.indexNumber,
            attendanceCount: updatedStudent.attendanceCount,
            attendancePercentage: updatedStudent.attendancePercentage,
            attendanceHistoryCount: updatedStudent.attendanceHistory.length
          }
        }
      });
    } catch (modelError) {
      return res.status(404).json({
        status: 'error',
        message: modelError.message
      });
    }
  } catch (error) {
    console.error('Error deleting attendance record:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to delete attendance record',
      error: error.message
    });
  }
};

export const getStudentAttendanceHistory = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { startDate, endDate, limit, offset, sortBy, sortOrder } = req.query;
    
    if (!studentId) {
      return res.status(400).json({
        status: 'error',
        message: 'Student ID is required'
      });
    }

    // Find the student
    const student = await Student.findById(studentId);
    
    if (!student) {
      return res.status(404).json({
        status: 'error',
        message: 'Student not found'
      });
    }
    
    // Use the new model method to get filtered attendance history
    const { records, totalRecords, stats } = student.getFilteredAttendanceHistory({
      startDate,
      endDate,
      limit,
      offset,
      sortBy,
      sortOrder
    });
    
    // Return the attendance history
    return res.status(200).json({
      status: 'success',
      data: {
        student: {
          id: student._id,
          name: student.name,
          indexNumber: student.indexNumber,
          email: student.student_email
        },
        attendanceHistory: records,
        totalRecords,
        stats
      }
    });
  } catch (error) {
    console.error('Error fetching student attendance history:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to fetch attendance history',
      error: error.message
    });
  }
};

export default {
  markStudentAttendance,
  configureAutoCheckout,
  getAutoCheckoutSettings,
  runAutoCheckout,
  getScannedStudentsToday,
  getAttendanceByDate,
  clearStudentAttendanceHistory,
  deleteAttendanceRecord,
  getStudentAttendanceHistory
}; 