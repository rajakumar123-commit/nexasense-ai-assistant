'use strict';

// ============================================================
// email.service.js — NexaSense AI Assistant
// ============================================================
// Reusable email utility built on Nodemailer + Gmail SMTP.
// All credentials are read from environment variables — never
// hard-coded. Email sending is intentionally non-blocking so
// it never delays HTTP responses.
// ============================================================

const nodemailer = require('nodemailer');
const logger = require('./logger');

// ── Transport (singleton) ────────────────────────────────────
// Created once and reused across all calls. Nodemailer manages
// the connection pool internally.
const transporter = nodemailer.createTransport({
  service: 'gmail',             // resolves host/port automatically
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS, // 16-char Google App Password (no spaces)
  },
  pool: true,                   // keep connections alive for throughput
  maxConnections: 5,
  rateLimit: 10,                // max messages per second (Gmail: 500/day on free)
});

// Verify transport config on startup (logged, not thrown — app still boots)
transporter.verify((err) => {
  if (err) {
    logger.error('[Email] SMTP transport verification failed:', err.message);
  } else {
    logger.info('[Email] SMTP transport ready — Gmail connected.');
  }
});

// ── HTML Template ────────────────────────────────────────────
function buildWelcomeHtml(userName, userEmail) {
  const displayName = userName ? userName.split(' ')[0] : 'there';
  const year = new Date().getFullYear();

  return /* html */ `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Welcome to NexaSense AI</title>
  <style>
    /* ── Reset ── */
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', system-ui, -apple-system, Arial, sans-serif;
      background-color: hsl(220, 20%, 97%);
      color: hsl(220, 15%, 20%);
      padding: 32px 16px;
      -webkit-font-smoothing: antialiased;
    }

    /* ── Shell ── */
    .shell {
      max-width: 560px;
      margin: 0 auto;
    }

    /* ── Header bar ── */
    .header {
      background: linear-gradient(135deg, hsl(252, 80%, 54%), hsl(228, 75%, 48%));
      border-radius: 16px 16px 0 0;
      padding: 36px 40px 32px;
      text-align: center;
    }
    .logo-mark {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 20px;
    }
    .logo-icon {
      width: 40px; height: 40px;
      background: hsla(0, 0%, 100%, 0.20);
      border-radius: 10px;
      display: flex; align-items: center; justify-content: center;
    }
    .logo-icon svg { width: 22px; height: 22px; }
    .logo-text {
      font-size: 22px;
      font-weight: 700;
      letter-spacing: -0.4px;
      color: hsl(0, 0%, 100%);
    }
    .header h1 {
      font-size: 28px;
      font-weight: 800;
      color: hsl(0, 0%, 100%);
      letter-spacing: -0.5px;
      line-height: 1.2;
    }
    .header p.subtitle {
      margin-top: 8px;
      font-size: 15px;
      color: hsla(0, 0%, 100%, 0.80);
      font-weight: 400;
    }

    /* ── Card body ── */
    .card {
      background: hsl(0, 0%, 100%);
      padding: 40px 40px 36px;
      border: 1px solid hsl(220, 20%, 92%);
    }

    /* ── Greeting ── */
    .greeting {
      font-size: 17px;
      line-height: 1.6;
      color: hsl(220, 15%, 30%);
    }
    .greeting strong { color: hsl(220, 15%, 12%); }

    /* ── Credits banner ── */
    .credits-banner {
      margin: 28px 0;
      background: linear-gradient(135deg, hsl(252, 80%, 97%), hsl(228, 75%, 96%));
      border: 1.5px solid hsl(252, 60%, 88%);
      border-radius: 14px;
      padding: 24px 28px;
      text-align: center;
    }
    .credits-badge {
      display: inline-block;
      background: linear-gradient(135deg, hsl(252, 80%, 54%), hsl(228, 75%, 48%));
      color: hsl(0, 0%, 100%);
      font-size: 38px;
      font-weight: 900;
      line-height: 1;
      padding: 14px 28px;
      border-radius: 12px;
      letter-spacing: -1px;
      margin-bottom: 12px;
    }
    .credits-label {
      font-size: 14px;
      font-weight: 600;
      color: hsl(252, 60%, 42%);
      letter-spacing: 0.8px;
      text-transform: uppercase;
    }
    .credits-desc {
      margin-top: 8px;
      font-size: 13.5px;
      color: hsl(252, 30%, 55%);
    }

    /* ── Feature list ── */
    .features { margin: 28px 0; }
    .features h2 {
      font-size: 14px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      color: hsl(220, 15%, 50%);
      margin-bottom: 16px;
    }
    .feature-item {
      display: flex;
      align-items: flex-start;
      gap: 14px;
      padding: 14px 0;
      border-bottom: 1px solid hsl(220, 20%, 94%);
    }
    .feature-item:last-child { border-bottom: none; }
    .feature-icon {
      width: 36px; height: 36px;
      border-radius: 9px;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
      font-size: 17px;
    }
    .fi-purple { background: hsl(252, 80%, 95%); }
    .fi-blue   { background: hsl(213, 90%, 94%); }
    .fi-green  { background: hsl(145, 60%, 93%); }
    .feature-copy strong {
      display: block;
      font-size: 14.5px;
      font-weight: 700;
      color: hsl(220, 15%, 15%);
      margin-bottom: 2px;
    }
    .feature-copy span {
      font-size: 13.5px;
      color: hsl(220, 15%, 48%);
      line-height: 1.4;
    }

    /* ── CTA button ── */
    .cta-wrap { text-align: center; margin: 32px 0 8px; }
    .cta-btn {
      display: inline-block;
      background: linear-gradient(135deg, hsl(252, 80%, 54%), hsl(228, 75%, 48%));
      color: hsl(0, 0%, 100%) !important;
      text-decoration: none;
      font-size: 16px;
      font-weight: 700;
      padding: 15px 42px;
      border-radius: 50px;
      letter-spacing: 0.2px;
    }

    /* ── Footer ── */
    .footer {
      background: hsl(220, 20%, 97%);
      border: 1px solid hsl(220, 20%, 92%);
      border-top: none;
      border-radius: 0 0 16px 16px;
      padding: 24px 40px;
      text-align: center;
    }
    .footer p {
      font-size: 12.5px;
      color: hsl(220, 15%, 55%);
      line-height: 1.6;
    }
    .footer a {
      color: hsl(252, 70%, 54%);
      text-decoration: none;
    }

    /* ── Responsive ── */
    @media (max-width: 480px) {
      .header, .card { padding-left: 24px; padding-right: 24px; }
      .footer { padding-left: 24px; padding-right: 24px; }
      .header h1 { font-size: 23px; }
    }
  </style>
</head>
<body>
  <div class="shell">

    <!-- Header -->
    <div class="header">
      <div class="logo-mark">
        <div class="logo-icon">
          <!-- Simple AI spark icon -->
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z"
                  fill="white" opacity="0.9"/>
          </svg>
        </div>
        <span class="logo-text">NexaSense AI</span>
      </div>
      <h1>Welcome aboard! 🎉</h1>
      <p class="subtitle">Your intelligent AI assistant is ready to go.</p>
    </div>

    <!-- Body -->
    <div class="card">
      <p class="greeting">
        Hi <strong>${displayName}</strong>,<br /><br />
        We're thrilled to have you join <strong>NexaSense AI</strong>.
        Your account has been created for <strong>${userEmail}</strong> and 
        you're ready to start building smarter workflows with AI — right now.
      </p>

      <!-- Credits Banner -->
      <div class="credits-banner">
        <div class="credits-badge">100</div>
        <div class="credits-label">Free Credits — On Us</div>
        <p class="credits-desc">
          We've loaded your account with <strong>100 free credits</strong> to explore
          everything NexaSense has to offer — no credit card required.
        </p>
      </div>

      <!-- Feature highlights -->
      <div class="features">
        <h2>What you can do</h2>

        <div class="feature-item">
          <div class="feature-icon fi-purple">🤖</div>
          <div class="feature-copy">
            <strong>AI-Powered Chat &amp; RAG</strong>
            <span>Ask questions over your own documents with pinpoint accuracy.</span>
          </div>
        </div>

        <div class="feature-item">
          <div class="feature-icon fi-blue">⚡</div>
          <div class="feature-copy">
            <strong>Lightning-Fast Responses</strong>
            <span>Optimised retrieval pipeline built for real-time, production workloads.</span>
          </div>
        </div>

        <div class="feature-item">
          <div class="feature-icon fi-green">🔒</div>
          <div class="feature-copy">
            <strong>Enterprise-Grade Security</strong>
            <span>JWT auth, RBAC permissions, and encrypted data storage by default.</span>
          </div>
        </div>
      </div>

      <!-- CTA -->
      <div class="cta-wrap">
        <a class="cta-btn" href="${process.env.APP_URL || 'https://yourdomain.com'}/dashboard">
          Start Using NexaSense →
        </a>
      </div>
    </div>

    <!-- Footer -->
    <div class="footer">
      <p>
        You received this email because an account was created for
        <a href="mailto:${userEmail}">${userEmail}</a>.<br />
        If this wasn't you, <a href="mailto:${process.env.EMAIL_USER}">contact our support team</a>.<br /><br />
        © ${year} NexaSense AI. All rights reserved.
      </p>
    </div>

  </div>
</body>
</html>
  `.trim();
}

// ── sendWelcomeEmail ─────────────────────────────────────────
/**
 * Sends a branded welcome email to a newly registered user.
 *
 * Designed to be called WITHOUT await in the signup handler so it
 * never blocks the HTTP response. Errors are caught and logged
 * internally — they will NOT surface to the caller.
 *
 * @param {string} userEmail  - Recipient email address
 * @param {string} [userName] - Full name (optional; falls back to "there")
 */
async function sendWelcomeEmail(userEmail, userName) {
  try {
    const fromName = process.env.EMAIL_FROM_NAME || 'NexaSense AI';

    const info = await transporter.sendMail({
      from: `"${fromName}" <${process.env.EMAIL_USER}>`,
      to: userEmail,
      subject: '🎉 Welcome to NexaSense AI — Your 100 Free Credits Are Ready!',
      text: buildPlainText(userName, userEmail),   // plain-text fallback
      html: buildWelcomeHtml(userName, userEmail),
    });

    logger.info(`[Email] Welcome email sent to ${userEmail} — messageId: ${info.messageId}`);
  } catch (err) {
    // Log but do NOT rethrow — email failure must never break signup
    logger.error(`[Email] Failed to send welcome email to ${userEmail}:`, err.message);
  }
}

// ── Plain-text fallback (accessibility + spam score) ─────────
function buildPlainText(userName, userEmail) {
  const displayName = userName ? userName.split(' ')[0] : 'there';
  return [
    `Hi ${displayName},`,
    '',
    `Welcome to NexaSense AI! Your account (${userEmail}) is now active.`,
    '',
    '🎁 We\'ve added 100 FREE credits to your account — no credit card needed.',
    '',
    'What you can do:',
    '  • AI-Powered Chat & RAG — query your documents intelligently',
    '  • Lightning-fast responses for production workloads',
    '  • Enterprise-grade security with JWT & RBAC',
    '',
    `Get started: ${process.env.APP_URL || 'https://yourdomain.com'}/dashboard`,
    '',
    '— The NexaSense AI Team',
    '',
    `If you didn't create this account, contact us at ${process.env.EMAIL_USER}`,
  ].join('\n');
}

module.exports = { sendWelcomeEmail };
