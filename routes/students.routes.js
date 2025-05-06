import express from 'express';
import rateLimit from 'express-rate-limit';
import { validateStudentInput, validateStudentUpdateInput } from '../middleware/validationMiddleware.js';
import { protect, restrictTo } from '../middleware/authMiddleware.js';
import {
  downloadQRCode,
  searchQRCode,
  markAttendance,
  getStudentProfile,
  updateStudentProfile,
  getAttendanceHistory,
  getDashboardStats
} from '../controllers/students.controller.js';

const router = express.Router();

const qrLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30, 
  message: 'Too many QR code requests. Please try again later.'
});

const attendanceLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10, 
  message: 'Too many attendance attempts. Please try again later.'
});

// Student profile routes - support both URL param and query param for student ID
router.get('/profile/:studentId', protect, restrictTo('admin'), getStudentProfile);
router.get('/profile', protect, restrictTo('admin'), getStudentProfile); // For query param version
router.patch('/profile/:studentId', protect, restrictTo('admin'), validateStudentUpdateInput, updateStudentProfile);
router.patch('/profile', protect, restrictTo('admin'), validateStudentUpdateInput, updateStudentProfile); // For query param version

// QR code routes
router.get('/download-qr-code', qrLimiter, downloadQRCode);
router.get('/search-qr', qrLimiter, searchQRCode);

// Attendance routes
router.post('/mark-attendance', attendanceLimiter, markAttendance); 
router.get('/attendance-history/:studentId', protect, restrictTo('admin'), getAttendanceHistory);
router.get('/attendance-history', protect, restrictTo('admin'), getAttendanceHistory); // For query param version
router.get('/dashboard-stats', protect, restrictTo('admin'), getDashboardStats);

export default router;
