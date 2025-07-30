const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const fs = require("fs");
const axios = require("axios");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const path = require("path");

puppeteer.use(StealthPlugin());
ffmpeg.setFfmpegPath(ffmpegPath);

const VIDEO_DIR = "downloads";
const USED_REELS_FILE = "used_reels.json";
const WATERMARK = "ig/ramn_preet05";
const USERNAMES_URL = "https://raw.githubusercontent.com/virkx3/otp/refs/heads/main/usernames.txt";
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO_OWNER = "virkx3";
const REPO_NAME = "igbot";

// Enhanced delay with random variation
const delay = (ms, variation = 0) => new Promise((res) => setTimeout(res, ms + (variation ? Math.floor(Math.random() * variation) : 0)));

if (!fs.existsSync(VIDEO_DIR)) fs.mkdirSync(VIDEO_DIR, { recursive: true });

let usedReels = [];
if (fs.existsSync(USED_REELS_FILE)) {
  usedReels = JSON.parse(fs.readFileSync(USED_REELS_FILE, "utf8"));
}

function getRandomCaption() {
  const captions = fs.readFileSync("caption.txt", "utf8").split("\n").filter(Boolean);
  return captions[Math.floor(Math.random() * captions.length)];
}

function getRandomHashtags(count = 15) {
  const tags = fs.readFileSync("hashtag.txt", "utf8").split("\n").filter(Boolean);
  const selected = [];
  while (selected.length < count && tags.length) {
    const index = Math.floor(Math.random() * tags.length);
    selected.push(tags.splice(index, 1)[0]);
  }
  return selected.join(" ");
}

async function fetchUsernames() {
  const res = await axios.get(USERNAMES_URL);
  return res.data.split("\n").map(u => u.trim()).filter(Boolean);
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
    await page.goto("https://iqsaved.com/reel/", { waitUntil: "networkidle2", timeout: 60000 });

    await page.waitForSelector('input[name="url"]', { timeout: 15000 });
    await page.type('input[name="url"]', reelUrl);
    await page.keyboard.press('Enter');
    console.log("✅ Submitted reel URL");

    await delay(10000);
    await page.evaluate(() => window.scrollBy(0, 1000));

    await page.waitForXPath("//a[contains(text(), 'Download video')]", { timeout: 15000 });
    const [downloadLinkEl] = await page.$x("//a[contains(text(), 'Download video')]");
    const downloadUrl = await page.evaluate(el => el.href, downloadLinkEl);

    if (!downloadUrl || !downloadUrl.includes(".mp4")) throw new Error("❌ Failed to extract valid download URL.");

    console.log("🎯 Download URL found:", downloadUrl);

    const fileName = `reel_${Date.now()}.mp4`;
    const outputPath = path.join("downloads", fileName);

    const response = await axios({ method: "GET", url: downloadUrl, responseType: "stream" });
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
    await delay(5000, 2000); // Random delay between 5-7 seconds

    // Click Create
    const createBtn = await page.evaluateHandle(() => {
      const spans = Array.from(document.querySelectorAll("span"));
      return spans.find(span => span.textContent.includes("Create"));
    });
    if (!createBtn) throw new Error("❌ Create button not found");
    await createBtn.click();
    console.log("🆕 Clicked Create");
    await delay(2000, 1000); // Random delay between 2-3 seconds

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
    await delay(8000, 3000); // Random delay between 8-11 seconds

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
        await delay(4000, 2000); // Random delay between 4-6 seconds
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
        await delay(4000, 2000); // Random delay between 4-6 seconds
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

// ===== NEW: SLEEP TIME FUNCTIONS =====
function isSleepTime() {
  const now = new Date();
  const hours = now.getHours();
  // Sleep between 10 PM (22) and 9 AM (9)
  return hours >= 22 || hours < 9;
}

async function handleSleepTime() {
  if (!isSleepTime()) return;

  console.log("😴 It's sleep time (10 PM - 9 AM)");

  // Calculate wake up time (9 AM next day)
  const now = new Date();
  const wakeTime = new Date();
  
  if (now.getHours() >= 22) {
    // Already past 10 PM, sleep until 9 AM next day
    wakeTime.setDate(wakeTime.getDate() + 1);
  }
  wakeTime.setHours(9, 0, 0, 0); // Set to 9 AM

  const msUntilWake = wakeTime - now;
  console.log(`⏰ Sleeping until ${wakeTime.toLocaleTimeString()} (${Math.round(msUntilWake/60000)} minutes)`);
  
  await delay(msUntilWake);
  console.log("⏰ Wake up! Resuming operations...");
}
// ===== END SLEEP TIME FUNCTIONS =====

async function main() {
  const browser = await puppeteer.launch({ 
    headless: "new", 
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--start-maximized"] 
  });
  const page = await browser.newPage();
  await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36");

  await page.setViewport({
    width: 1366,
    height: 900,
    deviceScaleFactor: 1
  });

  if (fs.existsSync("session.json")) {
    const cookies = JSON.parse(fs.readFileSync("session.json", "utf8"));
    await page.setCookie(...cookies);
    console.log("🔐 Session loaded");
  } else {
    console.log("❌ No session.json found");
    await browser.close();
    return;
  }

  while (true) {
    let reelPath, watermarkedPath;
    try {
      // NEW: Check sleep time before each cycle
      await handleSleepTime();

      const usernames = await fetchUsernames();
      const username = usernames[Math.floor(Math.random() * usernames.length)];
      console.log("🎯 Checking:", username);

      const profileUrl = `https://www.instagram.com/${username}/reels/`;
      await page.goto(profileUrl, { waitUntil: "networkidle2" });
      await delay(5000, 2000);

const scrollCount = 2 + Math.floor(Math.random() * 5); // 2–6 scrolls
for (let i = 0; i < scrollCount; i++) {
  await page.evaluate(() => {
    window.scrollBy(0, window.innerHeight);
  });
  const wait = 1000 + Math.random() * 2000; // 1–3 sec
  await delay(wait); // ✅ Correct usage
  console.log(`🔽 Scrolled ${i + 1} / ${scrollCount}`);
}


      const links = await page.$$eval("a", as => as.map(a => a.href).filter(href => href.includes("/reel/")));
      if (!links.length) {
        console.log("⚠️ No reels found");
        await delay(20000, 10000); // Random delay between 20-30 seconds
        continue;
      }

      // Filter out used reels
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

      // Random wait time between 5-10 minutes (300,000 to 600,000 ms)
      const waitTime = 300000 + Math.floor(Math.random() * 300000);
      console.log(`⏱️ Waiting ${Math.round(waitTime/60000)} minutes before next post...`);
      await delay(waitTime);

    } catch (err) {
      console.error("❌ Loop error:", err.message);
      await delay(180000, 60000); // Random delay between 3-4 minutes on error
    } finally {
      // Always clean up files after each cycle
      cleanupFiles([reelPath, watermarkedPath]);
    }
  }
}

main();
