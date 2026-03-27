const { scrapeUrl } = require("./src/services/scraper.service");
const logger = require("./src/utils/logger");

async function test() {
  const url = "https://www.speedcourierandcargo.com/";
  console.log(`Testing scraper for: ${url}`);
  
  try {
    const result = await scrapeUrl(url);
    console.log("\n--- SCRAPER RESULT ---");
    console.log(`Title: ${result.title}`);
    console.log(`Description: ${result.description}`);
    console.log("\n--- CONTENT PREVIEW (First 1000 chars) ---");
    console.log(result.content.substring(0, 1000));
    console.log("\n--- END PREVIEW ---");
  } catch (err) {
    console.error(`Scrape failed: ${err.message}`);
  }
}

test();
