// ============================================================
// Scraper Service
// NexaSense AI Assistant
// Tiered scraping: Axios (fast) → Puppeteer fallback (JS sites)
// ============================================================

const axios     = require("axios");
const https     = require("https");
const cheerio   = require("cheerio");
const puppeteer = require("puppeteer");
const logger    = require("../utils/logger");

// ── Noise selectors — header/footer intentionally excluded ─
const NOISE_SELECTORS = [
  "script", "style", "noscript", "iframe",
  "svg", "canvas", "video", "audio", "picture",
  "[aria-hidden='true']",
  ".cookie-banner", ".cookie-notice",
  ".popup", ".modal", ".overlay",
  ".ad", ".ads", ".advertisement",
  "#cookie-banner", "#popup",
].join(", ");

// Minimum chars — agar kam mila toh JS site hai
const MIN_CONTENT_LENGTH = 150;


// ============================================================
// TIER 1 — Axios + Cheerio (fast ~500ms)
// ============================================================

async function scrapeWithAxios(url) {
  const response = await axios.get(url, {
    timeout: 10000,
    httpsAgent: new https.Agent({ rejectUnauthorized: false }),
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "Cache-Control": "no-cache",
    }
  });

  return parseHtml(response.data, url);
}


// ============================================================
// TIER 2 — Puppeteer (JS-rendered sites ~4-6s)
// ============================================================

async function scrapeWithPuppeteer(url) {
  let browser = null;

  try {
    browser = await puppeteer.launch({
      headless: "new",
      // ENV se path lo — Dockerfile mein set kiya hai
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || "/usr/bin/chromium",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-extensions",
        "--disable-background-networking",
        "--no-first-run",
        "--no-zygote",
      ]
    });

    const page = await browser.newPage();

    // Images/fonts/CSS block karo — sirf HTML chahiye
    // Isse speed 2x ho jaati hai
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      const blocked = ["image", "stylesheet", "font", "media"];
      blocked.includes(req.resourceType()) ? req.abort() : req.continue();
    });

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    );

    await page.goto(url, { waitUntil: "networkidle2", timeout: 20000 });

    const html = await page.content();
    return parseHtml(html, url);

  } finally {
    // ⚠️ KABHI MAT BHOOLNA — warna memory leak
    if (browser) await browser.close();
  }
}


// ============================================================
// HTML Parser — shared by both Axios and Puppeteer
// ============================================================

function parseHtml(html, url) {
  const $ = cheerio.load(html);

  // 1. Metadata PEHLE extract karo — DOM changes se pehle
  const title =
    $("title").text().trim() ||
    $("h1").first().text().trim() ||
    "Web Page Content";

  const description =
    $('meta[name="description"]').attr("content") ||
    $('meta[property="og:description"]').attr("content") ||
    "";

  // 2. Noise remove karo — header/footer preserve karo
  $(NOISE_SELECTORS).remove();

  // 3. Contact info directly DOM se extract karo
  const contactData = extractContactInfo($);

  // 4. Main content
  const rawContent =
    $("article").text().trim() ||
    $("main").text().trim()    ||
    $("body").text().trim();

  // 5. Whitespace normalize karo
  const cleanBody = rawContent
    .replace(/\n\s*\n/g, "\n\n")
    .replace(/[ \t]+/g, " ")
    .trim();

  // 6. Contact block pehle rakho — chunk 0 mein aayega
  //    Isse contact queries ka similarity score high hoga
  const content = contactData
    ? `${contactData}\n\n${cleanBody}`
    : cleanBody;

  return { title, description, content };
}


// ============================================================
// Contact Info Extractor
// tel:/mailto: anchors aur address selectors se directly lo
// ============================================================

function extractContactInfo($) {
  const phones  = new Set();
  const emails  = new Set();
  const address = new Set();

  $("a[href^='tel:']").each((_, el) => {
    const num = $(el).text().trim();
    if (num) phones.add(num);
  });

  $("a[href^='mailto:']").each((_, el) => {
    const mail = $(el).text().trim();
    if (mail) emails.add(mail);
  });

  $(["address", "[class*='address']", "[id*='address']",
     "[class*='contact']", "[id*='contact']"].join(", ")
  ).each((_, el) => {
    const text = $(el).text().replace(/\s+/g, " ").trim();
    if (text.length > 10 && text.length < 400) address.add(text);
  });

  if (!phones.size && !emails.size && !address.size) return null;

  const lines = ["=== Contact Information ==="];
  if (phones.size)  lines.push(`Phone: ${[...phones].join(" | ")}`);
  if (emails.size)  lines.push(`Email: ${[...emails].join(" | ")}`);
  if (address.size) lines.push(`Address: ${[...address].join(" | ")}`);

  return lines.join("\n");
}


// ============================================================
// Main Export — Tiered Scraper
// ============================================================

async function scrapeUrl(url) {
  // ── Tier 1: Axios ────────────────────────────────────────
  try {
    const result = await scrapeWithAxios(url);

    if (result.content.length >= MIN_CONTENT_LENGTH) {
      logger.info(`[Scraper] Axios OK — ${result.content.length} chars from ${url}`);
      return result;
    }

    logger.warn(`[Scraper] Axios got ${result.content.length} chars — JS site, trying Puppeteer`);

  } catch (axiosErr) {
    logger.warn(`[Scraper] Axios failed: ${axiosErr.message} — trying Puppeteer`);
  }

  // ── Tier 2: Puppeteer ────────────────────────────────────
  logger.info(`[Scraper] Puppeteer launching for: ${url}`);
  const result = await scrapeWithPuppeteer(url);

  if (result.content.length < MIN_CONTENT_LENGTH) {
    throw new Error(
      "Could not extract meaningful content. " +
      "This site may require login or have bot protection."
    );
  }

  logger.info(`[Scraper] Puppeteer OK — ${result.content.length} chars from ${url}`);
  return result;
}


module.exports = { scrapeUrl };
