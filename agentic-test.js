const { scrapeUrl } = require("./src/services/scraper.service");

async function runAgenticTest() {
  const url = "https://www.speedcourierandcargo.com/";
  console.log(`Starting AGENTIC 4.0 TEST for: ${url}\n`);

  try {
    const result = await scrapeUrl(url);
    console.log("=========================================");
    console.log("🔥 AGENTIC 4.0 SCRAPER OUTPUT");
    console.log("=========================================\n");
    console.log(`TITLE: ${result.title}`);
    console.log(`DESC: ${result.description}\n`);
    
    // Show top of content (Breadcrumbs + Contacts)
    console.log(result.content.substring(0, 1500));
    
    console.log("\n=========================================");
    console.log("⭐ AGENTIC VERIFICATION");
    console.log("1. Breadcrumbs Found? " + (result.content.includes("PATH:") ? "YES ✅" : "NO ❌"));
    console.log("2. Parallel Expansion? " + (result.content.includes("AGENTIC EXPANSION DATA") ? "YES ✅" : "NO ❌"));
    console.log("=========================================");

  } catch (err) {
    console.error(`❌ TEST FAILED: ${err.message}`);
  }
}

runAgenticTest();
