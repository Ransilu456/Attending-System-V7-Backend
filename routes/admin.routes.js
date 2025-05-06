import express from 'express';
import rateLimit from 'express-rate-limit';
import { protect } from '../middleware/authMiddleware.js';
import { validateAdminInput } from '../middleware/validationMiddleware.js';
import { validateStudentInput } from '../middleware/validationMiddleware.js';
import {
  registerAdmin,
  loginAdmin,
  getAdminDetails,
  getStudents,
  updateStudent,
  deleteStudent,
  getAllStudents,
  forgotPassword,
  resetPassword,
  updatePassword,
  updateProfile,
  registerStudent,
  generateStudentQRCode,
  getRecentAttendance,
  logoutAdmin
} from '../controllers/admin.controller.js';

// Import messaging controller functions
import {
  getWhatsAppStatus,
  sendMessage,
  adminSendBulkMessages
} from '../controllers/messaging.controller.js';

// Import attendance controller functions
import {
  markStudentAttendance,
  getScannedStudentsToday,
  getAttendanceByDate,
  clearStudentAttendanceHistory,
  deleteAttendanceRecord,
  getStudentAttendanceHistory
} from '../controllers/attendance.controller.js';

// Import report controller functions
import {
  generateDailyAttendanceReport,
  generateStudentSummaryReport,
  generateMonthlyAnalysisReport,
  generateWeeklyAttendanceReport,
  generateIndividualStudentReport,
  getDailyReportPreview,
  getWeeklyReportPreview,
  getMonthlyReportPreview,
  getIndividualReportPreview
} from '../controllers/report.controller.js';

// Import file upload configuration
import { upload } from '../controllers/upload.controller.js';

const router = express.Router();

// Rate limiting
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts
  message: 'Too many login attempts. Please try again after 15 minutes.'
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  message: 'Too many requests. Please try again after 1 minute.'
});

// Authentication routes
router.post('/register', validateAdminInput, registerAdmin);
router.post('/login', loginLimiter, loginAdmin);
router.post('/logout', protect, logoutAdmin);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password/:token', resetPassword);
router.post('/update-password', protect, updatePassword);
router.patch('/profile', protect, updateProfile);

// Admin routes
router.get('/me', protect, getAdminDetails);
router.get('/students', protect, getStudents);
router.get('/students/all', protect, getAllStudents);
router.get('/students/scanned-today', protect, getScannedStudentsToday);

// Attendance routes
router.get('/attendance/today', protect, getScannedStudentsToday);
router.get('/attendance/recent', protect, getRecentAttendance);
router.get('/attendance/report', protect, getAttendanceByDate);
router.get('/attendance/:date', protect, getAttendanceByDate);
router.post('/attendance', protect, markStudentAttendance);

// Reports routes
router.get('/reports/daily/preview', protect, getDailyReportPreview);
router.get('/reports/weekly/preview', protect, getWeeklyReportPreview);
router.get('/reports/monthly/preview', protect, getMonthlyReportPreview);
router.get('/reports/individual/preview', protect, getIndividualReportPreview);

router.get('/reports/daily', protect, generateDailyAttendanceReport);
router.get('/reports/weekly', protect, generateWeeklyAttendanceReport);
router.get('/reports/monthly', protect, generateMonthlyAnalysisReport);
router.get('/reports/individual', protect, generateIndividualStudentReport);

// Student management
router.post('/students', protect, validateStudentInput, registerStudent);
router.put('/students/:id', protect, updateStudent);
router.delete('/students/:id', protect, deleteStudent);

// QR Code routes
router.get('/students/:id/qr-code', protect, (req, res) => generateStudentQRCode(req, res));

// Messaging routes
router.post('/messages', protect, apiLimiter, sendMessage);
router.post('/messages/bulk', protect, apiLimiter, adminSendBulkMessages);

router.get('/whatsapp/status', protect, getWhatsAppStatus);

// Student attendance history management
router.get('/students/:studentId/attendance', protect, getStudentAttendanceHistory);
router.delete('/students/:studentId/attendance/clear', protect, clearStudentAttendanceHistory);
router.delete('/students/:studentId/attendance/:recordId', protect, deleteAttendanceRecord);

export default router;
