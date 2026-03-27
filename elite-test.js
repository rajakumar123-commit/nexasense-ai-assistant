const { scrapeUrl } = require("./src/services/scraper.service");

async function runEliteTest() {
  const url = "https://en.wikipedia.org/wiki/Comparison_of_web_browsers";
  console.log(`Starting ELITE TEST (Table Focus) for: ${url}\n`);

  try {
    const result = await scrapeUrl(url);
    
    console.log("=========================================");
    console.log("✅ ELITE SCRAPER OUTPUT (TABLE SUPPORT)");
    console.log("=========================================\n");
    
    console.log(`TITLE: ${result.title}\n`);
    
    // Check for Table formatting ( | Header | )
    const hasTable = result.content.includes("|") && result.content.includes("---");
    console.log(`Table Detected: ${hasTable ? "YES ✅" : "NO ❌"}`);

    if (hasTable) {
        console.log("\n--- TABLE PREVIEW ---");
        // Find the first occurrence of a table-like structure
        const lines = result.content.split("\n");
        const tableLines = lines.filter(l => l.includes("|")).slice(0, 10);
        console.log(tableLines.join("\n"));
    }
    
    console.log("\n--- CONTENT PREVIEW (First 500 chars) ---");
    console.log(result.content.substring(0, 500));
    console.log("=========================================");

  } catch (err) {
    console.error(`❌ ELITE TEST FAILED: ${err.message}`);
  }
}

runEliteTest();
