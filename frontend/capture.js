const puppeteer = require("puppeteer");
const fs = require("fs");

(async () => {
  try {
    if (!fs.existsSync("public/screenshots")) {
      fs.mkdirSync("public/screenshots", { recursive: true });
    }

    const browser = await puppeteer.launch({ 
      headless: "new",
      defaultViewport: { width: 1280, height: 800 } 
    });
    
    const page = await browser.newPage();

    // 1. Capture Login Page
    console.log("Navigating to Login...");
    await page.goto("http://localhost:5173/login", { waitUntil: "networkidle0" });
    await page.screenshot({ path: "public/screenshots/login.png" });
    console.log("Captured login.png");

    // Authenticate (Fake token)
    await page.evaluate(() => localStorage.setItem("token", "dummy-jwt-token"));

    // 2. Capture Dashboard
    console.log("Navigating to Dashboard...");
    await page.goto("http://localhost:5173/", { waitUntil: "networkidle0" });
    await page.screenshot({ path: "public/screenshots/dashboard.png" });
    console.log("Captured dashboard.png");

    // 3. Capture Workspace
    console.log("Navigating to Workspace...");
    await page.goto("http://localhost:5173/workspace", { waitUntil: "networkidle0" });
    // Wait for animation
    await new Promise(r => setTimeout(r, 1000));
    await page.screenshot({ path: "public/screenshots/workspace.png" });
    console.log("Captured workspace.png");

    // 4. Capture Chat
    console.log("Navigating to Chat...");
    await page.goto("http://localhost:5173/chat", { waitUntil: "networkidle0" });
    await new Promise(r => setTimeout(r, 1000));
    await page.screenshot({ path: "public/screenshots/chat.png" });
    console.log("Captured chat.png");

    await browser.close();
    console.log("All screenshots captured successfully.");
  } catch (error) {
    console.error("Failed to capture screenshots:", error);
    process.exit(1);
  }
})();
