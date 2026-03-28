// ============================================================
// Scraper Service — NexaSense AI Assistant V5.0 Ultimate
// Production Grade: Memory-Safe, Fingerprint Rotating, Semantic RAG
// ============================================================

"use strict";

const axios = require("axios");
const https = require("https");
const cheerio = require("cheerio");
const puppeteer = require("puppeteer");
const logger = require("../utils/logger");

// ============================================================
// SECTION 1 — CONFIGURATION & LIMITS
// ============================================================
const CFG = {
  MIN_CONTENT_LENGTH: 150,
  AXIOS_TIMEOUT: 10_000,
  PUPPETEER_TIMEOUT: 20_000,
  CONCURRENCY_PER_DOMAIN: 2,
  MAX_EXPANSION_LINKS: 2,
  CHUNK_MIN_WORDS: 25,
  CHUNK_MAX_WORDS: 350,
  BROWSER_IDLE_TTL_MS: 60_000, // Keep browser alive for 60s
};

const NOISE_SELECTORS = [
  "script", "style", "noscript", "iframe", "svg", "canvas", "video", "audio", 
  "picture", "[aria-hidden='true']", ".cookie-banner", ".cookie-notice", 
  ".popup", ".modal", ".overlay", ".ad", ".ads", ".advertisement", "#cookie-banner"
].join(", ");

// ============================================================
// SECTION 2 — FINGERPRINT ROTATION (Bot Evasion)
// ============================================================
const BROWSER_PROFILES = [
  { ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36", vp: { width: 1920, height: 1080 } },
  { ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15", vp: { width: 1440, height: 900 } },
  { ua: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36", vp: { width: 1366, height: 768 } }
];

function pickProfile() { return BROWSER_PROFILES[Math.floor(Math.random() * BROWSER_PROFILES.length)]; }

// ============================================================
// SECTION 3 — NATIVE RATE LIMITER
// ============================================================
function makeLimiter(concurrency) {
  let running = 0; const queue = [];
  const next = () => {
    if (running >= concurrency || !queue.length) return;
    running++; const { fn, resolve, reject } = queue.shift();
    fn().then(resolve).catch(reject).finally(() => { running--; next(); });
  };
  return (fn) => new Promise((resolve, reject) => { queue.push({ fn, resolve, reject }); next(); });
}

const _domainLimiters = new Map();
const _puppeteerLimiter = makeLimiter(1); // Strict 1-at-a-time for RAM safety

function getLimiter(url) {
  try {
    const domain = new URL(url).hostname;
    if (!_domainLimiters.has(domain)) _domainLimiters.set(domain, makeLimiter(CFG.CONCURRENCY_PER_DOMAIN));
    return _domainLimiters.get(domain);
  } catch { return makeLimiter(CFG.CONCURRENCY_PER_DOMAIN); }
}

// ============================================================
// SECTION 4 — SINGLETON BROWSER MANAGER
// ============================================================
let _browser = null;
let _browserUsed = 0;

function getChromePath() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  return process.platform === "win32" ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" : "/usr/bin/chromium";
}

async function getBrowser() {
  if (_browser && Date.now() - _browserUsed > CFG.BROWSER_IDLE_TTL_MS) {
    logger.info("[Scraper] Recycling idle browser to free RAM");
    await _browser.close().catch(() => {});
    _browser = null;
  }
  if (!_browser) {
    _browser = await puppeteer.launch({
      headless: "new",
      executablePath: getChromePath(),
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--single-process", "--disable-blink-features=AutomationControlled"]
    });
  }
  _browserUsed = Date.now();
  return _browser;
}

// ============================================================
// SECTION 5 — ROOT DETECTION & KNOWLEDGE GRAPH
// ============================================================
function findContentRoot($) {
  const candidates = ["main", "article", '[role="main"]', "#content", "#main", ".content", ".main-content"];
  for (const sel of candidates) {
    const el = $(sel).first();
    if (el.length && el.text().trim().length > CFG.MIN_CONTENT_LENGTH) return el;
  }
  let best = null, bestScore = 0;
  $("div, section").each((_, node) => {
    const el = $(node); const text = el.text().trim();
    const score = (text.length * text.length) / Math.max($.html(node).length, 1);
    if (score > bestScore) { bestScore = score; best = el; }
  });
  return best || $("body");
}

function extractKnowledgeGraph($) {
  const kg = { entities: [] };
  $('script[type="application/ld+json"]').each((_, el) => {
    try { const data = JSON.parse($(el).text()); kg.entities.push(data); } catch { }
  });
  return kg;
}

// ============================================================
// SECTION 6 — SEMANTIC CHUNKING ENGINE
// ============================================================
function classifyBlock(text) {
  if (/(@|phone|email|address|tel:|mailto:|contact)/i.test(text)) return "CONTACT_INFO";
  if (/(we offer|services|solutions|features)/i.test(text)) return "SERVICE_DESCRIPTION";
  if (/(specifications|SKU|price|₹|\$)/i.test(text)) return "PRODUCT_DETAIL";
  return "GENERAL_CONTENT";
}

function semanticChunk(text) {
  const raw = text.split(/\n\s*\n+/).map(b => b.trim()).filter(Boolean);
  const chunks = []; 
  let buffer = "", role = null;
  
  const flush = () => {
    if (!buffer.trim()) return;
    const wc = buffer.split(/\s+/).length;
    if (wc >= CFG.CHUNK_MIN_WORDS) chunks.push({ role: role || "GENERAL_CONTENT", text: buffer.trim(), wordCount: wc, chunkIndex: chunks.length });
    buffer = ""; role = null;
  };

  for (const b of raw) {
    const currentRole = classifyBlock(b);
    if ((role && currentRole !== role) || (buffer.split(/\s+/).length > CFG.CHUNK_MAX_WORDS)) flush();
    buffer += (buffer ? "\n\n" : "") + b;
    role = currentRole;
  }
  flush();
  return chunks;
}

// ============================================================
// SECTION 7 — SANITIZATION & CONTACT EXTRACTION
// ============================================================
function extractContactInfo($) {
  const phones = new Set(), emails = new Set(), addresses = new Set();
  $("a[href^='tel:']").each((_, el) => { const t = $(el).text().trim(); if (t) phones.add(t); });
  $("a[href^='mailto:']").each((_, el) => { const m = $(el).text().trim(); if (m) emails.add(m); });
  
  $("[class*='address'], [class*='contact'], footer").each((_, el) => {
    const txt = $(el).text().replace(/\s+/g, " ").trim();
    if (txt.length > 20 && txt.length < 300 && classifyBlock(txt) === "CONTACT_INFO") addresses.add(txt);
  });

  if (!phones.size && !emails.size && !addresses.size) return null;
  const lines = ["=== Contact Information ==="];
  if (phones.size) lines.push(`Phone: ${[...phones].join(" | ")}`);
  if (emails.size) lines.push(`Email: ${[...emails].join(" | ")}`);
  if (addresses.size) lines.push(`Address: ${[...addresses].join(" | ")}`);
  return lines.join("\n");
}

// ============================================================
// SECTION 8 — GOD-TIER MARKDOWN CONVERSION
// ============================================================
function convertTableToMarkdown($, tableEl) {
  const rows = [];
  $(tableEl).find("tr").each((_, tr) => {
    const cells = []; $(tr).find("th, td").each((_, td) => cells.push($(td).text().trim()));
    if (cells.length) rows.push(`| ${cells.join(" | ")} |`);
  });
  if (!rows.length) return "";
  const sep = `| ${Array(rows[0].split("|").length - 2).fill("---").join(" | ")} |`;
  rows.splice(1, 0, sep);
  return rows.join("\n");
}

function extractMarkdown($, root) {
  let md = ""; const seen = new Set();
  root.find("h1,h2,h3,p,li,table").each((_, el) => {
    const tag = el.tagName.toLowerCase();
    if (tag === "table") { md += `\n${convertTableToMarkdown($, el)}\n`; return; }
    const text = $(el).text().replace(/\s+/g, " ").trim();
    if (text.length < 15 || seen.has(text)) return;
    if (tag.startsWith("h")) md += `\n${"#".repeat(parseInt(tag[1]))} ${text}\n`;
    else if (tag === "li") md += `* ${text}\n`;
    else md += `\n${text}\n`;
    seen.add(text);
  });
  return md.trim();
}

// ============================================================
// SECTION 9 — HTML PARSER
// ============================================================
function parseHtml(html) {
  const $ = cheerio.load(html);
  const title = $("title").text().trim() || "Web Page";
  $(NOISE_SELECTORS).remove();
  const contact = extractContactInfo($);
  const root = findContentRoot($);
  const markdown = extractMarkdown($, root);
  const fullText = contact ? `${contact}\n\n${markdown}` : markdown;
  return { title, content: fullText, chunks: semanticChunk(fullText), knowledgeGraph: extractKnowledgeGraph($) };
}

// ============================================================
// SECTION 10 — NETWORK TIERS
// ============================================================
async function scrapeWithAxios(url) {
  const response = await axios.get(url, { timeout: CFG.AXIOS_TIMEOUT, headers: { "User-Agent": pickProfile().ua }, httpsAgent: new https.Agent({ rejectUnauthorized: false }) });
  return parseHtml(response.data);
}

async function scrapeWithPuppeteer(url) {
  return _puppeteerLimiter(async () => {
    const browser = await getBrowser(); const page = await browser.newPage();
    try {
      await page.setUserAgent(pickProfile().ua);
      await page.goto(url, { waitUntil: "networkidle2", timeout: CFG.PUPPETEER_TIMEOUT });
      await page.evaluate(() => {
        window.scrollBy(0, 1000);
        document.querySelectorAll("button, a").forEach(el => {
          if (/show|reveal|phone|email/i.test(el.innerText)) el.click();
        });
      });
      await new Promise(r => setTimeout(r, 1500));
      return parseHtml(await page.content());
    } finally { await page.close().catch(() => {}); }
  });
}

function findExpansionLinks($, baseUrl) {
  const keywords = ["contact", "about", "location"];
  const links = [];
  $("a").each((_, el) => {
    const href = $(el).attr("href"), text = $(el).text().toLowerCase();
    if (href && keywords.some(k => text.includes(k) || href.toLowerCase().includes(k))) {
      try { const abs = new URL(href, baseUrl).href; if (abs.startsWith(baseUrl)) links.push(abs); } catch {}
    }
  });
  return [...new Set(links)].slice(0, CFG.MAX_EXPANSION_LINKS);
}

// ============================================================
// SECTION 11 — MAIN EXPORT (Aggressive Escalation)
// ============================================================
async function scrapeUrl(url) {
  const limiter = getLimiter(url);
  let result = null;

  try {
    result = await limiter(() => scrapeWithAxios(url));
    const hasContact = result.chunks.some(c => c.role === "CONTACT_INFO");
    if (result.content.length > 800 && hasContact) {
      logger.info(`[Scraper] Tier 1 Axios OK — ${url}`);
    } else {
      logger.warn(`[Scraper] Tier 1 poor — Escalating...`);
      result = null;
    }
  } catch (err) { logger.warn(`[Scraper] Tier 1 failed: ${err.message}`); }

  if (!result) {
    logger.info(`[Scraper] 🚀 Launching Puppeteer "Click-to-Reveal" Engine for: ${url}`);
    result = await scrapeWithPuppeteer(url);
    if (result.content.length < CFG.MIN_CONTENT_LENGTH) throw new Error("Scrape failed: Content too thin.");
  }

  // Tier 3: Expansion
  try {
    const raw = await axios.get(url, { timeout: 5000, httpsAgent: new https.Agent({ rejectUnauthorized: false }) }).then(r => r.data).catch(() => null);
    if (raw) {
      const links = findExpansionLinks(cheerio.load(raw), url);
      if (links.length) {
        const batch = await Promise.allSettled(links.map(l => limiter(() => axios.get(l, { timeout: 5000, httpsAgent: new https.Agent({ rejectUnauthorized: false }) }))));
        const extras = batch.filter(b => b.status === "fulfilled").map(b => {
          const c = extractContactInfo(cheerio.load(b.value.data));
          return c ? `\n\n--- Expanded from ${b.value.config.url} ---\n${c}` : null;
        }).filter(Boolean);
        if (extras.length) { result.content = `${extras.join("")}\n\n${result.content}`; result.chunks = semanticChunk(result.content); }
      }
    }
  } catch (e) { logger.warn(`[Scraper] Expansion failed: ${e.message}`); }

  return result;
}

module.exports = { scrapeUrl };