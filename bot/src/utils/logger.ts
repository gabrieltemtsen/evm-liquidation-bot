import winston from 'winston';
import path from 'path';
import fs from 'fs';

// Ensure logs directory exists
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const { combine, timestamp, colorize, printf, errors, json } = winston.format;

const consoleFormat = printf(({ level, message, timestamp, stack, ...meta }) => {
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  if (stack) {
    return `${timestamp} [${level}]: ${message}\n${stack}${metaStr}`;
  }
  return `${timestamp} [${level}]: ${message}${metaStr}`;
});

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: combine(
    errors({ stack: true }),
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    json()
  ),
  transports: [
    // Console transport with color
    new winston.transports.Console({
      format: combine(
        colorize({ all: true }),
        timestamp({ format: 'HH:mm:ss.SSS' }),
        consoleFormat
      ),
    }),
    // Daily rotating file for all logs
    new winston.transports.File({
      filename: path.join(logsDir, 'bot.log'),
      maxsize: 10 * 1024 * 1024, // 10 MB
      maxFiles: 5,
      tailable: true,
    }),
    // Separate error log
    new winston.transports.File({
      level: 'error',
      filename: path.join(logsDir, 'error.log'),
      maxsize: 5 * 1024 * 1024,
      maxFiles: 3,
    }),
    // Liquidation events log
    new winston.transports.File({
      level: 'info',
      filename: path.join(logsDir, 'liquidations.log'),
      maxsize: 20 * 1024 * 1024,
      maxFiles: 10,
    }),
  ],
  exitOnError: false,
});

export default logger;
