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
const WATERMARK = "ig/your_username";
const USERNAMES_URL = "https://raw.githubusercontent.com/virkx3/otp/refs/heads/main/usernames.txt";
const INSTAGRAM_URL = "https://www.instagram.com";
const delay = (ms) => new Promise((res) => setTimeout(res, ms));

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
  const iqsavedUrl = "https://iqsaved.com/reel/";
  await page.goto(iqsavedUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector("#url-box", { timeout: 10000 });

  await page.type("#url-box", reelUrl);
  await page.keyboard.press("Enter");
  await delay(10000);

  await page.evaluate(() => window.scrollBy(0, 500));
  await delay(3000);

  const downloadBtn = await page.$('a[href*=".mp4"]');
  if (!downloadBtn) throw new Error("❌ No download button found");

  const videoUrl = await page.evaluate(el => el.href, downloadBtn);
  if (!videoUrl) throw new Error("❌ Video URL not found");

  console.log("✅ Found video URL:", videoUrl);

  const outPath = path.join(VIDEO_DIR, `reel_${Date.now()}.mp4`);
  const response = await axios({
    url: videoUrl,
    method: "GET",
    responseType: "stream",
    timeout: 60000
  });

  const writer = fs.createWriteStream(outPath);
  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on("finish", () => resolve(outPath));
    writer.on("error", reject);
  });
}

async function uploadReel(page, videoPath, caption) {
  try {
    console.log("⬆️ Uploading reel...");
    await page.goto("https://www.instagram.com/", { waitUntil: "networkidle2" });
    await delay(5000);

    const createBtn = await page.$x("//span[contains(text(),'Create')]");
    if (createBtn.length) await createBtn[0].click();
    await delay(3000);

    const fileInput = await page.$('input[type="file"]');
    if (fileInput) {
      await fileInput.uploadFile(videoPath);
    } else {
      throw new Error("Upload input not found");
    }

    await delay(8000);
    const nextBtns = await page.$x("//div[text()='Next']");
    if (nextBtns.length) await nextBtns[0].click();
    await delay(3000);

    if (nextBtns.length > 1) await nextBtns[1].click();
    await delay(3000);

    const captionField = await page.waitForSelector('div[aria-label="Write a caption"]', { timeout: 10000 });
    await captionField.type(caption, { delay: 50 });

    await delay(2000);
    const shareBtn = await page.$x("//div[text()='Share']");
    if (shareBtn.length) {
      await shareBtn[0].click();
      console.log("✅ Reel shared");
    }

    await delay(15000);
    return true;
  } catch (err) {
    console.error("❌ Upload error:", err.message);
    return false;
  }
}

async function main() {
  const browser = await puppeteer.launch({
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage"
    ]
  });

  const page = await browser.newPage();
  await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/114 Safari/537.36");
  await page.setViewport({ width: 1366, height: 768 });

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
      const usernames = await fetchUsernames();
      const username = usernames[Math.floor(Math.random() * usernames.length)];
      console.log("🎯 Checking:", username);

      const profileUrl = `https://www.instagram.com/${username}/reels/`;
      await page.goto(profileUrl, { waitUntil: "networkidle2" });
      await delay(5000);

      const links = await page.$$eval("a", as =>
        as.map(a => a.href).filter(href => href.includes("/reel/"))
      );

      if (!links.length) {
        console.log("⚠️ No reels found");
        await delay(20000);
        continue;
      }

      const randomReel = links[Math.floor(Math.random() * links.length)];
      console.log("🎬 Reel:", randomReel);

      reelPath = await downloadFromIqsaved(page, randomReel);
      if (!reelPath) continue;

      watermarkedPath = reelPath.replace(".mp4", "_wm.mp4");
      await addWatermark(reelPath, watermarkedPath);
      console.log("💧 Watermark added");

      const caption = `${getRandomCaption()}\n\n${getRandomHashtags()}`;
      const uploaded = await uploadReel(page, watermarkedPath, caption);

      const waitTime = uploaded ? 5 * 60 * 1000 : 2 * 60 * 1000;
      console.log(`⏱️ Waiting ${waitTime / 60000} minutes...`);
      await delay(waitTime);

    } catch (err) {
      console.error("❌ Loop error:", err.message);
      await delay(180000); // 3 min delay on failure
    } finally {
      if (reelPath && fs.existsSync(reelPath)) fs.unlinkSync(reelPath);
      if (watermarkedPath && fs.existsSync(watermarkedPath)) fs.unlinkSync(watermarkedPath);
    }
  }
}

main();
