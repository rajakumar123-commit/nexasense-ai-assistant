// ============================================================
// Scraper Service
// NexaSense AI Assistant
// Extract readable text from URLs using axios + cheerio
// ============================================================

const axios   = require("axios");
const https   = require("https");
const cheerio = require("cheerio");
const logger  = require("../utils/logger");

/**
 * Fetch and extract clean text from a public URL
 * @param {string} url 
 * @returns {Promise<{ title: string, content: string, description: string }>}
 */
async function scrapeUrl(url) {
  try {
    logger.info(`[Scraper] Fetching: ${url}`);

    const response = await axios.get(url, {
      timeout: 10000,
      httpsAgent: new https.Agent({
        rejectUnauthorized: false // Skip SSL cert check to prevent "unable to get local issuer certificate"
      }),
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache"
      }
    });

    const html = response.data;
    const $ = cheerio.load(html);

    // 1. Remove noise
    $("script, style, nav, footer, iframe, ads, .ads, #ads, header, .header").remove();

    // 2. Extract Metadata
    const title = $("title").text().trim() || $("h1").first().text().trim() || "Web Page Content";
    const description = $('meta[name="description"]').attr("content") || "";

    // 3. Extract Core Content
    // We try to find the main article container first
    let mainContent = $("article").text().trim() || $("main").text().trim() || $("body").text().trim();

    // 4. Normalize Whitespace
    const cleanContent = mainContent
      .replace(/\n\s*\n/g, "\n\n") // Collapse multiple newlines
      .replace(/[ \t]+/g, " ")     // Collapse horizontal whitespace
      .trim();

    logger.info(`[Scraper] Successfully extracted ${cleanContent.length} chars from ${url}`);

    return {
      title,
      description,
      content: cleanContent
    };
  } catch (error) {
    logger.error(`[Scraper] Failed to scrape ${url}: ${error.message}`);
    throw new Error(`Failed to access the website: ${error.message}`);
  }
}

module.exports = {
  scrapeUrl
};
