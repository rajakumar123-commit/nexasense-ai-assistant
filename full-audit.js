const { scrapeUrl } = require("./src/services/scraper.service");
const fs = require("fs");

async function runFullAudit() {
  const url = "https://www.speedcourierandcargo.com/";
  try {
    const result = await scrapeUrl(url);
    fs.writeFileSync("full-scrape-report.txt", result.content);
    console.log("Full report written to full-scrape-report.txt");
  } catch (err) {
    console.error(err);
  }
}

runFullAudit();
