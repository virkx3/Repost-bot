const puppeteer = require("puppeteer");
const fs = require("fs");
const axios = require("axios");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const path = require("path");
const delay = (ms) => new Promise((res) => setTimeout(res, ms));

ffmpeg.setFfmpegPath(ffmpegPath);

const INSTAGRAM_URL = "https://www.instagram.com";
const USERNAMES_URL = "https://raw.githubusercontent.com/virkx3/otp/refs/heads/main/usernames.txt";
const WATERMARK = "ig/ramn_preet05";
const VIDEO_DIR = "downloads";

if (!fs.existsSync(VIDEO_DIR)) fs.mkdirSync(VIDEO_DIR, { recursive: true });

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

const cheerio = require("cheerio");

async function downloadReel(page, username) {
  const profileUrl = `${INSTAGRAM_URL}/${username}/reels/`;
  await page.goto(profileUrl, { waitUntil: "domcontentloaded" });
  await delay(3000);

  const links = await page.$$eval("a", (as) =>
    as.map((a) => a.href).filter((href) => href.includes("/reel/"))
  );

  if (!links.length) {
    console.log("⚠️ No reels found for user:", username);
    return null;
  }

  const reelUrl = links[Math.floor(Math.random() * links.length)];
  console.log("🎯 Visiting:", reelUrl);
  await page.goto(reelUrl, { waitUntil: "networkidle2" });
  await delay(3000);

  // ✅ Extract .mp4 URL using internal page script
  const videoUrl = await page.evaluate(() => {
    const video = document.querySelector("video");
    return video ? video.src : null;
  });

  if (!videoUrl || !videoUrl.includes(".mp4")) {
    console.log("❌ No direct video URL found.");
    return null;
  }

  const outPath = path.join(VIDEO_DIR, `reel_${Date.now()}.mp4`);
  const writer = fs.createWriteStream(outPath);

  const response = await axios.get(videoUrl, { responseType: "stream" });
  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on("finish", () => resolve(outPath));
    writer.on("error", reject);
  });
}

async function uploadReel(page, videoPath, caption) {
  console.log("⬆️ Uploading reel:", videoPath);

  try {
    await page.goto("https://www.instagram.com/", { waitUntil: "networkidle2", timeout: 60000 });
    await delay(7000);

    const newPostSelectors = [
      '[aria-label="New post"]',
      '[aria-label="Create new post"]',
      'div[role="button"]:has(> div > svg[aria-label="New post"])',
      'svg[aria-label="New post"]',
      'button:has(> svg[aria-label="New post"])'
    ];

    for (const selector of newPostSelectors) {
      try {
        await page.waitForSelector(selector, { timeout: 10000 });
        await page.click(selector);
        console.log(`✅ Found post button: ${selector}`);
        break;
      } catch (e) {
        console.log(`❌ Not found: ${selector}`);
      }
    }

    await delay(4000);

    const fileInput = await page.$('input[type="file"]');
    if (fileInput) {
      await fileInput.uploadFile(videoPath);
    } else {
      console.log("❌ File input not found");
      return false;
    }

    await delay(8000);

    const nextButtons = await page.$x("//div[contains(text(),'Next')]");
    for (let btn of nextButtons) await btn.click();
    await delay(3000);

    const captionBox = await page.$('textarea[aria-label="Write a caption"]');
    if (captionBox) await captionBox.type(caption, { delay: 50 });
    await delay(2000);

    const shareButtons = await page.$x("//div[contains(text(),'Share')]");
    for (let btn of shareButtons) await btn.click();

    console.log("✅ Reel shared!");
    await delay(15000);
    return true;

  } catch (err) {
    console.error("❌ Upload failed:", err.message);
    return false;
  }
}

async function main() {
  const browser = await puppeteer.launch({ 
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--single-process",
      "--no-zygote",
      "--disable-gpu"
    ]
  });
  
  const page = await browser.newPage();
  await page.setUserAgent(
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1'
  );
  await page.setViewport({ width: 390, height: 844, isMobile: true });

  if (fs.existsSync("session.json")) {
    const cookies = JSON.parse(fs.readFileSync("session.json", "utf8"));
    await page.setCookie(...cookies);
    console.log("🔁 Session loaded");
  } else {
    console.log("❌ No session.json found");
    await browser.close();
    return;
  }

  await page.goto(INSTAGRAM_URL, { waitUntil: "networkidle2", timeout: 60000 });
  try {
    await page.waitForSelector('svg[aria-label="Home"]', { timeout: 10000 });
    console.log("✅ Session valid");
  } catch {
    console.log("❌ Invalid session");
    await browser.close();
    return;
  }

  while (true) {
    try {
      const usernames = await fetchUsernames();
      const username = usernames[Math.floor(Math.random() * usernames.length)];
      console.log("🎯 Target:", username);

      const reelPath = await downloadReel(page, username);
      if (!reelPath) {
        console.log("⚠️ Skipping invalid reel...");
        await delay(30000);
        continue;
      }

      const watermarkedPath = reelPath.replace(".mp4", "_wm.mp4");
      await addWatermark(reelPath, watermarkedPath);

      const caption = `${getRandomCaption()}\n\n${getRandomHashtags()}`;
      const uploaded = await uploadReel(page, watermarkedPath, caption);

      if (fs.existsSync(reelPath)) fs.unlinkSync(reelPath);
      if (fs.existsSync(watermarkedPath)) fs.unlinkSync(watermarkedPath);

      const waitTime = uploaded ? 5 * 60 * 1000 : 2 * 60 * 1000;
      console.log(`⏳ Waiting ${waitTime / 60000} minutes...`);
      await delay(waitTime);

    } catch (err) {
      console.error("❌ Main loop error:", err);
      console.log("⏳ Retrying in 3 minutes...");
      await delay(3 * 60 * 1000);
    }
  }
}

main().catch(err => console.error("❌ Fatal error:", err));
