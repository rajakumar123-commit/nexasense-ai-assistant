const { scrapeUrl } = require("./src/services/scraper.service");

async function runUniversalTest() {
  const url = "https://www.google.com/about/";
  console.log(`Starting UNIVERSAL TEST for: ${url}\n`);

  try {
    const result = await scrapeUrl(url);
    
    console.log("=========================================");
    console.log("✅ UNIVERSAL SCRAPER OUTPUT (GOOGLE)");
    console.log("=========================================\n");
    
    console.log(`TITLE: ${result.title}`);
    console.log(`META DESC: ${result.description}\n`);
    
    // Show the first 1500 chars
    console.log(result.content.substring(0, 1500));
    
    console.log("\n=========================================");
    console.log("⭐ VERIFICATION CHECKLIST");
    console.log("1. Semantic Structure (###)? " + (result.content.includes("###") ? "YES" : "NO"));
    console.log("2. Markdown Links Found? " + (result.content.includes("[") && result.content.includes("]") ? "YES" : "NO"));
    console.log("=========================================");

  } catch (err) {
    console.error(`❌ UNIVERSAL TEST FAILED: ${err.message}`);
  }
}

runUniversalTest();
