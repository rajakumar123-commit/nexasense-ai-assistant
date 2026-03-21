// ============================================================
// BullMQ Ingestion Queue
// NexaSense AI Assistant
// Production-ready ingestion queue
// ============================================================

const { Queue } = require("bullmq");
const connection = require("../config/redis");
const logger = require("../utils/logger");

const QUEUE_NAME = "document-ingestion";


// ------------------------------------------------------------
// Queue instance
// ------------------------------------------------------------

const ingestionQueue = new Queue(QUEUE_NAME, {

  connection,

  defaultJobOptions: {

    attempts: 3,

    removeOnComplete: {
      age: 3600,   // keep successful jobs for 1 hour
      count: 1000
    },

    removeOnFail: {
      age: 86400   // keep failed jobs for 24h
    },

    backoff: {
      type: "exponential",
      delay: 3000
    }

  }

});


// ------------------------------------------------------------
// Add ingestion job
// ------------------------------------------------------------

async function addIngestionJob({ documentId, filePath, userId }) {

  if (!documentId || !filePath) {
    throw new Error("Invalid ingestion job payload");
  }

  try {

    const job = await ingestionQueue.add(

      "process-document",

      {
        documentId,
        filePath,
        userId
      },

      {
        priority: 2
      }

    );

    logger.info(
      `[Queue] Job added | jobId=${job.id} | doc=${documentId}`
    );

    return job.id;

  }

  catch (error) {

    logger.error(
      `[Queue] Failed to enqueue job | doc=${documentId} | ${error.message}`
    );

    throw error;

  }

}


// ------------------------------------------------------------
// Optional queue monitoring
// ------------------------------------------------------------

async function getQueueStatus() {

  try {

    const waiting = await ingestionQueue.getWaitingCount();
    const active = await ingestionQueue.getActiveCount();
    const completed = await ingestionQueue.getCompletedCount();
    const failed = await ingestionQueue.getFailedCount();

    return {

      waiting,
      active,
      completed,
      failed

    };

  }

  catch (err) {

    logger.error("[Queue] Status check failed:", err.message);

    return {
      waiting: 0,
      active: 0,
      completed: 0,
      failed: 0
    };

  }

}


module.exports = {

  addIngestionJob,
  getQueueStatus

};