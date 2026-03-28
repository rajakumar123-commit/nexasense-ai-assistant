// ============================================================
// Scraper Service — NexaSense AI Assistant V5.1 God Tier
// Best-of-both merge: Your V4.2.2 precision + V5.0 architecture
//
// FROM YOUR VERSION (kept as-is — yours was better):
//   ✅ isImportant chunk logic — short phone/email never dropped
//   ✅ Smarter escalation — checks contact chunk presence too
//   ✅ Simpler, leaner role classifier (5 clean roles)
//   ✅ Contact extractor uses footer selector too
//
// FROM MY V5 (added — yours was missing these):
//   ✅ Request interception in Puppeteer (blocks img/css/font — saves RAM)
//   ✅ Cross-platform Chrome path (Win scan + Mac + Linux fs.existsSync)
//   ✅ Progressive scroll (250px steps up to 5000px — not one-shot)
//   ✅ 10 Puppeteer launch args (V8 heap cap, --no-zygote etc.)
//   ✅ 13 content root candidates (covers more CMS patterns)
//   ✅ Richer KG extraction (entities + relations, not just raw objects)
//   ✅ Broader click-to-reveal selector
// ============================================================

"use strict";

const axios     = require("axios");
const https     = require("https");
const cheerio   = require("cheerio");
const puppeteer = require("puppeteer");
const logger    = require("../utils/logger");

// ============================================================
// SECTION 1 — CONFIG
// ============================================================

const CFG = {
  MIN_CONTENT_LENGTH    : 150,
  AXIOS_TIMEOUT         : 10_000,
  PUPPETEER_TIMEOUT     : 20_000,
  CONCURRENCY_PER_DOMAIN: 2,
  MAX_EXPANSION_LINKS   : 2,
  CHUNK_MIN_WORDS       : 25,
  CHUNK_MAX_WORDS       : 350,
  BROWSER_IDLE_TTL_MS   : 60_000,
};

const NOISE_SELECTORS = [
  "script", "style", "noscript", "iframe", "svg", "canvas",
  "video", "audio", "picture", "[aria-hidden='true']",
  ".cookie-banner", ".cookie-notice", ".popup", ".modal",
  ".overlay", ".ad", ".ads", ".advertisement",
  "#cookie-banner", "#popup",
].join(", ");

// ============================================================
// SECTION 2 — CROSS-PLATFORM CHROME PATH (FROM V5)
// ENV → puppeteer bundled → Win scan → Mac → Linux scan
// ============================================================

function getChromePath() {
  // 1. Docker / EC2 ENV always wins
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }

  // 2. Puppeteer bundled browser (local dev — npm install puppeteer)
  try {
    const pt = require("puppeteer");
    if (typeof pt.executablePath === "function") {
      const p = pt.executablePath();
      if (p) return p;
    }
  } catch {}

  const fs = require("fs");

  // 3. Windows — scan common install paths
  if (process.platform === "win32") {
    const winPaths = [
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
      process.env.LOCALAPPDATA
        ? `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`
        : null,
      "C:\\Program Files\\Chromium\\Application\\chrome.exe",
    ].filter(Boolean);
    for (const p of winPaths) if (fs.existsSync(p)) return p;
    return winPaths[0]; // best guess — will give clear error if missing
  }

  // 4. macOS
  if (process.platform === "darwin") {
    return "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  }

  // 5. Linux / Docker — scan in priority order
  const linuxPaths = [
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/snap/bin/chromium",
  ];
  for (const p of linuxPaths) if (fs.existsSync(p)) return p;

  return "/usr/bin/chromium"; // Docker default fallback
}

// ============================================================
// SECTION 3 — FINGERPRINT ROTATION
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
// SECTION 4 — BUILT-IN RATE LIMITER (pure Node.js)
// ============================================================

function makeLimiter(concurrency) {
  let running = 0;
  const queue = [];
  const next  = () => {
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

const _domainLimiters   = new Map();
const _puppeteerLimiter = makeLimiter(1); // ONE Puppeteer job at a time

function getLimiter(url) {
  try {
    const domain = new URL(url).hostname;
    if (!_domainLimiters.has(domain))
      _domainLimiters.set(domain, makeLimiter(CFG.CONCURRENCY_PER_DOMAIN));
    return _domainLimiters.get(domain);
  } catch {
    return makeLimiter(CFG.CONCURRENCY_PER_DOMAIN);
  }
}

// ============================================================
// SECTION 5 — SINGLETON PUPPETEER BROWSER
// One browser reused across all jobs — saves ~300MB per scrape
// ============================================================

let _browser     = null;
let _browserUsed = 0;

async function getBrowser() {
  // Recycle stale browser
  if (_browser && Date.now() - _browserUsed > CFG.BROWSER_IDLE_TTL_MS) {
    logger.info("[Scraper] Recycling idle browser to free RAM");
    await _browser.close().catch(() => {});
    _browser = null;
  }

  if (!_browser) {
    const execPath = getChromePath();
    logger.info(`[Scraper] Launching browser: ${execPath}`);

    _browser = await puppeteer.launch({
      headless      : "new",
      executablePath: execPath,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",          // critical on EC2
        "--disable-gpu",
        "--disable-extensions",
        "--disable-background-networking",
        "--disable-default-apps",
        "--no-first-run",
        "--no-zygote",                      // saves ~50MB
        "--single-process",                 // saves ~150MB on micro
        "--js-flags=--max-old-space-size=256",
        "--disable-blink-features=AutomationControlled",
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
// SECTION 6 — SELF-HEALING CONTENT ROOT (FROM V5 — 13 candidates)
// ============================================================

const CONTENT_ROOT_CANDIDATES = [
  "main",
  "article",
  '[role="main"]',
  "#content", "#main", "#main-content", "#primary",
  ".content", ".main-content", ".post-content",
  ".entry-content", ".article-body", ".page-body",
];

function findContentRoot($) {
  // 1. Semantic selectors
  for (const sel of CONTENT_ROOT_CANDIDATES) {
    const el = $(sel).first();
    if (el.length && el.text().trim().length > CFG.MIN_CONTENT_LENGTH) {
      logger.debug(`[Scraper] Content root: ${sel}`);
      return el;
    }
  }

  // 2. Text-density fallback
  let best = null, bestScore = 0;
  $("div, section, article").each((_, node) => {
    const el    = $(node);
    const text  = el.text().replace(/\s+/g, " ").trim();
    const html  = $.html(node);
    const words = text.split(" ").length;
    const score = (text.length * text.length) / Math.max(html.length, 1);
    if (words > 50 && score > bestScore) { bestScore = score; best = el; }
  });

  if (best) return best;

  logger.warn("[Scraper] Using body fallback");
  return $("body");
}

// ============================================================
// SECTION 7 — KNOWLEDGE GRAPH (FROM V5 — entities + relations)
// ============================================================

function extractKnowledgeGraph($) {
  const kg = { entities: [], relations: [] };
  let   c  = 0;
  const newId = (t) => `${t.toLowerCase().replace(/\s+/g, "_")}_${++c}`;

  const RELS = {
    address            : "hasAddress",
    contactPoint       : "hasContactPoint",
    founder            : "hasFounder",
    offers             : "offers",
    review             : "hasReview",
    author             : "authoredBy",
    publisher          : "publishedBy",
    parentOrganization : "partOf",
  };

  const processNode = (data, pid = null, rel = null) => {
    if (!data || typeof data !== "object") return;
    const type  = [].concat(data["@type"] || ["Unknown"])[0];
    const id    = data["@id"] || newId(type);
    const props = {};
    for (const [k, v] of Object.entries(data)) {
      if (!k.startsWith("@") && (typeof v === "string" || typeof v === "number"))
        props[k] = v;
    }
    kg.entities.push({ id, type, name: data.name || data.headline || id, properties: props });
    if (pid && rel) kg.relations.push({ from: pid, relation: rel, to: id });
    for (const [f, r] of Object.entries(RELS)) {
      if (data[f]) [].concat(data[f]).forEach(ch => processNode(ch, id, r));
    }
  };

  $('script[type="application/ld+json"]').each((_, el) => {
    try { [].concat(JSON.parse($(el).text())).forEach(n => processNode(n)); } catch {}
  });

  return kg;
}

// ============================================================
// SECTION 8 — SEMANTIC CHUNKING (YOUR VERSION — isImportant fix)
// Short phone/email chunks are NEVER dropped
// ============================================================

function classifyBlock(text) {
  if (/(@|phone|email|address|tel:|mailto:|contact)/i.test(text)) return "CONTACT_INFO";
  if (/(we offer|services|solutions|features)/i.test(text))        return "SERVICE_DESCRIPTION";
  if (/(specifications|SKU|price|₹|\$)/i.test(text))              return "PRODUCT_DETAIL";
  if (/(review|testimonial|rated|stars?)/i.test(text))             return "TESTIMONIAL";
  if (/^\s*(q:|a:|question:|answer:|faq)/im.test(text))            return "FAQ";
  if (/(privacy policy|terms of service|copyright|©)/i.test(text)) return "LEGAL_FOOTER";
  return "GENERAL_CONTENT";
}

function semanticChunk(text) {
  const raw    = text.split(/\n\s*\n+/).map(b => b.trim()).filter(Boolean);
  const chunks = [];
  let   buffer = "", bufRole = null;

  const flush = () => {
    if (!buffer.trim()) return;
    const wc = buffer.split(/\s+/).length;

    // YOUR FIX: Important contact/service/product blocks skip word minimum
    // Ensures "Phone: +91 98765 43210" is never silently dropped
    const isImportant = (
      bufRole === "CONTACT_INFO"        ||
      bufRole === "SERVICE_DESCRIPTION" ||
      bufRole === "PRODUCT_DETAIL"
    );

    if (wc >= CFG.CHUNK_MIN_WORDS || isImportant) {
      chunks.push({
        role      : bufRole || "GENERAL_CONTENT",
        text      : buffer.trim(),
        wordCount : wc,
        chunkIndex: chunks.length,
      });
    }
    buffer = ""; bufRole = null;
  };

  for (const b of raw) {
    const role = classifyBlock(b);
    const wc   = b.split(/\s+/).length;
    if ((bufRole && role !== bufRole) ||
        (buffer.split(/\s+/).length + wc > CFG.CHUNK_MAX_WORDS)) flush();
    buffer  += (buffer ? "\n\n" : "") + b;
    bufRole  = role;
  }
  flush();

  logger.debug(`[Scraper] Chunks: ${chunks.length}`);
  return chunks;
}

// ============================================================
// SECTION 9 — CONTACT INFO EXTRACTOR (YOUR VERSION + footer)
// ============================================================

function extractContactInfo($) {
  const phones  = new Set();
  const emails  = new Set();
  const address = new Set();

  $("a[href^='tel:']").each((_, el) => {
    const t = $(el).text().trim(); if (t) phones.add(t);
  });
  $("a[href^='mailto:']").each((_, el) => {
    const m = $(el).text().trim(); if (m) emails.add(m);
  });

  // YOUR VERSION: includes footer selector — catches most Indian business sites
  $(["address", "[class*='address']", "[id*='address']",
     "[class*='contact']", "[id*='contact']", "footer"].join(", ")
  ).each((_, el) => {
    const txt = $(el).text().replace(/\s+/g, " ").trim();
    if (txt.length > 20 && txt.length < 300 &&
        classifyBlock(txt) === "CONTACT_INFO") address.add(txt);
  });

  if (!phones.size && !emails.size && !address.size) return null;

  const lines = ["=== Contact Information ==="];
  if (phones.size)  lines.push(`Phone: ${[...phones].join(" | ")}`);
  if (emails.size)  lines.push(`Email: ${[...emails].join(" | ")}`);
  if (address.size) lines.push(`Address: ${[...address].join(" | ")}`);
  return lines.join("\n");
}

// ============================================================
// SECTION 10 — MARKDOWN EXTRACTION (V4.2.2 proven logic)
// h1-h6 → #, li → *, tables preserved
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
  let   md   = "";
  const seen = new Set();

  root.find("h1,h2,h3,h4,h5,h6,p,li,table").each((_, el) => {
    const tag = el.tagName.toLowerCase();

    if (tag === "table") {
      md += `\n${convertTableToMarkdown($, el)}\n`;
      return;
    }

    const text = $(el).text().replace(/\s+/g, " ").trim();
    if (text.length < 15 || seen.has(text)) return;

    if (tag.startsWith("h")) {
      md += `\n${"#".repeat(parseInt(tag[1]))} ${text}\n`;
    } else if (tag === "li") {
      md += `* ${text}\n`;
    } else {
      md += `\n${text}\n`;
    }

    seen.add(text);
  });

  return md.trim().replace(/\n{3,}/g, "\n\n");
}

// ============================================================
// SECTION 11 — HTML PARSER (shared by Axios + Puppeteer)
// ============================================================

function parseHtml(html, url) {
  const $ = cheerio.load(html);

  const title =
    $("title").text().trim() ||
    $("h1").first().text().trim() ||
    "Web Page";

  const description =
    $('meta[name="description"]').attr("content") ||
    $('meta[property="og:description"]').attr("content") ||
    "";

  // KG before noise removal
  const knowledgeGraph = extractKnowledgeGraph($);

  // Remove noise
  $(NOISE_SELECTORS).remove();

  // Contact info (full DOM — before root narrowing)
  const contact = extractContactInfo($);

  // Self-healing content root
  const root = findContentRoot($);

  // Markdown from root
  const markdown = extractMarkdown($, root);

  // Contact block first → lands in chunk 0 → best similarity for contact queries
  const fullText = contact ? `${contact}\n\n${markdown}` : markdown;

  return {
    title,
    description,
    content      : fullText,   // worker.js uses this — no breaking change
    chunks       : semanticChunk(fullText),
    knowledgeGraph,
  };
}

// ============================================================
// SECTION 12 — TIER 1: AXIOS
// ============================================================

async function scrapeWithAxios(url) {
  const profile  = pickProfile();
  const response = await axios.get(url, {
    timeout   : CFG.AXIOS_TIMEOUT,
    httpsAgent: new https.Agent({ rejectUnauthorized: false }),
    headers   : {
      "User-Agent"     : profile.ua,
      "Accept"         : "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "Cache-Control"  : "no-cache",
    },
  });
  return parseHtml(response.data, url);
}

// ============================================================
// SECTION 13 — TIER 2: PUPPETEER (Singleton + Agentic)
// FROM V5: request interception + progressive scroll
// FROM YOURS: click-to-reveal logic
// ============================================================

async function scrapeWithPuppeteer(url) {
  return _puppeteerLimiter(async () => {
    const profile = pickProfile();
    const browser = await getBrowser();
    let   page    = null;

    try {
      page = await browser.newPage();
      await page.setViewport(profile.vp);
      await page.setUserAgent(profile.ua);

      // FROM V5: Block heavy assets — saves RAM + speeds up load
      await page.setRequestInterception(true);
      page.on("request", (req) => {
        ["image", "stylesheet", "font", "media"].includes(req.resourceType())
          ? req.abort() : req.continue();
      });

      await page.goto(url, {
        waitUntil: "networkidle2",
        timeout  : CFG.PUPPETEER_TIMEOUT,
      });

      // FROM V5: Progressive scroll — catches lazy-loaded content
      await page.evaluate(async () => {
        await new Promise(r => {
          let scrolled = 0;
          const t = setInterval(() => {
            window.scrollBy(0, 250);
            scrolled += 250;
            if (scrolled > 5000) { clearInterval(t); r(); }
          }, 100);
        });
      });

      // FROM YOURS + broader selectors: Click-to-Reveal agentic engine
      await page.evaluate(() => {
        document.querySelectorAll(
          "button, span[role='button'], div[class*='btn'], a[class*='btn'], a"
        ).forEach(el => {
          if (/show|reveal|phone|email|view|expand|more|number/i.test(el.innerText) &&
              el.innerText.trim().length < 25) {
            try { el.click(); } catch {}
          }
        });
      });

      // Wait for revealed content to render
      await new Promise(r => setTimeout(r, 1500));

      return parseHtml(await page.content(), url);

    } finally {
      // Close PAGE not browser — singleton stays alive for next job
      if (page) await page.close().catch(() => {});
    }
  });
}

// ============================================================
// SECTION 14 — EXPANSION LINKS
// ============================================================

function findExpansionLinks($, baseUrl) {
  const keywords  = ["contact", "about", "location", "reach"];
  const collected = [];

  $("a").each((_, el) => {
    const href = $(el).attr("href");
    const text = $(el).text().toLowerCase();
    if (!href || href.startsWith("#") || href.startsWith("mailto:")) return;
    if (keywords.some(k => text.includes(k) || href.toLowerCase().includes(k))) {
      try {
        const abs = new URL(href, baseUrl).href;
        if (abs.startsWith(baseUrl)) collected.push(abs);
      } catch {}
    }
  });

  return [...new Set(collected)].slice(0, CFG.MAX_EXPANSION_LINKS);
}

// ============================================================
// SECTION 15 — MAIN EXPORT
// YOUR smarter escalation: checks contact chunk presence too
// Return shape identical to V4 — worker.js needs no changes
// ============================================================

async function scrapeUrl(url) {
  const limiter = getLimiter(url);
  let   result  = null;

  // Tier 1: Axios
  try {
    result = await limiter(() => scrapeWithAxios(url));

    // YOUR LOGIC: escalate if content thin OR contact data missing
    const hasContact = result.chunks.some(c => c.role === "CONTACT_INFO");
    if (result.content.length > 800 && hasContact) {
      logger.info(`[Scraper] Tier 1 Axios OK — ${result.chunks.length} chunks from ${url}`);
    } else {
      logger.warn(`[Scraper] Tier 1 poor (len=${result.content.length} contact=${hasContact}) — escalating to Puppeteer`);
      result = null;
    }
  } catch (err) {
    logger.warn(`[Scraper] Tier 1 failed: ${err.message} — escalating to Puppeteer`);
  }

  // Tier 2: Puppeteer
  if (!result) {
    logger.info(`[Scraper] Launching Puppeteer Click-to-Reveal Engine for: ${url}`);
    result = await scrapeWithPuppeteer(url);

    if (result.content.length < CFG.MIN_CONTENT_LENGTH) {
      throw new Error(
        "Could not extract meaningful content. " +
        "This site may require login or have bot protection."
      );
    }

    logger.info(`[Scraper] Tier 2 Puppeteer OK — ${result.chunks.length} chunks from ${url}`);
  }

  // Expansion: contact/about pages
  try {
    const raw = await axios.get(url, {
      timeout   : 5000,
      httpsAgent: new https.Agent({ rejectUnauthorized: false }),
    }).then(r => r.data).catch(() => null);

    if (raw) {
      const $exp  = cheerio.load(raw);
      const links = findExpansionLinks($exp, url);

      if (links.length) {
        logger.debug(`[Scraper] Expanding ${links.length} supplemental links`);

        const batch = await Promise.allSettled(
          links.map(link =>
            limiter(() =>
              axios.get(link, {
                timeout   : 5000,
                httpsAgent: new https.Agent({ rejectUnauthorized: false }),
              })
            )
          )
        );

        const extras = batch
          .filter(b => b.status === "fulfilled")
          .map(b => {
            const c = extractContactInfo(cheerio.load(b.value.data));
            return c
              ? `\n\n--- Expanded from ${b.value.config.url} ---\n${c}`
              : null;
          })
          .filter(Boolean);

        if (extras.length) {
          result.content = `${extras.join("")}\n\n${result.content}`;
          result.chunks  = semanticChunk(result.content); // re-chunk with extra contact data
        }
      }
    }
  } catch (err) {
    logger.warn(`[Scraper] Expansion failed: ${err.message}`);
  }

  return result;
}

module.exports = { scrapeUrl };