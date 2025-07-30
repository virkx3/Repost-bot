// Add this at the very top for Railway compatibility
process.setMaxListeners(20);

const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const fs = require("fs");
const axios = require("axios");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const path = require("path");
const { Octokit } = require("@octokit/rest");
const sharp = require("sharp");

puppeteer.use(StealthPlugin());
ffmpeg.setFfmpegPath(ffmpegPath);

// Railway-specific configuration
const isRailway = process.env.RAILWAY_ENVIRONMENT === 'production';
const VIDEO_DIR = "downloads";
const USED_REELS_FILE = "used_reels.json";
const WATERMARK = "ig/ramn_preet05";
const USERNAMES_URL = "https://raw.githubusercontent.com/virkx3/otp/refs/heads/main/usernames.txt";
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO_OWNER = "virkx3";
const REPO_NAME = "igbot";

// Enhanced delay with random variation
const delay = (ms, variation = 0) => new Promise((res) => setTimeout(res, ms + (variation ? Math.floor(Math.random() * variation) : 0)));

// Create directories if not exist
if (!fs.existsSync(VIDEO_DIR)) fs.mkdirSync(VIDEO_DIR, { recursive: true });

let usedReels = [];
if (fs.existsSync(USED_REELS_FILE)) {
  try {
    usedReels = JSON.parse(fs.readFileSync(USED_REELS_FILE, "utf8"));
  } catch (e) {
    console.error("Error reading used reels file:", e);
    usedReels = [];
  }
}

function getRandomCaption() {
  try {
    const captions = fs.readFileSync("caption.txt", "utf8").split("\n").filter(Boolean);
    return captions[Math.floor(Math.random() * captions.length)];
  } catch (e) {
    console.error("Error reading caption file:", e);
    return "Check out this reel! 👀 #viral #trending";
  }
}

function getRandomHashtags(count = 15) {
  try {
    const tags = fs.readFileSync("hashtag.txt", "utf8").split("\n").filter(Boolean);
    const selected = [];
    while (selected.length < count && tags.length) {
      const index = Math.floor(Math.random() * tags.length);
      selected.push(tags.splice(index, 1)[0]);
    }
    return selected.join(" ");
  } catch (e) {
    console.error("Error reading hashtag file:", e);
    return "#instagram #reels #viral #trending #fyp #foryou #foryoupage #explore #instadaily #like #follow #love #music #tiktok #funny #memes #comedy #dance #entertainment";
  }
}

async function fetchUsernames() {
  try {
    const res = await axios.get(USERNAMES_URL);
    return res.data.split("\n").map(u => u.trim()).filter(Boolean);
  } catch (e) {
    console.error("Error fetching usernames:", e);
    return ["viralreels", "trendingreels", "topreels", "bestreels"];
  }
}

function addWatermark(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .videoFilters({
        filter: "drawtext",
        options: {
          fontfile: "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
          text: WATERMARK,
          fontsize: 24,
          fontcolor: "white",
          x: "(w-text_w)-10",
          y: "(h-text_h)-10",
          box: 1,
          boxcolor: "black@0.5",
          boxborderw: 5,
        },
      })
      .output(outputPath)
      .on("end", () => resolve(outputPath))
      .on("error", reject)
      .run();
  });
}

async function downloadFromIqsaved(page, reelUrl) {
  try {
    console.log("📥 Navigating to iqsaved...");
    await page.goto("https://iqsaved.com/reel/", { waitUntil: "networkidle2", timeout: 100000 });

    await page.waitForSelector('input[name="url"]', { timeout: 15000 });
    await page.type('input[name="url"]', reelUrl);
    await page.keyboard.press('Enter');
    console.log("✅ Submitted reel URL");

    await delay(10000, 5000);
    await page.evaluate(() => window.scrollBy(0, 500));

    let downloadLinkEl;
    for (let i = 0; i < 30; i++) {
      downloadLinkEl = await page.$('a[href$=".mp4"]');
      if (downloadLinkEl) break;
      await delay(500);
    }
    if (!downloadLinkEl) throw new Error("❌ Failed to find download link.");

    const downloadUrl = await page.evaluate(el => el.href, downloadLinkEl);

    if (!downloadUrl || !downloadUrl.includes(".mp4")) throw new Error("❌ Failed to extract valid download URL.");

    console.log("🎯 Download URL found:", downloadUrl);

    const fileName = `reel_${Date.now()}.mp4`;
    const outputPath = path.join("downloads", fileName);

    const response = await axios({ 
      method: "GET", 
      url: downloadUrl, 
      responseType: "stream",
      timeout: 60000
    });
    
    const writer = fs.createWriteStream(outputPath);
    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on("finish", () => {
        console.log("✅ Video downloaded:", fileName);
        resolve(outputPath);
      });
      writer.on("error", reject);
    });
  } catch (err) {
    console.error("❌ iqsaved download error:", err.message);
    return null;
  }
}

async function uploadReel(page, videoPath, caption) {
  try {
    console.log("⬆️ Uploading reel...");

    if (!fs.existsSync(videoPath)) {
      throw new Error(`❌ Video file not found at path: ${videoPath}`);
    }

    await page.goto("https://www.instagram.com/", { waitUntil: "networkidle2" });

    await page.setViewport({ width: 1366, height: 900 });
    await delay(5000, 2000);

    // Click Create
    const createBtn = await page.evaluateHandle(() => {
      const spans = Array.from(document.querySelectorAll("span"));
      return spans.find(span => span.textContent.includes("Create"));
    });
    if (!createBtn) throw new Error("❌ Create button not found");
    await createBtn.click();
    console.log("🆕 Clicked Create");
    await delay(2000, 1000);

    // Click "Post" in the popup
    await page.evaluate(() => {
      const spans = Array.from(document.querySelectorAll("span"));
      const postBtn = spans.find(span => span.textContent.trim() === "Post");
      if (postBtn) {
        postBtn.click();
      }
    });
    console.log("✅ Brute force click for Post done.");
    await delay(2000, 1000);

    const fileInput = await page.$('input[type="file"]');
    if (!fileInput) {
      throw new Error("❌ File input not found — cannot proceed");
    }

    await fileInput.uploadFile(videoPath);
    console.log("📤 Video file attached");
    await delay(8000, 3000);

    console.log("🔍 Trying brute force click for OK popup...");
    await page.evaluate(() => {
      const allButtons = Array.from(document.querySelectorAll("button"));
      allButtons.forEach(btn => {
        if (btn.innerText.trim().toUpperCase() === "OK") {
          btn.click();
        }
      });
    });
    await delay(3000, 2000);

    await page.waitForSelector('div[aria-label="Select crop"], svg[aria-label="Select crop"]', { visible: true });
    await page.click('div[aria-label="Select crop"], svg[aria-label="Select crop"]');
    console.log("✅ Clicked crop icon");

    await page.evaluate(() => {
      const spans = Array.from(document.querySelectorAll('span'));
      const found = spans.find(el => el.innerText.trim() === 'Original');
      if (found) {
        found.click();
        console.log("✅ Clicked Original by brute force");
      }
    });

    const nextButtons = await page.$$('div[role="button"]');
    let clickedNext = false;
    for (const button of nextButtons) {
      const text = await page.evaluate(el => el.textContent.trim(), button);
      if (text === "Next") {
        await button.click();
        console.log("➡️ Clicked first Next");
        clickedNext = true;
        await delay(4000, 2000);
        break;
      }
    }
    if (!clickedNext) throw new Error("❌ First Next button not found");

    const nextButtons2 = await page.$$('div[role="button"]');
    clickedNext = false;
    for (const button of nextButtons2) {
      const text = await page.evaluate(el => el.textContent.trim(), button);
      if (text === "Next") {
        await button.click();
        console.log("➡️ Clicked second Next");
        clickedNext = true;
        await delay(4000, 2000);
        break;
      }
    }
    if (!clickedNext) throw new Error("❌ Second Next button not found");

    await page.type('div[role="textbox"]', caption, { delay: 30 });
    console.log("📝 Caption entered");
    await delay(2000, 1000);

    // Share button
    await page.waitForSelector("div[role='button']");
    const shareBtns = await page.$$('div[role="button"]');
    let clicked = false;
    for (const btn of shareBtns) {
      const txt = await page.evaluate(el => el.innerText.trim(), btn);
      if (txt === "Share") {
        await btn.click();
        console.log("✅ Clicked Share button");
        clicked = true;
        break;
      }
    }
    if (!clicked) console.log("❌ Could not find Share button!");

    return true;
  } catch (err) {
    console.error("❌ uploadReel error:", err.message);
    return false;
  }
}

async function cleanupFiles(filePaths) {
  filePaths.forEach(filePath => {
    if (filePath && fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
        console.log(`🧹 Deleted file: ${path.basename(filePath)}`);
      } catch (err) {
        console.error(`❌ Error deleting file ${filePath}:`, err.message);
      }
    }
  });
}

function isSleepTime() {
  const now = new Date();
  const hours = now.getHours();
  return hours >= 22 || hours < 9;
}

async function handleSleepTime() {
  if (!isSleepTime()) return;

  console.log("😴 It's sleep time (10 PM - 9 AM)");

  const now = new Date();
  const wakeTime = new Date();
  
  if (now.getHours() >= 22) {
    wakeTime.setDate(wakeTime.getDate() + 1);
  }
  wakeTime.setHours(9, 0, 0, 0);

  const msUntilWake = wakeTime - now;
  console.log(`⏰ Sleeping until ${wakeTime.toLocaleTimeString()} (${Math.round(msUntilWake/60000)} minutes)`);
  
  await delay(msUntilWake);
  console.log("⏰ Wake up! Resuming operations...");
}

async function main() {
  // Railway-specific browser configuration
  const browser = await puppeteer.launch({
    headless: isRailway ? "new" : false,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--no-first-run",
      "--no-zygote",
      "--single-process",
      "--disable-gpu"
    ],
    executablePath: isRailway ? "/usr/bin/chromium" : undefined
  });
  
  const page = await browser.newPage();
  await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/114 Safari/537.36");

  await page.setViewport({
    width: 1366,
    height: 900,
    deviceScaleFactor: 1
  });

  // Load session from environment variable if on Railway
  if (isRailway && process.env.SESSION_JSON) {
    try {
      fs.writeFileSync("session.json", process.env.SESSION_JSON);
      console.log("🔐 Session created from environment variable");
    } catch (e) {
      console.error("Error creating session file:", e);
    }
  }

  if (fs.existsSync("session.json")) {
    try {
      const cookies = JSON.parse(fs.readFileSync("session.json", "utf8"));
      await page.setCookie(...cookies);
      console.log("🔐 Session loaded");
    } catch (e) {
      console.error("Error loading session:", e);
    }
  } else {
    console.log("❌ No session.json found");
    await browser.close();
    return;
  }

  while (true) {
    let reelPath, watermarkedPath;
    try {
      await handleSleepTime();

      const usernames = await fetchUsernames();
      const username = usernames[Math.floor(Math.random() * usernames.length)];
      console.log("🎯 Checking:", username);

      const profileUrl = `https://www.instagram.com/${username}/reels/`;
      await page.goto(profileUrl, { waitUntil: "networkidle2" });
      await delay(5000, 2000);

      const links = await page.$$eval("a", as => as.map(a => a.href).filter(href => href.includes("/reel/")));
      if (!links.length) {
        console.log("⚠️ No reels found");
        await delay(20000, 10000);
        continue;
      }

      const availableReels = links.filter(link => !usedReels.includes(link));
      if (!availableReels.length) {
        console.log("⚠️ All reels from this account have been used");
        await delay(20000, 10000);
        continue;
      }

      const randomReel = availableReels[Math.floor(Math.random() * availableReels.length)];
      console.log("🎬 Reel:", randomReel);

      reelPath = await downloadFromIqsaved(page, randomReel);
      if (!reelPath) continue;

      watermarkedPath = reelPath.replace(".mp4", "_wm.mp4");
      await addWatermark(reelPath, watermarkedPath);
      console.log("💧 Watermark added");

      const caption = `${getRandomCaption()}\n\n${getRandomHashtags()}`;
      const uploaded = await uploadReel(page, watermarkedPath, caption);

      if (uploaded) {
        usedReels.push(randomReel);
        fs.writeFileSync(USED_REELS_FILE, JSON.stringify(usedReels, null, 2));
        console.log("✅ Reel added to used list");
      }

      const waitTime = 300000 + Math.floor(Math.random() * 300000);
      console.log(`⏱️ Waiting ${Math.round(waitTime/60000)} minutes before next post...`);
      await delay(waitTime);

    } catch (err) {
      console.error("❌ Loop error:", err.message);
      await delay(180000, 60000);
    } finally {
      cleanupFiles([reelPath, watermarkedPath]);
    }
  }
}

// Handle Railway shutdown signals
process.on('SIGINT', () => {
  console.log('🚫 Received SIGINT. Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('🚫 Received SIGTERM. Shutting down gracefully...');
  process.exit(0);
});

main().catch(err => console.error("🔥 Fatal error:", err));
