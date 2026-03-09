const winston = require("winston");

const logger = winston.createLogger({

  level: "info",

  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ level, message, timestamp }) => {
      return `${timestamp} [${level.toUpperCase()}] ${message}`;
    })
  ),

  transports: [

    new winston.transports.Console(),

    new winston.transports.File({
      filename: "logs/error.log",
      level: "error"
    }),

    new winston.transports.File({
      filename: "logs/combined.log"
    })

  ],

  exitOnError: false   // IMPORTANT: prevents server crash on logging error
});

module.exports = logger;