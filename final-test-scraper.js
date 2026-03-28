const { scrapeUrl } = require("./src/services/scraper.service");

async function runFinalTest() {
  const url = "https://www.speedcourierandcargo.com/";
  console.log(`Starting ELITE SCRAPE for: ${url}\n`);

  try {
    const result = await scrapeUrl(url);
    
    console.log("=========================================");
    console.log("✅ ELITE SCRAPER OUTPUT FOR LLM CONTEXT");
    console.log("=========================================\n");
    
    console.log(`TITLE: ${result.title}`);
    console.log(`META DESC: ${result.description}\n`);
    
    // Show the first 2500 characters to cover the contact and main sections
    console.log(result.content.substring(0, 2500));
    
    console.log("\n=========================================");
    console.log("⭐ VERIFICATION CHECKLIST");
    console.log("1. Contact Block Found? " + (result.content.includes("## CONTACT DETAILS") ? "YES" : "NO"));
    console.log("2. Address Captured? " + (result.content.includes("SURAT") ? "YES" : "NO"));
    console.log("3. Markdown Hierarchy? " + (result.content.includes("###") ? "YES" : "NO"));
    console.log("=========================================");

  } catch (err) {
    console.error(`❌ FINAL TEST FAILED: ${err.message}`);
  }
}

runFinalTest();
