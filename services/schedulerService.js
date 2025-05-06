import { logInfo, logError } from '../utils/terminal.js';
import { autoMarkLeaveAttendance, checkAllPastAttendance } from './autoAttendanceService.js';

/**
 * Starts the scheduler for automating tasks
 * Currently handles automatic marking of student attendance at end of day
 */
export const startScheduler = () => {
  try {
    logInfo('Starting scheduler service...');
    
    // Check all past attendance records when server starts
    checkAllPastAttendance().catch(error => {
      logError(`Error checking past attendance: ${error.message}`);
    });
    
    // Schedule the auto-mark attendance task to run at 6:45 PM daily
    const scheduleAutoMarkAttendance = () => {
      const now = new Date();
      const targetTime = new Date();
      targetTime.setHours(18, 45, 0, 0); 
      
      // If current time is past the target time, schedule for next day
      if (now > targetTime) {
        targetTime.setDate(targetTime.getDate() + 1);
      }
      
      const timeUntilTarget = targetTime.getTime() - now.getTime();
      
      // Schedule the task with appropriate timeout
      setTimeout(async () => {
        try {
          await autoMarkLeaveAttendance();
        } catch (error) {
          logError(`Error in scheduled auto-mark attendance task: ${error.message}`);
        }
        
        // Reschedule for next day after completion
        scheduleAutoMarkAttendance();
      }, timeUntilTarget);
      
      logInfo(`Next auto-mark attendance task scheduled for: ${targetTime.toLocaleString()}`);
    };
    
    // Start the scheduling process
    scheduleAutoMarkAttendance();
    
    logInfo('Scheduler service started successfully');
  } catch (error) {
    logError(`Error starting scheduler service: ${error.message}`);
    throw error;
  }
};