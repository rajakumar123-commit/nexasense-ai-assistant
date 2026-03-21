// ============================================================
// streaming.service.js
// NexaSense AI Assistant
// Server-Sent Events streaming utilities
// ============================================================

const logger = require("../utils/logger");


// ------------------------------------------------------------
// Initialize SSE stream
// ------------------------------------------------------------

function initStream(res) {

  try {

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    // important for nginx / docker proxies
    res.setHeader("X-Accel-Buffering", "no");

    // allow cross origin streaming
    res.setHeader("Access-Control-Allow-Origin", "*");

    res.flushHeaders?.();

  } catch (err) {

    logger.error("[Streaming] Init failed:", err.message);

  }

}


// ------------------------------------------------------------
// Send token chunk
// ------------------------------------------------------------

function sendToken(res, token) {

  try {

    if (!token) return;

    res.write(`data: ${JSON.stringify({ token })}\n\n`);

  }

  catch (err) {

    logger.warn("[Streaming] Token send error:", err.message);

  }

}


// ------------------------------------------------------------
// Send metadata event
// Used for sources / metrics
// ------------------------------------------------------------

function sendMeta(res, meta) {

  try {

    res.write(`event: meta\n`);
    res.write(`data: ${JSON.stringify(meta)}\n\n`);

  }

  catch (err) {

    logger.warn("[Streaming] Meta send error:", err.message);

  }

}


// ------------------------------------------------------------
// Send error event
// ------------------------------------------------------------

function sendError(res, message) {

  try {

    res.write(`event: error\n`);
    res.write(`data: ${JSON.stringify({ error: message })}\n\n`);

  }

  catch (err) {

    logger.error("[Streaming] Error send failed:", err.message);

  }

}


// ------------------------------------------------------------
// Send heartbeat (prevents proxy timeout)
// ------------------------------------------------------------

function heartbeat(res) {

  try {

    res.write(`event: ping\n`);
    res.write(`data: {}\n\n`);

  }

  catch (err) {

    logger.warn("[Streaming] Heartbeat failed:", err.message);

  }

}


// ------------------------------------------------------------
// Close stream
// ------------------------------------------------------------

function closeStream(res) {

  try {

    res.write(`event: done\n`);
    res.write(`data: {}\n\n`);

    res.end();

  }

  catch (err) {

    logger.error("[Streaming] Stream close error:", err.message);

  }

}


module.exports = {
  initStream,
  sendToken,
  sendMeta,
  sendError,
  heartbeat,
  closeStream
};