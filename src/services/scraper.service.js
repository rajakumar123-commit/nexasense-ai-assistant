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
  BROWSER_IDLE_TTL_MS: 60_000, // Keep browser alive for 60s to reuse across jobs
};

// Intentionally excluding <header> and <footer> to preserve contact/legal info
const NOISE_SELECTORS = [
  "script", "style", "noscript", "iframe", "svg", "canvas", "video", "audio", 
  "picture", "[aria-hidden='true']", ".cookie-banner", ".cookie-notice", 
  ".popup", ".modal", ".overlay", ".ad", ".ads", ".advertisement", "#cookie-banner"
].join(", ");

// ============================================================
// SECTION 2 — FINGERPRINT ROTATION (Bot Evasion)
// ============================================================

const BROWSER_PROFILES = [
  {
    ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    vp: { width: 1920, height: 1080 },
  },
  {
    ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
    vp: { width: 1440, height: 900 },
  },
  {
    ua: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    vp: { width: 1366, height: 768 },
  },
  {
    ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
    vp: { width: 1280, height: 1024 },
  },
];

function pickProfile() {
  return BROWSER_PROFILES[Math.floor(Math.random() * BROWSER_PROFILES.length)];
}

// ============================================================
// SECTION 3 — NATIVE RATE LIMITER (Zero Dependencies)
// ============================================================

function makeLimiter(concurrency) {
  let running = 0;
  const queue = [];
  const next = () => {
    if (running >= concurrency || !queue.length) return;
    running++;
    const { fn, resolve, reject } = queue.shift();
    fn().then(resolve).catch(reject).finally(() => { running--; next(); });
  };
  return (fn) => new Promise((resolve, reject) => {
    queue.push({ fn, resolve, reject });
    next();
  });
}

const _domainLimiters = new Map();
const _puppeteerLimiter = makeLimiter(1); // Strict 1-at-a-time to prevent Docker OOM

function getLimiter(url) {
  try {
    const domain = new URL(url).hostname;
    if (!_domainLimiters.has(domain)) {
      _domainLimiters.set(domain, makeLimiter(CFG.CONCURRENCY_PER_DOMAIN));
    }
    return _domainLimiters.get(domain);
  } catch {
    return makeLimiter(CFG.CONCURRENCY_PER_DOMAIN);
  }
}

// ============================================================
// SECTION 4 — SINGLETON BROWSER MANAGER
// ============================================================

let _browser = null;
let _browserUsed = 0;

function getChromePath() {
  // 1. Docker/Linux (Matches your Dockerfile ENV)
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  
  // 2. Local fallback
  try {
    const pt = require("puppeteer");
    if (typeof pt.executablePath === "function") return pt.executablePath();
  } catch { }
  
  // 3. System paths
  return process.platform === "win32" 
    ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" 
    : "/usr/bin/chromium";
}

async function getBrowser() {
  if (_browser && Date.now() - _browserUsed > CFG.BROWSER_IDLE_TTL_MS) {
    logger.info("[Scraper] Recycling idle browser to free RAM");
    await _browser.close().catch(() => { });
    _browser = null;
  }

  if (!_browser) {
    const execPath = getChromePath();
    logger.info(`[Scraper] Launching Chromium: ${execPath}`);

    _browser = await puppeteer.launch({
      headless: "new",
      executablePath: execPath,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage", // Crucial for Docker 256MB SHM
        "--disable-gpu",
        "--disable-extensions",
        "--disable-background-networking",
        "--disable-blink-features=AutomationControlled", // Bot evasion
        "--no-first-run",
        "--no-zygote",
        "--single-process",        // Cuts memory usage by ~40%
        "--js-flags=--max-old-space-size=256",
      ],
    });

    _browser.on("disconnected", () => {
      logger.warn("[Scraper] Browser disconnected — clearing instance");
      _browser = null;
    });
  }

  _browserUsed = Date.now();
  return _browser;
}

// ============================================================
// SECTION 5 — ROOT DETECTION & KNOWLEDGE GRAPH
// ============================================================

function findContentRoot($) {
  const candidates = [
    "main", "article", '[role="main"]', "#content", "#main", 
    "#main-content", ".content", ".main-content", ".page-body"
  ];

  // 1. Semantic Match
  for (const sel of candidates) {
    const el = $(sel).first();
    if (el.length && el.text().trim().length > CFG.MIN_CONTENT_LENGTH) return el;
  }

  // 2. Text-Density Fallback (Self-Healing)
  let best = null, bestScore = 0;
  $("div, section, article").each((_, node) => {
    const el = $(node);
    const text = el.text().replace(/\s+/g, " ").trim();
    const html = $.html(node);
    const words = text.split(" ").length;
    const score = (text.length * text.length) / Math.max(html.length, 1);
    if (words > 50 && score > bestScore) { bestScore = score; best = el; }
  });

  return best || $("body");
}

function extractKnowledgeGraph($) {
  const kg = { entities: [], relations: [] };
  let c = 0;
  const newId = (t) => `${t.toLowerCase().replace(/\s+/g, "_")}_${++c}`;

  const processNode = (data, pid = null, rel = null) => {
    if (!data || typeof data !== "object") return;
    const type = [].concat(data["@type"] || ["Unknown"])[0];
    const id = data["@id"] || newId(type);
    const props = {};
    
    for (const [k, v] of Object.entries(data)) {
      if (!k.startsWith("@") && (typeof v === "string" || typeof v === "number")) props[k] = v;
    }
    
    kg.entities.push({ id, type, name: data.name || data.headline || id, properties: props });
    if (pid && rel) kg.relations.push({ from: pid, relation: rel, to: id });
  };

  $('script[type="application/ld+json"]').each((_, el) => {
    try { [].concat(JSON.parse($(el).text())).forEach(n => processNode(n)); } catch { }
  });

  return kg;
}

// ============================================================
// SECTION 6 — SEMANTIC CHUNKING ENGINE
// ============================================================

function classifyBlock(text) {
  const patterns = [
    { role: "CONTACT_INFO", pattern: /(@|phone|email|address|tel:|mailto:|contact us)/i },
    { role: "SERVICE_DESCRIPTION", pattern: /(we offer|our services?|solutions?|capabilities|features)/i },
    { role: "PRODUCT_DETAIL", pattern: /(specifications?|dimensions?|SKU|price|₹|\$|USD)/i },
    { role: "TESTIMONIAL", pattern: /(review|testimonial|said|rated|stars?|⭐)/i },
    { role: "FAQ", pattern: /^\s*(q:|a:|question:|answer:|faq)/im },
    { role: "LEGAL_FOOTER", pattern: /(privacy policy|terms of (service|use)|copyright|all rights reserved|©)/i },
    { role: "TABLE_DATA", pattern: /^\|/m },
    { role: "HERO_HEADLINE", pattern: /^#{1,2}\s/m },
  ];
  for (const { role, pattern } of patterns) if (pattern.test(text)) return role;
  return "GENERAL_CONTENT";
}

function semanticChunk(text) {
  const rawBlocks = text.split(/\n\s*\n+/).map(b => b.trim()).filter(Boolean);
  const chunks = [];
  let buffer = "", bufRole = null;

  const flush = () => {
    if (!buffer.trim()) return;
    const wc = buffer.split(/\s+/).length;
    if (wc >= CFG.CHUNK_MIN_WORDS) {
      chunks.push({ 
        role: bufRole || classifyBlock(buffer), 
        text: buffer.trim(), 
        wordCount: wc, 
        chunkIndex: chunks.length 
      });
    }
    buffer = ""; bufRole = null;
  };

  for (const block of rawBlocks) {
    const role = classifyBlock(block);
    const wc = block.split(/\s+/).length;
    
    // Flush if role changes or if buffer gets too large
    if ((bufRole && role !== bufRole) || (buffer.split(/\s+/).length + wc > CFG.CHUNK_MAX_WORDS)) flush();
    buffer += (buffer ? "\n\n" : "") + block;
    bufRole = role;
  }
  flush();
  return chunks;
}

// ============================================================
// SECTION 7 — SANITIZATION & CONTACT EXTRACTION
// ============================================================

function cleanBoilerplate(text) {
  let cleaned = text.replace(/(read more|view more|learn more|click here|skip to content|main menu|toggle navigation|all rights reserved|copyright ©|terms of service|privacy policy)/gi, " ");
  cleaned = cleaned.replace(/\b[1Z]{1}[0-9A-Z]{13,18}\b/gi, " "); // Strip tracking numbers
  cleaned = cleaned.replace(/\b\d{12,25}\b/g, " "); // Strip long ID hashes
  return cleaned.replace(/\s+/g, " ").trim();
}

function extractContactInfo($) {
  const phones = new Set(), emails = new Set(), address = new Set();

  $("a[href^='tel:']").each((_, el) => { const n = $(el).text().trim(); if (n) phones.add(n); });
  $("a[href^='mailto:']").each((_, el) => { const m = $(el).text().trim(); if (m) emails.add(m); });
  
  $(["address", "[class*='address']", "[id*='address']", "[class*='contact']", "[id*='contact']", "footer [class*='location']"].join(", ")).each((_, el) => {
    const cleanText = cleanBoilerplate($(el).text());
    if (cleanText.length > 10 && cleanText.length < 400 && cleanText.split(" ").length >= 3) {
      address.add(cleanText);
    }
  });

  if (!phones.size && !emails.size && !address.size) return null;
  
  const lines = ["=== Contact Information ==="];
  if (phones.size) lines.push(`Phone: ${[...phones].join(" | ")}`);
  if (emails.size) lines.push(`Email: ${[...emails].join(" | ")}`);
  if (address.size) lines.push(`Address: ${[...address].join(" | ")}`);
  return lines.join("\n");
}

// ============================================================
// SECTION 8 — GOD-TIER MARKDOWN CONVERSION
// ============================================================

function convertTableToMarkdown($, tableEl) {
  const rows = [];
  $(tableEl).find("tr").each((_, tr) => {
    const cells = [];
    $(tr).find("th, td").each((_, td) => cells.push($(td).text().trim()));
    if (cells.length) rows.push(`| ${cells.join(" | ")} |`);
  });
  if (!rows.length) return "";
  const sep = `| ${Array(rows[0].split("|").length - 2).fill("---").join(" | ")} |`;
  rows.splice(1, 0, sep);
  return rows.join("\n");
}

function extractMarkdown($, root) {
  let markdown = "";
  const seenText = new Set();

  root.find("h1,h2,h3,h4,h5,h6,p,li,table,div,section").each((_, el) => {
    const $el = $(el);
    const tag = el.tagName.toLowerCase();

    if (tag === "table") {
      const tableMarkdown = convertTableToMarkdown($, el);
      if (tableMarkdown) markdown += `\n${tableMarkdown}\n`;
      return;
    }

    const text = $el.clone().children().remove().end().text().replace(/\s+/g, " ").trim();
    
    // Ignore short meaningless nodes or duplicates
    if (text.length < 15 || seenText.has(text) || text.split(" ").length < 3) return;

    if (tag.startsWith("h")) markdown += `\n${"#".repeat(parseInt(tag[1]))} ${text}\n`;
    else if (tag === "li") markdown += `* ${text}\n`;
    else markdown += `\n${text}\n`;

    seenText.add(text);
  });

  return markdown.trim().replace(/\n{3,}/g, "\n\n");
}

// ============================================================
// SECTION 9 — HTML PARSER
// ============================================================

function parseHtml(html, url) {
  const $ = cheerio.load(html);
  
  const title = $("title").text().trim() || $("h1").first().text().trim() || "Web Page Content";
  const description = $('meta[name="description"]').attr("content") || $('meta[property="og:description"]').attr("content") || "";
  const knowledgeGraph = extractKnowledgeGraph($);

  $(NOISE_SELECTORS).remove();

  const contactData = extractContactInfo($);
  const root = findContentRoot($);
  const markdownContent = extractMarkdown($, root);

  // Core Rule: Contact block prioritized at the very top
  const fullText = contactData ? `${contactData}\n\n${markdownContent}` : markdownContent;
  const chunks = semanticChunk(fullText);

  return { title, description, content: fullText, chunks, knowledgeGraph };
}

// ============================================================
// SECTION 10 — NETWORK TIERS (Axios -> Puppeteer)
// ============================================================

async function scrapeWithAxios(url) {
  const profile = pickProfile();
  const response = await axios.get(url, {
    timeout: CFG.AXIOS_TIMEOUT,
    httpsAgent: new https.Agent({ rejectUnauthorized: false }),
    headers: {
      "User-Agent": profile.ua,
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "Cache-Control": "no-cache",
    },
  });
  return parseHtml(response.data, url);
}

async function scrapeWithPuppeteer(url) {
  return _puppeteerLimiter(async () => {
    const profile = pickProfile();
    const browser = await getBrowser();
    let page = null;

    try {
      page = await browser.newPage();
      await page.setViewport(profile.vp);
      await page.setUserAgent(profile.ua);

      // Block heavy assets to save bandwidth and memory
      await page.setRequestInterception(true);
      page.on("request", (req) => {
        ["image", "stylesheet", "font", "media"].includes(req.resourceType()) ? req.abort() : req.continue();
      });

      await page.goto(url, { waitUntil: "networkidle2", timeout: CFG.PUPPETEER_TIMEOUT });

      // Trigger lazy loads
      await page.evaluate(async () => {
        await new Promise(r => {
          let scrolled = 0;
          const t = setInterval(() => { window.scrollBy(0, 300); scrolled += 300; if (scrolled > 5000) { clearInterval(t); r(); } }, 100);
        });
      });

      // Agentic "Click-to-Reveal"
      await page.evaluate(() => {
        document.querySelectorAll("button, span[role='button'], div[class*='btn'], a[class*='btn']").forEach(el => {
          if (/show|reveal|view|expand|more|number|phone|email/i.test(el.innerText) && el.innerText.trim().length < 25) { 
            try { el.click(); } catch { } 
          }
        });
      });

      await new Promise(r => setTimeout(r, 1000));
      return parseHtml(await page.content(), url);
      
    } finally {
      if (page) await page.close().catch(() => { });
    }
  });
}

function findExpansionLinks($, baseUrl) {
  const keywords = ["contact", "about", "reach", "location"];
  const collected = [];
  $("a").each((_, el) => {
    const text = $(el).text().toLowerCase();
    const href = $(el).attr("href");
    if (!href || href.startsWith("#") || href.startsWith("mailto:")) return;
    if (keywords.some(kw => text.includes(kw) || href.toLowerCase().includes(kw))) {
      try { const abs = new URL(href, baseUrl).href; if (abs.startsWith(baseUrl)) collected.push(abs); } catch { }
    }
  });
  return [...new Set(collected)].slice(0, CFG.MAX_EXPANSION_LINKS);
}

// ============================================================
// SECTION 11 — MAIN EXPORT
// ============================================================

async function scrapeUrl(url) {
  const limiter = getLimiter(url);
  let result = null;

  // Tier 1: Axios
  try {
    result = await limiter(() => scrapeWithAxios(url));
    if (result.content.length >= CFG.MIN_CONTENT_LENGTH) {
      logger.info(`[Scraper] Axios OK — ${result.content.length} chars | ${result.chunks.length} chunks from ${url}`);
    } else {
      logger.warn(`[Scraper] Axios thin (${result.content.length} chars) — escalating to Puppeteer`);
      result = null;
    }
  } catch (err) { 
    logger.warn(`[Scraper] Axios failed: ${err.message} — escalating to Puppeteer`); 
  }

  // Tier 2: Puppeteer Escalation
  if (!result) {
    logger.info(`[Scraper] Puppeteer launching for: ${url}`);
    result = await scrapeWithPuppeteer(url);
    if (result.content.length < CFG.MIN_CONTENT_LENGTH) throw new Error("Could not extract meaningful content. Site may have bot protection.");
    logger.info(`[Scraper] Puppeteer OK — ${result.content.length} chars | ${result.chunks.length} chunks from ${url}`);
  }

  // Tier 3: Expansion (Contact/About pages)
  try {
    const rawHtml = await axios.get(url, { timeout: 6000, httpsAgent: new https.Agent({ rejectUnauthorized: false }) }).then(r => r.data).catch(() => "");
    if (rawHtml) {
      const $exp = cheerio.load(rawHtml);
      const links = findExpansionLinks($exp, url);
      
      if (links.length) {
        logger.debug(`[Scraper] Expanding ${links.length} supplemental links`);
        const batch = await Promise.allSettled(links.map(link => limiter(() => axios.get(link, { timeout: 8000, httpsAgent: new https.Agent({ rejectUnauthorized: false }) }))));
        
        const extras = batch.filter(b => b.status === "fulfilled").map(b => {
          const contact = extractContactInfo(cheerio.load(b.value.data));
          return contact ? `--- Supplemental: ${b.value.config.url} ---\n${contact}` : null;
        }).filter(Boolean);
        
        if (extras.length) result.content = `${extras.join("\n\n")}\n\n${result.content}`;
      }
    }
  } catch (err) { 
    logger.warn(`[Scraper] Expansion scrape failed: ${err.message}`); 
  }

  return result;
}

module.exports = { scrapeUrl };