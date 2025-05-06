import express from 'express';
import rateLimit from 'express-rate-limit';
import { protect, restrictTo } from '../middleware/authMiddleware.js';
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

const router = express.Router();

const handleMongodbFormat = (req, res, next) => {
  req.preserveMongoFormat = req.headers['preserve-mongodb-format'] === 'true';
  req.timeFormat = req.headers['time-format'] || 'default';
  
  if (req.preserveMongoFormat && !req.query.preserveFormat) {
    req.query.preserveFormat = true;
  }
  
  if (req.timeFormat === 'preserve-null' && !req.query.handleTimestamps) {
    req.query.handleTimestamps = true;
  }
  
  next();
};

const reportLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, 
  max: 20, 
  message: 'Too many report generation requests. Please try again later.'
});

// Daily report endpoints
router.get(
  '/dailyAttendanceReport',
  protect,
  restrictTo('admin'),
  handleMongodbFormat,
  reportLimiter,
  generateDailyAttendanceReport
);

// Use the implementation from report.controller.js with a wrapper to handle the date parameter
router.get(
  '/daily/preview',
  protect,
  restrictTo('admin'),
  handleMongodbFormat,
  async (req, res) => {
    try {
      // Convert single date parameter to startDate and endDate parameters
      const { date } = req.query;
      
      if (!date) {
        return res.status(400).json({ 
          success: false, 
          message: 'Date is required',
          error: 'missing_date'
        });
      }
      
      // Set startDate and endDate to the same date for daily report
      req.query.startDate = date;
      req.query.endDate = date;
      
      // Call the original controller function
      await getDailyReportPreview(req, res);
    } catch (error) {
      console.error('Error in daily report preview wrapper:', error);
      res.status(500).json({
        success: false,
        message: 'Error generating preview',
        error: error.message
      });
    }
  }
);

// Weekly report endpoints
router.get(
  '/weeklyAttendanceReport',
  protect,
  restrictTo('admin'),
  handleMongodbFormat,
  reportLimiter,
  (req, res, next) => {
    // Ensure startDate and endDate parameters are present
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'Start date and end date are required for weekly reports',
        error: 'missing_date_range'
      });
    }
    
    // Validate date format
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date format. Please use YYYY-MM-DD format.',
        error: 'invalid_date_format'
      });
    }
    
    next();
  },
  generateWeeklyAttendanceReport
);

// Use the implementation from report.controller.js
router.get(
  '/weekly/preview',
  protect,
  restrictTo('admin'),
  handleMongodbFormat,
  getWeeklyReportPreview
);

// Monthly report endpoints
router.get(
  '/monthlyAttendanceReport',
  protect,
  restrictTo('admin'),
  handleMongodbFormat,
  reportLimiter,
  (req, res, next) => {
    const { year, month, startDate, endDate } = req.query;
    
    // Check if either year/month or startDate/endDate are provided
    if (!((year && month) || (startDate && endDate))) {
      return res.status(400).json({
        success: false,
        message: 'Either year/month or startDate/endDate must be provided',
        error: 'missing_parameters'
      });
    }
    
    // Validate date ranges if provided
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return res.status(400).json({
          success: false,
          message: 'Invalid date format. Please use YYYY-MM-DD format.',
          error: 'invalid_date_format'
        });
      }
    }
    
    next();
  },
  generateMonthlyAnalysisReport
);

// Use the implementation from report.controller.js
router.get(
  '/monthly/preview',
  protect,
  restrictTo('admin'),
  handleMongodbFormat,
  getMonthlyReportPreview
);

// Individual student report endpoints
router.get(
  '/individualStudentReport',
  protect,
  restrictTo('admin'),
  handleMongodbFormat,
  reportLimiter,
  generateIndividualStudentReport
);

// Use the implementation from report.controller.js
router.get(
  '/individual/preview',
  protect,
  restrictTo('admin'),
  handleMongodbFormat,
  getIndividualReportPreview
);

// Student summary report
router.get(
  '/summary',
  protect,
  restrictTo('admin'),
  handleMongodbFormat,
  reportLimiter,
  generateStudentSummaryReport
);

export default router;
