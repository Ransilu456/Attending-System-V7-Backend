// controllers/report.controller.js
import ExcelJS from 'exceljs';
import { parseMongoDate, formatTimeFromDate, calculateDuration } from '../utils/dateUtils.js';
import Student from '../models/student.model.js';
import { logInfo, logError } from '../utils/terminal.js';

/**
 * Generate daily attendance report in Excel format
 * Creates a detailed report of student attendance for a specific day
 */
export const generateDailyAttendanceReport = async (req, res) => {
  try {
    const { date, preserveFormat, handleTimestamps } = req.query;
    
    if (!date) {
      return res.status(400).json({ 
        success: false, 
        message: 'Date is required',
        error: 'missing_date'
      });
    }

    // Parse date
    const reportDate = new Date(date);
    reportDate.setHours(0, 0, 0, 0);
    
    // Validate date format
    if (isNaN(reportDate.getTime())) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid date format. Please use YYYY-MM-DD format.',
        error: 'invalid_date_format'
      });
    }
    
    // Check if date is in the future
    if (reportDate > new Date()) {
      return res.status(400).json({ 
        success: false, 
        message: 'Cannot generate reports for future dates',
        error: 'future_date'
      });
    }

    // Check headers for format preferences
    const useSingleRecordPerDay = req.headers['attendance-model'] === 'single-record-per-day';
    const preserveTimeFormat = req.headers['time-format'] === 'preserve-null' || preserveFormat === 'true';
    const handleMongoDBTimestamps = handleTimestamps === 'true';

    // Find all students
    const students = await Student.find()
      .select('name indexNumber student_email attendanceHistory status')
      .sort({ indexNumber: 1 });

    if (!students || students.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'No students found',
        error: 'no_students'
      });
    }

    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'QR Attend System V2';
    workbook.created = new Date();
    
    // Add a worksheet
    const worksheet = workbook.addWorksheet('Attendance Report');
    
    // Set up title
    worksheet.mergeCells('A1:G1');
    const titleCell = worksheet.getCell('A1');
    titleCell.value = 'Attendance Report';
    titleCell.font = { size: 16, bold: true };
    titleCell.alignment = { horizontal: 'center' };
    
    // Add report generation info
    worksheet.mergeCells('A2:G2');
    const infoCell = worksheet.getCell('A2');
    infoCell.value = `Generated on: ${new Date().toLocaleString('en-US', { 
      timeZone: 'Asia/Kolkata',
      hour12: true,
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })} GMT+5:30`;
    infoCell.font = { size: 10, italic: true };
    infoCell.alignment = { horizontal: 'center' };
    
    // Set up header row with formatting
    worksheet.addRow([]);  // Empty row for spacing
    const headerRow = worksheet.addRow([
      'Student Name',
      'Index Number',
      'Email',
      'Status',
      'Entry Time',
      'Leave Time',
      'Duration'
    ]);
    
    // Style the header row
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = {
      type: 'pattern',
      pattern: 'solid',
        fgColor: { argb: 'FF4472C4' }
      };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });
    
    // Initialize counters
    const startingRow = 5;  // Accounting for title, info, spacing, and header rows
    let totalRecords = 0;
    let presentCount = 0;
    let absentCount = 0;
    let leftCount = 0;
    let lateCount = 0;
    
    // Helper to find attendance record for a specific date
    const findAttendanceRecord = (student) => {
      // Use parseMongoDate to properly handle MongoDB date format
      const attendanceRecord = student.attendanceHistory.find(record => {
        const recordDate = parseMongoDate(record.date);
        if (!recordDate) {
          return false;
        }
        
        // Reset time to start of day for comparison
        recordDate.setHours(0, 0, 0, 0);
        return recordDate.getTime() === reportDate.getTime();
      });
      
      return attendanceRecord;
    };
    
    // Process each student
    students.forEach((student, index) => {
      totalRecords++;
      
      // Find the student's attendance record for the report date
      const attendanceRecord = findAttendanceRecord(student);
      
      let status = 'Absent';
      let entryTime = null;
      let leaveTime = null;
      let duration = null;
      
      if (attendanceRecord) {
        // Use values from the attendance record
        entryTime = attendanceRecord.entryTime;
        leaveTime = attendanceRecord.leaveTime;
        
        // Format the status based on the attendance record
        if (attendanceRecord.status === 'entered') {
          status = 'Present';
        } else if (attendanceRecord.status === 'left') {
          status = 'Left';
        } else if (attendanceRecord.status === 'late') {
          status = 'Late';
          lateCount++;
        } else {
          status = attendanceRecord.status || 'Absent';
        }
        
        presentCount++;
      } else {
        absentCount++;
      }
      
      // Format times for display, handling MongoDB date formats
      const formattedEntryTime = entryTime ? formatTimeFromDate(entryTime, preserveTimeFormat) : 'N/A';
      const formattedLeaveTime = leaveTime ? formatTimeFromDate(leaveTime, preserveTimeFormat) : 'N/A';
      
      // Calculate duration if entry and leave times are available
      if (entryTime && leaveTime) {
        duration = calculateDuration(entryTime, leaveTime);
      } else {
        duration = 'N/A';
      }
      
      // Add the student data to the worksheet
      const dataRow = worksheet.addRow([
        student.name,
        student.indexNumber,
        student.student_email,
        status,
        formattedEntryTime,
        formattedLeaveTime,
        duration
      ]);
      
      // Apply styles to the data row
      dataRow.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      });
      
      // Apply conditional formatting based on status
      const statusCell = dataRow.getCell(4);
      if (status === 'Present') {
        statusCell.fill = {
              type: 'pattern',
              pattern: 'solid',
          fgColor: { argb: 'FF92D050' } // Green
            };
      } else if (status === 'Absent') {
        statusCell.fill = {
              type: 'pattern',
              pattern: 'solid',
          fgColor: { argb: 'FFFF0000' } // Red
        };
        statusCell.font = { color: { argb: 'FFFFFFFF' } };
      } else if (status === 'Late') {
        statusCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFFC000' } // Yellow/Orange
        };
      } else if (status === 'Left') {
        statusCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF00B0F0' } // Blue
        };
      }
      
      // Zebra striping for rows
      if (index % 2 !== 0) {
        dataRow.eachCell((cell) => {
          if (!cell.fill || !cell.fill.fgColor) {
            cell.fill = {
          type: 'pattern',
          pattern: 'solid',
              fgColor: { argb: 'FFF5F5F5' } // Light gray background
            };
          }
        });
      }
    });
    
    // Add summary section
    worksheet.addRow([]);
    worksheet.addRow(['Summary', '', '', '', '', '', '']);
    worksheet.addRow(['Total Students', totalRecords, '', '', '', '', '']);
    worksheet.addRow(['Present', presentCount, '', '', '', '', '']);
    worksheet.addRow(['Absent', absentCount, '', '', '', '', '']);
    worksheet.addRow(['Late', lateCount, '', '', '', '', '']);
    worksheet.addRow(['Left Early', leftCount, '', '', '', '', '']);
    
    // Format the summary section
    for (let i = 0; i < 6; i++) {
      const row = worksheet.getRow(startingRow + students.length + 1 + i);
      if (i === 0) {
        const cell = row.getCell(1);
        cell.font = { bold: true, size: 12 };
      } else {
        const label = row.getCell(1);
        const value = row.getCell(2);
        label.font = { bold: true };
        value.alignment = { horizontal: 'center' };
      }
    }
    
    // Calculate attendance percentage
    const percentagePresent = totalRecords > 0 ? (presentCount / totalRecords) * 100 : 0;
    worksheet.addRow(['Attendance Percentage', `${percentagePresent.toFixed(2)}%`, '', '', '', '', '']);
    const percentageRow = worksheet.lastRow;
    percentageRow.getCell(1).font = { bold: true };
    percentageRow.getCell(2).alignment = { horizontal: 'center' };
    
    // Auto-size columns
    worksheet.columns.forEach(column => {
      column.width = 20;
    });
    
    // Generate a unique file name based on the date
    const formattedDate = reportDate.toISOString().split('T')[0];
    const fileName = `attendance_report_${formattedDate}.xlsx`;
    
    // Set content type and disposition
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    
    // Write to response
    await workbook.xlsx.write(res);
    
    logInfo(`Generated daily attendance report for ${date}`);
  } catch (err) {
    console.error('Error generating report:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Error generating report',
      error: err.message
    });
  }
};

/**
 * Generate a summary report for all students for a date range
 * Includes attendance statistics and percentages
 */
export const generateStudentSummaryReport = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({ 
        success: false, 
        message: 'Start date and end date are required' 
      });
    }

    // Parse dates
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    // Validate date range
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid date format. Please use YYYY-MM-DD format.' 
      });
    }
    
    if (start > end) {
      return res.status(400).json({ 
        success: false, 
        message: 'Start date must be before end date' 
      });
    }

    // Find all students
    const students = await Student.find()
      .select('name indexNumber age status attendanceHistory attendanceCount attendancePercentage')
      .sort({ indexNumber: 1 });

    if (!students || students.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'No students found' 
      });
    }

    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'QR Attend System V2';
    workbook.created = new Date();
    
    // Add worksheet
    const worksheet = workbook.addWorksheet('Student Summary');
    
    // Set up header row
    worksheet.columns = [
      { header: 'Index Number', key: 'indexNumber', width: 15 },
      { header: 'Name', key: 'name', width: 30 },
      { header: 'Age', key: 'age', width: 10 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Total Days Present', key: 'daysPresent', width: 15 },
      { header: 'Total Days Absent', key: 'daysAbsent', width: 15 },
      { header: 'Attendance %', key: 'attendancePercentage', width: 15 },
      { header: 'Avg. Hours per Day', key: 'avgHours', width: 15 },
      { header: 'Last Attendance', key: 'lastAttendance', width: 20 }
    ];
    
    // Style header row
    worksheet.getRow(1).font = { bold: true, size: 12 };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFD3D3D3' }
    };
    
    // Calculate the number of business days in the date range
    const totalDays = getBusinessDaysBetweenDates(start, end);
    
    // Add data rows for each student
    let rowCount = 1;
    students.forEach(student => {
      // Filter attendance records for the specified date range
      const attendanceRecords = student.attendanceHistory.filter(record => {
        const recordDate = new Date(record.date);
        return recordDate >= start && recordDate <= end;
      });
      
      // Count unique days present
      const uniqueDaysPresent = new Set();
      let totalHours = 0;
      
      attendanceRecords.forEach(record => {
        if (record.entryTime) {
          // Extract the date part only for uniqueness check
          const dateString = new Date(record.date).toDateString();
          uniqueDaysPresent.add(dateString);
          
          // Calculate hours if both entry and leave times exist
          if (record.entryTime && record.leaveTime) {
            const entryTime = new Date(record.entryTime);
            const leaveTime = new Date(record.leaveTime);
            const durationHours = (leaveTime - entryTime) / (1000 * 60 * 60);
            totalHours += durationHours;
          }
        }
      });
      
      const daysPresent = uniqueDaysPresent.size;
      const daysAbsent = totalDays - daysPresent;
      const attendancePercentage = totalDays > 0 ? ((daysPresent / totalDays) * 100).toFixed(2) : 0;
      const avgHoursPerDay = daysPresent > 0 ? (totalHours / daysPresent).toFixed(2) : 0;
      
      // Format last attendance date
      const lastAttendance = student.lastAttendance 
        ? new Date(student.lastAttendance).toLocaleString() 
        : 'Never';
      
      rowCount++;
      worksheet.addRow({
        indexNumber: student.indexNumber,
        name: student.name,
        age: student.age || 'N/A',
        status: student.status,
        daysPresent: daysPresent,
        daysAbsent: daysAbsent,
        attendancePercentage: `${attendancePercentage}%`,
        avgHours: avgHoursPerDay,
        lastAttendance: lastAttendance
      });
      
      // Add conditional formatting for attendance percentage
      const percentCell = worksheet.getCell(`G${rowCount}`);
      const percentage = parseFloat(attendancePercentage);
      
      if (percentage >= 90) {
        percentCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF90EE90' } // Light green
        };
      } else if (percentage >= 75) {
        percentCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFFD700' } // Gold
        };
      } else {
        percentCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFF6347' } // Tomato
        };
      }
      
      // Highlight inactive students
      if (student.status !== 'active') {
        worksheet.getCell(`D${rowCount}`).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFA9A9A9' } // Dark gray
        };
      }
    });
    
    // Write workbook to response
    const buffer = await workbook.xlsx.writeBuffer();
    
    // Set headers for file download
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=student_summary_${startDate}_to_${endDate}.xlsx`);
    
    logInfo(`Generated student summary report from ${startDate} to ${endDate}`);
    res.send(buffer);
    
  } catch (error) {
    logError(`Error generating student summary report: ${error.message}`);
    res.status(500).json({ 
      success: false, 
      message: 'Error generating student summary report', 
      error: error.message 
    });
  }
};

export const generateMonthlyAnalysisReport = async (req, res) => {
  try {
    // Accept either year/month or startDate/endDate
    const { year, month, startDate, endDate } = req.query;
    
    let start, end;
    
    if (startDate && endDate) {
      // Use date range if provided
      start = new Date(startDate);
      end = new Date(endDate);
      
      // Validate date format
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return res.status(400).json({ 
          success: false, 
          message: 'Invalid date format. Please use YYYY-MM-DD format.' 
        });
      }
      
      if (start > end) {
        return res.status(400).json({ 
          success: false, 
          message: 'Start date must be before end date' 
        });
      }
    } else if (year && month) {
      // Use year and month if provided
      const yearNum = parseInt(year);
      const monthNum = parseInt(month);
      
      if (isNaN(yearNum) || isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
        return res.status(400).json({ 
          success: false, 
          message: 'Invalid year or month. Month must be between a 1 and 12.' 
        });
      }
      
      // Calculate start and end dates for the month
      start = new Date(yearNum, monthNum - 1, 1);
      end = new Date(yearNum, monthNum, 0); // Last day of the month
    } else {
      return res.status(400).json({ 
        success: false, 
        message: 'Either year/month or startDate/endDate parameters are required' 
      });
    }
    
    // Find all active students
    const students = await Student.find({ status: 'active' })
      .select('name indexNumber age attendanceHistory')
      .sort({ indexNumber: 1 });

    if (!students || students.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'No active students found' 
      });
    }

    // Create a new Excel workbook
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'QR Attend System V2';
    workbook.created = new Date();
    
    // Add a worksheet for the monthly calendar view
    const worksheet = workbook.addWorksheet('Monthly Calendar');
    
    // Get number of days in the date range
    const daysDiff = Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1;
    
    // Prepare headers with day numbers
    const headers = [
      { header: 'Index Number', key: 'indexNumber', width: 15 },
      { header: 'Name', key: 'name', width: 25 },
      { header: 'Age', key: 'age', width: 10 },
    ];
    
    // Add a column for each day in the range
    for (let i = 0; i < daysDiff; i++) {
      const date = new Date(start);
      date.setDate(date.getDate() + i);
      const day = date.getDate();
      const dayOfWeek = date.toLocaleDateString('en-US', { weekday: 'short' });
      const dayHeader = `${day} (${dayOfWeek})`;
      
      headers.push({
        header: dayHeader,
        key: `day${i}`,
        width: 10
      });
    }
    
    // Add summary columns
    headers.push(
      { header: 'Present', key: 'presentDays', width: 10 },
      { header: 'Absent', key: 'absentDays', width: 10 },
      { header: '%', key: 'percentage', width: 8 }
    );
    
    worksheet.columns = headers;
    
    // Style the header row
    worksheet.getRow(1).font = { bold: true, size: 12 };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFD3D3D3' }
    };
    
    // Helper to check if date is a weekend
    const isWeekend = (date) => {
      const day = date.getDay();
      return day === 0 || day === 6; // 0 is Sunday, 6 is Saturday
    };
    
    // Mark weekend columns with different color (but still count them)
    for (let i = 0; i < daysDiff; i++) {
      const date = new Date(start);
      date.setDate(date.getDate() + i);
      if (isWeekend(date)) {
        const colIndex = i + 3; // Offset for index, name columns
        worksheet.getColumn(colIndex).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF0F0F0' } // Light gray for weekend days
        };
      }
    }
    
    // Add data for each student
    students.forEach((student, index) => {
      const rowData = {
        indexNumber: student.indexNumber,
        name: student.name,
        age: student.age || 'N/A',
        presentDays: 0,
        absentDays: 0,
        percentage: '0%'
      };
      
      // Initialize attendance status for each day
      for (let i = 0; i < daysDiff; i++) {
        rowData[`day${i}`] = '';
      }
      
      // Map attendance data to days
      student.attendanceHistory.forEach(record => {
        const recordDate = new Date(record.date);
        
        // Check if record falls within the date range
        if (recordDate >= start && recordDate <= end) {
          // Calculate the day index in our date range
          const dayIndex = Math.floor((recordDate - start) / (1000 * 60 * 60 * 24));
          
          // Mark as present if there's an entry time
          if (record.entryTime) {
            rowData[`day${dayIndex}`] = '✓';
            rowData.presentDays++;
          }
        }
      });
      
      // Calculate absent days (including weekends)
      for (let i = 0; i < daysDiff; i++) {
        if (!rowData[`day${i}`]) {
          rowData[`day${i}`] = '✗';
          rowData.absentDays++;
        }
      }
      
      // Calculate attendance percentage for all days
      const attendancePercentage = daysDiff > 0 
        ? ((rowData.presentDays / daysDiff) * 100).toFixed(2) 
        : 0;
      rowData.percentage = `${attendancePercentage}%`;
      
      // Add the row to the worksheet
      const row = worksheet.addRow(rowData);
      
      // Apply conditional formatting for present/absent
      for (let i = 0; i < daysDiff; i++) {
        const cellValue = rowData[`day${i}`];
        const cellRef = row.getCell(i + 4); // Offset for index, name, age
        
        if (cellValue === '✓') {
          cellRef.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF90EE90' } // Light green for present
          };
        } else if (cellValue === '✗') {
          cellRef.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFF6347' } // Tomato for absent
          };
        }
      }
    });
    
    // Generate Excel file
    const buffer = await workbook.xlsx.writeBuffer();
    
    // Format date range for filename
    const formattedStartDate = start.toISOString().split('T')[0];
    const formattedEndDate = end.toISOString().split('T')[0];
    
    // Set headers for file download
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=monthly_report_${formattedStartDate}_to_${formattedEndDate}.xlsx`);
    
    logInfo(`Generated monthly attendance report for period ${formattedStartDate} to ${formattedEndDate}`);
    res.send(buffer);
    
  } catch (error) {
    logError(`Error generating monthly report: ${error.message}`);
    res.status(500).json({ 
      success: false, 
      message: 'Error generating monthly report', 
      error: error.message 
    });
  }
};

function getBusinessDaysBetweenDates(startDate, endDate) {
  let count = 0;
  const currentDate = new Date(startDate);
  
  while (currentDate <= endDate) {
    // Count all days including weekends
    count++;
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  return count;
}

export const generateWeeklyAttendanceReport = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    // Parse dates
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    // Set time to start and end of day
    start.setUTCHours(0, 0, 0, 0);
    end.setUTCHours(23, 59, 59, 999);
    
    // Get all active students
    const students = await Student.find({ status: 'active' })
      .select('_id name indexNumber student_email status attendanceHistory')
      .sort('indexNumber')
      .lean();
    
    if (!students || students.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No active students found',
        error: 'no_students'
      });
    }
    
    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Attendance System';
    workbook.lastModifiedBy = 'Report Generator';
    workbook.created = new Date();
    workbook.modified = new Date();
    
    // Add worksheet
    const worksheet = workbook.addWorksheet('Weekly Attendance');
    
    // Format title and info
    worksheet.mergeCells('A1:G1');
    const titleCell = worksheet.getCell('A1');
    titleCell.value = 'Weekly Attendance Report';
    titleCell.font = { bold: true, size: 16 };
    titleCell.alignment = { horizontal: 'center' };
    
    worksheet.mergeCells('A2:G2');
    const infoCell = worksheet.getCell('A2');
    infoCell.value = `Period: ${startDate} to ${endDate}`;
    infoCell.font = { size: 12 };
    infoCell.alignment = { horizontal: 'center' };
    
    // Set up header row
    worksheet.addRow([]);  // Empty row for spacing
    const headerRow = worksheet.addRow([
      'Student Name',
      'Index Number',
      'Email',
      'Days Present',
      'Days Absent',
      'Late Days',
      'Attendance Rate (%)'
    ]);
    
    // Style the header row
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4472C4' }
      };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });
    
    // Get total days in the date range
    const daysDiff = Math.floor((end - start) / (1000 * 60 * 60 * 24)) + 1;
    
    // Generate array of dates in the range
    const dateArray = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      dateArray.push(new Date(d));
    }
    
    // Process each student's attendance
    students.forEach((student, index) => {
      // Initialize counters
      let presentDays = 0;
      let absentDays = 0;
      let lateDays = 0;
      
      // Process attendance for each date in range
      dateArray.forEach(date => {
        const dateStartTime = new Date(date);
        dateStartTime.setUTCHours(0, 0, 0, 0);
        
        const dateEndTime = new Date(date);
        dateEndTime.setUTCHours(23, 59, 59, 999);
        
        // Check for attendance record on this date
        const attendanceRecord = student.attendanceHistory?.find(record => {
          const recordDate = parseMongoDate(record.date);
          if (!recordDate) return false;
          
          recordDate.setUTCHours(0, 0, 0, 0);
          return recordDate.getTime() === dateStartTime.getTime();
        });
        
        if (attendanceRecord) {
          presentDays++;
          
          // Check if the student was late
          if (attendanceRecord.status === 'late' || 
              (attendanceRecord.entryTime && isEntryLate(attendanceRecord.entryTime))) {
            lateDays++;
          }
        } else {
          absentDays++;
        }
      });
      
      // Calculate attendance rate
      const attendanceRate = daysDiff > 0 ? (presentDays / daysDiff) * 100 : 0;
      
      // Add the data row
      const dataRow = worksheet.addRow([
        student.name || 'N/A',
        student.indexNumber || 'N/A',
        student.student_email || 'N/A',
        presentDays,
        absentDays,
        lateDays,
        `${attendanceRate.toFixed(1)}%`
      ]);
      
      // Apply styles to the data row
      dataRow.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      });
      
      // Apply conditional formatting to attendance rate
      const rateCell = dataRow.getCell(7);
      if (attendanceRate >= 90) {
        rateCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF92D050' } // Green
        };
      } else if (attendanceRate >= 75) {
        rateCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFFC000' } // Yellow
        };
      } else {
        rateCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFF0000' } // Red
        };
        rateCell.font = { color: { argb: 'FFFFFFFF' } };
      }
      
      // Zebra striping for rows
      if (index % 2 !== 0) {
        dataRow.eachCell((cell, colIndex) => {
          if (colIndex !== 7) { // Skip attendance rate cell which has its own color
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFF5F5F5' } // Light gray
            };
          }
        });
      }
    });
    
    // Add summary section
    worksheet.addRow([]);  // Empty row for spacing
    const summaryRow = worksheet.addRow(['Total Students:', `${students.length}`, '', '', '', '', '']);
    summaryRow.getCell(1).font = { bold: true };
    
    // Adjust column widths
    worksheet.columns.forEach(column => {
      column.width = 18;
    });
    
    // Write to buffer
    const buffer = await workbook.xlsx.writeBuffer();
    
    // Set headers and send response
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=Weekly_Attendance_${startDate}_to_${endDate}.xlsx`);
    res.send(buffer);
    
  } catch (error) {
    console.error('Error generating weekly attendance report:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate weekly report',
      error: error.message
    });
  }
};

// Helper function to check if entry time is late (after 9:00 AM)
function isEntryLate(entryTime) {
  const entryDate = parseMongoDate(entryTime);
  if (!entryDate) return false;
  
  const entryHour = entryDate.getHours();
  const entryMinute = entryDate.getMinutes();
  
  // Consider entry after 9:00 AM as late
  return entryHour > 9 || (entryHour === 9 && entryMinute > 0);
}

export const generateIndividualStudentReport = async (req, res) => {
  try {
    const { studentId, startDate, endDate, preserveFormat, handleTimestamps } = req.query;
    
    // Validate required parameters
    if (!studentId) {
      return res.status(400).json({
        success: false,
        message: 'Student ID is required',
        error: 'missing_student_id'
      });
    }
    
    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'Start date and end date are required',
        error: 'missing_date_range'
      });
    }
    
    // Parse dates
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    // Validate date format
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date format. Please use YYYY-MM-DD format.',
        error: 'invalid_date_format'
      });
    }
    
    // Set time to start and end of day
    start.setUTCHours(0, 0, 0, 0);
    end.setUTCHours(23, 59, 59, 999);
    
    // Find the student
    const student = await Student.findById(studentId);
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found',
        error: 'student_not_found'
      });
    }
    
    // Create a new workbook
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Attendance System';
    workbook.lastModifiedBy = 'Report Generator';
    workbook.created = new Date();
    workbook.modified = new Date();
    
    // Add a worksheet
    const worksheet = workbook.addWorksheet(`${student.name} Attendance`);
    
    // Set columns with width
    worksheet.columns = [
      { header: 'Date', key: 'date', width: 15 },
      { header: 'Status', key: 'status', width: 15 },
      { header: 'Entry Time', key: 'entryTime', width: 15 },
      { header: 'Leave Time', key: 'leaveTime', width: 15 },
      { header: 'Duration', key: 'duration', width: 15 },
      { header: 'Location', key: 'location', width: 20 }
    ];
    
    // Add title and student info
    worksheet.mergeCells('A1:F1');
    const titleCell = worksheet.getCell('A1');
    titleCell.value = `Attendance Report for ${student.name} (${student.indexNumber})`;
    titleCell.font = { bold: true, size: 16 };
    titleCell.alignment = { horizontal: 'center' };
    
    // Add report metadata
    worksheet.mergeCells('A2:F2');
    const infoCell = worksheet.getCell('A2');
    infoCell.value = `Report Period: ${startDate} to ${endDate}`;
    infoCell.font = { size: 12 };
    infoCell.alignment = { horizontal: 'center' };
    
    // Style the header row
    worksheet.getRow(3).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4472C4' }
      };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });
    
    // Filter attendance records for the date range
    const attendanceRecords = student.attendanceHistory.filter(record => {
      const recordDate = parseMongoDate(record.date);
      if (!recordDate) return false;
      
      return recordDate >= start && recordDate <= end;
    });
    
    // Sort by date ascending
    attendanceRecords.sort((a, b) => {
      const dateA = parseMongoDate(a.date);
      const dateB = parseMongoDate(b.date);
      return dateA - dateB;
    });
    
    // Get unique dates in the range
    const dateRange = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      dateRange.push(new Date(d));
    }
    
    // Generate a record for each date in range
    let rowIndex = 4; // Start from row 4 (after headers)
    
    dateRange.forEach(date => {
      const dateStr = date.toISOString().split('T')[0];
      const dateStartTime = new Date(date);
      dateStartTime.setUTCHours(0, 0, 0, 0);
      
      const dateEndTime = new Date(date);
      dateEndTime.setUTCHours(23, 59, 59, 999);
      
      // Find record for this date
      const record = attendanceRecords.find(r => {
        const recordDate = parseMongoDate(r.date);
        if (!recordDate) return false;
        
        // Reset time to start of day for comparison
        const recordDay = new Date(recordDate);
        recordDay.setUTCHours(0, 0, 0, 0);
        
        return recordDay.getTime() === dateStartTime.getTime();
      });
      
      let status = 'Absent';
      let entryTime = 'N/A';
      let leaveTime = 'N/A';
      let duration = 'N/A';
      let location = 'N/A';
      
      if (record) {
        // Log the found record for debugging
        console.log(`Found attendance record for ${student.name} on ${dateStr}:`, JSON.stringify(record));
        
        // Determine status
        if (record.status === 'entered') {
          status = 'Present';
        } else if (record.status === 'left') {
          status = 'Left';
        }
        
        // Format entry time
        if (record.entryTime) {
          const entryDate = parseMongoDate(record.entryTime);
          if (entryDate && !isNaN(entryDate.getTime())) {
            entryTime = entryDate.toLocaleTimeString('en-US', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
              hour12: true
            });
          }
        }
        
        // Format leave time
        if (record.leaveTime) {
          const leaveDate = parseMongoDate(record.leaveTime);
          if (leaveDate && !isNaN(leaveDate.getTime())) {
            leaveTime = leaveDate.toLocaleTimeString('en-US', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
              hour12: true
            });
          }
        }
        
        // Calculate duration
        if (record.entryTime && record.leaveTime) {
          const entryDate = parseMongoDate(record.entryTime);
          const leaveDate = parseMongoDate(record.leaveTime);
          
          if (entryDate && leaveDate && !isNaN(entryDate.getTime()) && !isNaN(leaveDate.getTime())) {
            const durationMs = leaveDate - entryDate;
            
            if (durationMs > 0) {
              // Format as hours and minutes
              const hours = Math.floor(durationMs / (1000 * 60 * 60));
              const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
              duration = `${hours}h ${minutes}m`;
            }
          }
        }
        
        // Get scan location
        location = record.scanLocation || 'Main Entrance';
      } else {
        console.log(`No attendance record found for ${student.name} on ${dateStr}`);
      }
      
      // Add row to worksheet
      const row = worksheet.addRow({
        date: dateStr,
        status,
        entryTime,
        leaveTime,
        duration,
        location
      });
      
      // Style the row
      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      });
      
      // Apply conditional formatting based on status
      const statusCell = row.getCell(2);
      if (status === 'Present') {
        statusCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF92D050' } // Green
        };
      } else if (status === 'Absent') {
        statusCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFF0000' } // Red
        };
        statusCell.font = { color: { argb: 'FFFFFFFF' } };
      } else if (status === 'Late') {
        statusCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFFC000' } // Yellow/Orange
        };
      } else if (status === 'Left') {
        statusCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF00B0F0' } // Blue
        };
      }
      
      // Apply zebra striping
      if (rowIndex % 2 !== 0) {
        row.eachCell((cell, colIndex) => {
          if (colIndex !== 2 || status === 'Absent') { // Skip status cell if it already has a color
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFF5F5F5' } // Light gray
            };
          }
        });
      }
      
      rowIndex++;
    });
    
    // Add summary section
    worksheet.addRow([]);
    const presentDays = attendanceRecords.filter(r => r.status === 'entered' || r.status === 'left').length;
    const totalDays = dateRange.length;
    const attendanceRate = totalDays > 0 ? (presentDays / totalDays) * 100 : 0;
    
    // Add summary rows
    const summaryStartRow = rowIndex + 2;
    worksheet.mergeCells(`A${summaryStartRow}:F${summaryStartRow}`);
    const summaryTitle = worksheet.getCell(`A${summaryStartRow}`);
    summaryTitle.value = 'Summary';
    summaryTitle.font = { bold: true, size: 14 };
    summaryTitle.alignment = { horizontal: 'center' };
    
    const summaryRows = [
      ['Total Days in Period', totalDays],
      ['Days Present', presentDays],
      ['Days Absent', totalDays - presentDays],
      ['Attendance Rate', `${attendanceRate.toFixed(2)}%`]
    ];
    
    summaryRows.forEach((data, index) => {
      const row = worksheet.addRow(['', data[0], data[1], '', '', '']);
      worksheet.mergeCells(`B${summaryStartRow + index + 1}:C${summaryStartRow + index + 1}`);
      worksheet.mergeCells(`D${summaryStartRow + index + 1}:F${summaryStartRow + index + 1}`);
      
      row.getCell(2).font = { bold: true };
      row.getCell(3).alignment = { horizontal: 'center' };
    });
    
    // Write to buffer
    const buffer = await workbook.xlsx.writeBuffer();
    
    // Set headers and send response
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${student.name.replace(/\s+/g, '_')}_attendance_report.xlsx`);
    res.send(buffer);
    
  } catch (error) {
    console.error('Error generating individual student report:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate report',
      error: error.message
    });
  }
};

export const getDailyReportPreview = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({ 
        success: false, 
        message: 'Start date and end date are required' 
      });
    }

    // Parse dates
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    // Validate date format
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid date format. Please use YYYY-MM-DD format.' 
      });
    }
    
    if (start > end) {
      return res.status(400).json({ 
        success: false, 
        message: 'Start date must be before end date' 
      });
    }

    // Find all students
    const students = await Student.find()
      .select('name indexNumber student_email attendanceHistory status')
      .sort({ indexNumber: 1 });

    if (!students || students.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'No students found' 
      });
    }

    // Process each student's attendance
    const studentRecords = students.map(student => {
      // Find attendance records for the specified date
      const attendanceRecord = student.attendanceHistory.find(record => {
        const recordDate = new Date(record.date);
        return recordDate >= start && recordDate <= end;
      });

      // Determine status
      let status = 'Absent';
      let entryTime = null;
      let leaveTime = null;
      
      if (attendanceRecord) {
        status = attendanceRecord.status === 'entered' ? 'Present' : 
                attendanceRecord.status === 'left' ? 'Left' : 
                attendanceRecord.status;
        entryTime = attendanceRecord.entryTime;
        leaveTime = attendanceRecord.leaveTime;
      }

      return {
        name: student.name,
        indexNumber: student.indexNumber,
        email: student.student_email,
        status,
        entryTime,
        leaveTime
      };
    });

    res.status(200).json({
      success: true,
      message: 'Daily report data retrieved successfully',
      data: {
        students: studentRecords,
        date: startDate
      }
    });
  } catch (error) {
    console.error('Error generating daily report preview:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error generating daily report preview', 
      error: error.message 
    });
  }
};

export const getWeeklyReportPreview = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'Start date and end date are required',
        error: 'missing_date_range'
      });
    }
    
    // Parse dates
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    // Validate date format
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date format. Please use YYYY-MM-DD format.',
        error: 'invalid_date_format'
      });
    }
    
    // Get all active students
    const students = await Student.find({ status: 'active' })
      .select('_id name indexNumber student_email status attendanceHistory')
      .sort('indexNumber')
      .lean();
    
    if (!students || students.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No active students found',
        error: 'no_students'
      });
    }
    
    // Get business days in the date range
    const workingDays = getBusinessDaysBetweenDates(start, end);
    
    // Process each student's attendance
    const studentAttendance = students.map(student => {
      // Initialize counters
      let presentDays = 0;
      let absentDays = 0;
      let lateDays = 0;
      
      // Generate an array of dates in the range
      const dateRange = [];
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        dateRange.push(new Date(d));
      }
      
      // Check each date for attendance
      dateRange.forEach(date => {
        const dateStartTime = new Date(date);
        dateStartTime.setUTCHours(0, 0, 0, 0);
        
        const dateEndTime = new Date(date);
        dateEndTime.setUTCHours(23, 59, 59, 999);
        
        // Find any attendance record for this date
        const hasAttendance = student.attendanceHistory?.some(record => {
          const recordDate = new Date(record.date);
          if (!recordDate) return false;
          
          // Reset time to start of day for comparison
          recordDate.setHours(0, 0, 0, 0);
          return recordDate.getTime() === dateStartTime.getTime();
        });
        
        if (hasAttendance) {
          presentDays++;
        } else {
          absentDays++;
        }
      });
      
      // Calculate attendance rate
      const attendanceRate = workingDays > 0 ? (presentDays / workingDays) * 100 : 0;
      
      return {
        _id: student._id,
        name: student.name,
        indexNumber: student.indexNumber,
        email: student.student_email,
        presentDays,
        absentDays,
        lateDays,
        attendanceRate: attendanceRate.toFixed(1)
      };
    });
    
    res.status(200).json({
      success: true,
      message: 'Weekly report data retrieved successfully',
      data: {
        students: studentAttendance,
        totalWorkingDays: workingDays,
        dateRange: {
          start: startDate,
          end: endDate
        }
      }
    });
  } catch (error) {
    console.error('Error generating weekly report preview:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate weekly report preview',
      error: error.message
    });
  }
};

export const getMonthlyReportPreview = async (req, res) => {
  try {
    const { year, month } = req.query;
    
    if (!year || !month) {
      return res.status(400).json({ 
        success: false, 
        message: 'Year and month are required' 
      });
    }

    // Validate year and month
    const yearNum = parseInt(year);
    const monthNum = parseInt(month);
    
    if (isNaN(yearNum) || isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid year or month. Month must be between 1 and 12.' 
      });
    }
    
    // Calculate start and end dates for the month
    const startDate = new Date(yearNum, monthNum - 1, 1);
    const endDate = new Date(yearNum, monthNum, 0); // Last day of the month
    
    // Find all active students
    const students = await Student.find({ status: 'active' })
      .select('name indexNumber status attendanceHistory')
      .sort({ indexNumber: 1 });

    if (!students || students.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'No active students found' 
      });
    }
    
    // Get number of days in the month
    const daysInMonth = endDate.getDate();
    
    // Process students with their attendance
    const studentAttendance = students.map(student => {
      // Initialize attendance data
      const dailyAttendance = [];
      let presentDays = 0;
      let absentDays = 0;
      
      // Check attendance for each day of the month
      for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(yearNum, monthNum - 1, day);
        
        // Find attendance record for this date
        const attendanceRecord = student.attendanceHistory.find(record => {
          const recordDate = new Date(record.date);
          return recordDate.getDate() === day && 
                recordDate.getMonth() === monthNum - 1 && 
                recordDate.getFullYear() === yearNum;
        });
        
        if (attendanceRecord) {
          dailyAttendance.push({
            day,
            status: attendanceRecord.status,
            present: true
          });
          presentDays++;
        } else {
          dailyAttendance.push({
            day,
            status: 'absent',
            present: false
          });
          absentDays++;
        }
      }
      
      // Calculate attendance percentage
      const attendancePercentage = daysInMonth > 0 ? (presentDays / daysInMonth) * 100 : 0;
      
      return {
        _id: student._id,
        name: student.name,
        indexNumber: student.indexNumber,
        status: student.status,
        dailyAttendance,
        presentDays,
        absentDays,
        attendancePercentage: attendancePercentage.toFixed(2)
      };
    });
    
    // Get month name
    const monthName = new Date(yearNum, monthNum - 1, 1).toLocaleString('default', { month: 'long' });
    
    res.status(200).json({
      success: true,
      message: 'Monthly report data retrieved successfully',
      data: {
        students: studentAttendance,
        month: monthName,
        year: yearNum,
        daysInMonth
      }
    });
  } catch (error) {
    console.error('Error generating monthly report preview:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error generating monthly report preview', 
      error: error.message 
    });
  }
};

export const getIndividualReportPreview = async (req, res) => {
  try {
    const { studentId, startDate, endDate } = req.query;
    
    // Validate required parameters
    if (!studentId) {
      return res.status(400).json({
        success: false,
        message: 'Student ID is required',
        error: 'missing_student_id'
      });
    }
    
    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'Start date and end date are required',
        error: 'missing_date_range'
      });
    }
    
    // Parse dates
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    // Find the student
    const student = await Student.findById(studentId);
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found',
        error: 'student_not_found'
      });
    }
    
    // Filter attendance records for the date range
    const attendanceRecords = student.attendanceHistory.filter(record => {
      const recordDate = new Date(record.date);
      return recordDate >= start && recordDate <= end;
    });
    
    // Sort by date ascending
    attendanceRecords.sort((a, b) => {
      const dateA = new Date(a.date);
      const dateB = new Date(b.date);
      return dateA - dateB;
    });
    
    // Generate a date list for the range
    const dateList = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const currentDate = new Date(d);
      
      // Find record for this date
      const record = attendanceRecords.find(r => {
        const recordDate = new Date(r.date);
        return recordDate.getDate() === currentDate.getDate() && 
               recordDate.getMonth() === currentDate.getMonth() && 
               recordDate.getFullYear() === currentDate.getFullYear();
      });
      
      dateList.push({
        date: currentDate.toISOString().split('T')[0],
        status: record ? record.status : 'absent',
        entryTime: record?.entryTime || null,
        leaveTime: record?.leaveTime || null,
        present: !!record
      });
    }
    
    // Calculate statistics
    const totalDays = dateList.length;
    const presentDays = dateList.filter(day => day.present).length;
    const absentDays = totalDays - presentDays;
    const attendanceRate = totalDays > 0 ? (presentDays / totalDays) * 100 : 0;
    
    res.status(200).json({
      success: true,
      message: 'Individual student report data retrieved successfully',
      data: {
        student: {
          _id: student._id,
          name: student.name,
          indexNumber: student.indexNumber,
          status: student.status
        },
        attendance: dateList,
        stats: {
          totalDays,
          presentDays,
          absentDays,
          attendanceRate: attendanceRate.toFixed(2)
        },
        dateRange: {
          start: startDate,
          end: endDate
        }
      }
    });
  } catch (error) {
    console.error('Error generating individual student report preview:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate individual student report preview',
      error: error.message
    });
  }
};

export default {
  generateDailyAttendanceReport,
  generateStudentSummaryReport,
  generateMonthlyAnalysisReport,
  generateWeeklyAttendanceReport,
  generateIndividualStudentReport,
  getDailyReportPreview,
  getWeeklyReportPreview,
  getMonthlyReportPreview,
  getIndividualReportPreview
};
