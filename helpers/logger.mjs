import { logtail } from './constants.mjs';

class Logger {
  constructor() {
    this.logtail = logtail;
  }

  log(data) {
    const logEntry = {
      ...data,
      environment: process.env.NODE_ENV || 'development',
      timestamp: new Date().toISOString()
    };

    // Send to Logtail
    this.logtail.info(logEntry);
    
    // Also log to console in development
    if (process.env.NODE_ENV !== 'production') {
      console.log(JSON.stringify(logEntry, null, 2));
    }
  }

  error(data) {
    const logEntry = {
      ...data,
      environment: process.env.NODE_ENV || 'development',
      timestamp: new Date().toISOString()
    };

    // Send to Logtail
    this.logtail.error(logEntry);
    
    // Always log errors to console
    console.error(JSON.stringify(logEntry, null, 2));
  }

  warn(data) {
    const logEntry = {
      ...data,
      environment: process.env.NODE_ENV || 'development',
      timestamp: new Date().toISOString()
    };

    // Send to Logtail
    this.logtail.warn(logEntry);
    
    // Log warnings to console in development
    if (process.env.NODE_ENV !== 'production') {
      console.warn(JSON.stringify(logEntry, null, 2));
    }
  }
}

// Create a singleton instance
const logger = new Logger();

export default logger;
