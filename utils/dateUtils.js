/**
 * Comprehensive function to parse MongoDB date objects in various formats
 * @param {*} mongoDate - Date in various possible MongoDB formats
 * @returns {Date|null} JavaScript Date object or null if invalid
 */
export const parseMongoDate = (mongoDate) => {
  if (!mongoDate) return null;
  
  try {
    // Case 1: Already a Date object
    if (mongoDate instanceof Date) {
      return mongoDate;
    }
    
    // Case 2: MongoDB Extended JSON format with $date object
    if (typeof mongoDate === 'object') {
      // Handle MongoDB-style date with $date
      if (mongoDate.$date) {
        // Case 2.1: $date is a number string ($numberLong)
        if (mongoDate.$date.$numberLong) {
          return new Date(parseInt(mongoDate.$date.$numberLong));
        }
        // Case 2.2: $date is a string (ISO format)
        else if (typeof mongoDate.$date === 'string') {
          return new Date(mongoDate.$date);
        }
        // Case 2.3: $date is a number
        else if (typeof mongoDate.$date === 'number') {
          return new Date(mongoDate.$date);
        }
      }
      
      // Case 3: MongoDB ISODate direct format
      if (mongoDate.ISODate) {
        return new Date(mongoDate.ISODate);
      }
    }
    
    // Case 4: Handle stringified MongoDB object (from JSON.stringify)
    if (typeof mongoDate === 'string' && mongoDate.includes('$date')) {
      try {
        const parsed = JSON.parse(mongoDate);
        if (parsed.$date) {
          if (parsed.$date.$numberLong) {
            return new Date(parseInt(parsed.$date.$numberLong));
          } else {
            return new Date(parsed.$date);
          }
        }
      } catch (e) {
        // Not a valid JSON string, continue to other cases
        console.warn('Failed to parse stringified MongoDB date:', e);
      }
    }
    
    // Case 5: ISO String or timestamp
    if (typeof mongoDate === 'string' || typeof mongoDate === 'number') {
      const date = new Date(mongoDate);
      if (!isNaN(date.getTime())) {
        return date;
      }
    }
    
    // Fallback: Log warning and return null for unrecognized format
    console.warn('Unrecognized date format:', mongoDate);
    return null;
  } catch (error) {
    console.error('Error parsing MongoDB date:', error, mongoDate);
    return null;
  }
};

/**
 * Format a date to time string with proper handling of MongoDB formats
 * @param {*} date - Date in various formats
 * @param {Object} options - Formatting options
 * @returns {string} Formatted time string or 'N/A' if invalid
 */
export const formatTimeFromDate = (date, options = {}) => {
  if (!date) return 'N/A';
  
  try {
    const parsedDate = parseMongoDate(date);
    if (!parsedDate || isNaN(parsedDate.getTime())) {
      return 'N/A';
    }
    
    // Default formatting options
    const defaultOptions = {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    };
    
    return parsedDate.toLocaleTimeString('en-US', { ...defaultOptions, ...options });
  } catch (error) {
    console.error('Error formatting time from date:', error, date);
    return 'N/A';
  }
};

/**
 * Calculate duration between two dates with MongoDB format handling
 * @param {*} startDate - Start date in various formats
 * @param {*} endDate - End date in various formats
 * @returns {string} Formatted duration string or 'N/A' if invalid
 */
export const calculateDuration = (startDate, endDate) => {
  if (!startDate || !endDate) return 'N/A';
  
  try {
    const start = parseMongoDate(startDate);
    const end = parseMongoDate(endDate);
    
    if (!start || !end || isNaN(start.getTime()) || isNaN(end.getTime())) {
      return 'N/A';
    }
    
    const durationMs = end - start;
    if (durationMs <= 0) return 'N/A';
    
    const hours = Math.floor(durationMs / (1000 * 60 * 60));
    const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
    
    return `${hours}h ${minutes}m`;
  } catch (error) {
    console.error('Error calculating duration:', error, { startDate, endDate });
    return 'N/A';
  }
};

export default {
  parseMongoDate,
  formatTimeFromDate,
  calculateDuration
}; 