// Add this at the very top for Railway compatibility
process.setMaxListeners(20);

const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const fs = require("fs");
const axios = require("axios");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const path = require("path");

puppeteer.use(StealthPlugin());
ffmpeg.setFfmpegPath(ffmpegPath);

// Railway-specific configuration
const isRailway = process.env.RAILWAY_ENVIRONMENT === 'production';
const VIDEO_DIR = "downloads";
const USED_REELS_FILE = "used_reels.json";
const WATERMARK = "ig/ramn_preet05";
const USERNAMES_URL = "https://raw.githubusercontent.com/virkx3/otp/refs/heads/main/usernames.txt";

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

    // Click Create and upload video without extra button handling
    const createBtn = await page.evaluateHandle(() => {
      const spans = Array.from(document.querySelectorAll("span"));
      return spans.find(span => span.textContent.includes("Create"));
    });
    if (!createBtn) throw new Error("❌ Create button not found");
    await createBtn.click();
    console.log("🆕 Clicked Create");
    await delay(2000, 1000);

    const fileInput = await page.$('input[type="file"]');
    if (!fileInput) {
      throw new Error("❌ File input not found — cannot proceed");
    }

    await fileInput.uploadFile(videoPath);
    console.log("📤 Video file attached");
    await delay(8000, 3000);

    await page.type('div[role="textbox"]', caption, { delay: 30 });
    console.log("📝 Caption entered");
    await delay(2000, 1000);

    // Click Share button directly without brute force searching
    const shareBtn = await page.$("div[role='button']:contains('Share')");
    if (shareBtn) {
      await shareBtn.click();
      console.log("✅ Clicked Share button");
    } else {
      console.log("❌ Could not find Share button!");
    }

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
    await page.setCookie(JSON.parse(process.env.SESSION_JSON));
  }

  // Fetch random usernames from the source
  const usernames = await fetchUsernames();
  const randomUsername = usernames[Math.floor(Math.random() * usernames.length)];
  console.log(`Randomly selected username: ${randomUsername}`);

  // Main loop for downloading and uploading reels
  while (true) {
    const reelUrl = `https://www.instagram.com/p/${randomUsername}/`;
    const videoPath = await downloadFromIqsaved(page, reelUrl);
    if (videoPath) {
      const caption = getRandomCaption();
      const hashtags = getRandomHashtags();
      const fullCaption = `${caption}\n\n${hashtags}`;
      
      // Add watermark
      const videoWithWatermark = `${videoPath}_watermarked.mp4`;
      await addWatermark(videoPath, videoWithWatermark);

      // Upload to Instagram
      const uploadSuccess = await uploadReel(page, videoWithWatermark, fullCaption);
      if (uploadSuccess) {
        console.log("✅ Successfully uploaded reel.");
      }

      // Cleanup downloaded files
      await cleanupFiles([videoPath, videoWithWatermark]);
    }

    await delay(30000, 15000); // Wait before running again
  }

  // Close the browser after all tasks
  await browser.close();
}

main().catch((err) => {
  console.error("❌ Error in main execution:", err.message);
});
