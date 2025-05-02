// Secure logger utility for CoPrompt
// Handles sensitive data removal and structured logging

const LOG_LEVELS = {
  ERROR: "ERROR",
  WARN: "WARN",
  INFO: "INFO",
  DEBUG: "DEBUG",
};

// Environment-based logging configuration
const isProduction = !chrome.runtime.getManifest().version.includes("dev");

// Rate limiting configuration
const RATE_LIMIT = {
  ERROR: { count: 10, window: 60000 }, // 10 errors per minute
  WARN: { count: 20, window: 60000 }, // 20 warnings per minute
  INFO: { count: 50, window: 60000 }, // 50 info logs per minute
  DEBUG: { count: 100, window: 60000 }, // 100 debug logs per minute
};

// Patterns for sensitive data
const SENSITIVE_PATTERNS = [
  /sk-[a-zA-Z0-9]{48}/g, // OpenAI API key pattern
  /[a-zA-Z0-9+/]{32,}={0,2}/g, // Base64 pattern (potential sensitive data)
  /password/i,
  /token/i,
  /key/i,
  /secret/i,
  /credential/i,
];

// Rate limiting state
const rateLimitState = {
  ERROR: { count: 0, resetTime: 0 },
  WARN: { count: 0, resetTime: 0 },
  INFO: { count: 0, resetTime: 0 },
  DEBUG: { count: 0, resetTime: 0 },
};

// Check rate limit
function checkRateLimit(level) {
  const now = Date.now();
  // eslint-disable-next-line security/detect-object-injection -- 'level' is from internal LOG_LEVELS enum, not user input
  const limit = RATE_LIMIT[level];
  // eslint-disable-next-line security/detect-object-injection -- 'level' is from internal LOG_LEVELS enum, not user input
  const state = rateLimitState[level];

  // Reset counter if window has passed
  if (now - state.resetTime > limit.window) {
    state.count = 0;
    state.resetTime = now;
  }

  // Check if limit exceeded
  if (state.count >= limit.count) {
    return false;
  }

  state.count++;
  return true;
}

// Sanitize sensitive data from log messages
function sanitizeMessage(message) {
  if (typeof message !== "string") {
    try {
      message = JSON.stringify(message);
    } catch (e) {
      message = String(message);
    }
  }

  // Replace sensitive patterns with redacted text
  SENSITIVE_PATTERNS.forEach((pattern) => {
    message = message.replace(pattern, "[REDACTED]");
  });

  // Limit message length to prevent DOS
  return message.slice(0, 1000);
}

// Format objects for logging
function formatData(data) {
  if (!data) return "";

  try {
    if (typeof data === "object") {
      // Deep clone to avoid modifying original data
      const sanitizedData = JSON.parse(JSON.stringify(data));

      // Recursively sanitize object values
      const sanitizeObject = (obj) => {
        for (const key in obj) {
          // eslint-disable-next-line security/detect-object-injection -- 'key' is from object iteration for sanitization, not execution
          if (typeof obj[key] === "string") {
            // eslint-disable-next-line security/detect-object-injection -- 'key' is from object iteration for sanitization, not execution
            obj[key] = sanitizeMessage(obj[key]);
            // eslint-disable-next-line security/detect-object-injection -- 'key' is from object iteration for sanitization, not execution
          } else if (typeof obj[key] === "object" && obj[key] !== null) {
            // eslint-disable-next-line security/detect-object-injection -- 'key' is from object iteration for sanitization, not execution
            sanitizeObject(obj[key]);
          }
        }
      };

      sanitizeObject(sanitizedData);
      return JSON.stringify(sanitizedData);
    }
    return sanitizeMessage(String(data));
  } catch (e) {
    return "[Error formatting data]";
  }
}

// Create timestamp for logs
function getTimestamp() {
  return new Date().toISOString();
}

// Main logger class
class Logger {
  constructor(context) {
    this.context = context;
    this.sessionId = crypto.randomUUID();
  }

  // Internal log method
  _log(level, message, data = null) {
    // Skip debug logs in production
    if (isProduction && level === LOG_LEVELS.DEBUG) {
      return;
    }

    // Check rate limit
    if (!checkRateLimit(level)) {
      if (level === LOG_LEVELS.ERROR) {
        // Always log rate limit exceeded for errors
        console.error(`[Rate limit exceeded for ${level}] ${message}`);
      }
      return;
    }

    const timestamp = getTimestamp();
    const sanitizedMessage = sanitizeMessage(message);
    const formattedData = formatData(data);

    const logEntry = {
      timestamp,
      level,
      context: this.context,
      sessionId: this.sessionId,
      message: sanitizedMessage,
      ...(formattedData ? { data: formattedData } : {}),
    };

    // In production, only output structured format
    if (isProduction) {
      console.log(JSON.stringify(logEntry));
      return;
    }

    // In development, use console methods with colors
    const logFn =
      {
        [LOG_LEVELS.ERROR]: console.error,
        [LOG_LEVELS.WARN]: console.warn,
        [LOG_LEVELS.INFO]: console.log,
        [LOG_LEVELS.DEBUG]: console.debug,
        // eslint-disable-next-line security/detect-object-injection -- 'level' is from internal LOG_LEVELS enum, not user input
      }[level] || console.log;

    // eslint-disable-next-line security/detect-object-injection -- 'logFn' is confirmed to be a safe console method, based on controlled 'level'
    logFn(
      `[${timestamp}] [${level}] [${this.context}]`,
      sanitizedMessage,
      data ? formattedData : "",
    );
  }

  error(message, data = null) {
    this._log(LOG_LEVELS.ERROR, message, data);
  }

  warn(message, data = null) {
    this._log(LOG_LEVELS.WARN, message, data);
  }

  info(message, data = null) {
    this._log(LOG_LEVELS.INFO, message, data);
  }

  debug(message, data = null) {
    this._log(LOG_LEVELS.DEBUG, message, data);
  }
}

// Create logger instances for different contexts
export function createLogger(context) {
  return new Logger(context);
}

// Export default logger instance
export const logger = createLogger("default");

// Example usage:
// const logger = createLogger('background');
// logger.info('Processing request', { requestId: '123', type: 'enhance' });
