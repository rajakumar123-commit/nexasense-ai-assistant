const { scrapeUrl } = require("./src/services/scraper.service");

async function runTest() {
  const url = "https://www.speedcourier.com/";
  console.log(`Starting ELITE TEST for: ${url}\n`);

  try {
    const result = await scrapeUrl(url);
    console.log("=========================================");
    console.log("✅ ELITE SCRAPER OUTPUT");
    console.log("=========================================\n");
    console.log(`TITLE: ${result.title}\n`);
    console.log(result.content.substring(0, 2000));
  } catch (err) {
    console.error(`❌ TEST FAILED: ${err.message}`);
  }
}

runTest();
