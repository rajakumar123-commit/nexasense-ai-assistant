const { scrapeUrl } = require("./src/services/scraper.service");

async function runRobustTest() {
  const url = "https://www.speedcourierandcargo.com/";
  console.log(`🚀 STARTING ROBUST AUDIT (V4.1) for: ${url}\n`);

  try {
    const result = await scrapeUrl(url);
    console.log("=========================================");
    console.log("✅ AGENTIC 4.1 SCRAPER OUTPUT");
    console.log("=========================================\n");
    
    if (result.content.length > 500) {
        console.log("STATUS: SUCCESS ✅");
        console.log(`TITLE: ${result.title}`);
        console.log("\n--- PREVIEW ---");
        console.log(result.content.substring(0, 1000));
    } else {
        console.log("STATUS: LOW CONTENT DATA OR ERROR ❌");
    }

  } catch (err) {
    console.error(`❌ CRITICAL FAILURE: ${err.message}`);
    console.error(err.stack);
  }
}

runRobustTest();
