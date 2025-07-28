// index.js

const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const fs = require("fs");
const axios = require("axios");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const path = require("path");
const delay = (ms) => new Promise((res) => setTimeout(res, ms));

puppeteer.use(StealthPlugin());
ffmpeg.setFfmpegPath(ffmpegPath);

const INSTAGRAM_URL = "https://www.instagram.com";
const USERNAMES_URL = "https://raw.githubusercontent.com/virkx3/otp/refs/heads/main/usernames.txt";
const WATERMARK = "ig/your_username";
const VIDEO_DIR = "downloads";

if (!fs.existsSync(VIDEO_DIR)) fs.mkdirSync(VIDEO_DIR);

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

async function downloadFromIqsaved(page, reelUrl) {
  await page.goto("https://iqsaved.com/reel/", { waitUntil: "networkidle2" });
  await delay(5000);
  await page.type("#url-box", reelUrl);
  await page.keyboard.press("Enter");
  await delay(12000);
  await page.evaluate(() => window.scrollBy(0, window.innerHeight));
  await delay(5000);
  const downloadLink = await page.$eval("a[href][download]", el => el.href);
  return downloadLink;
}

async function downloadVideo(url) {
  try {
    const outPath = path.join(VIDEO_DIR, `reel_${Date.now()}.mp4`);
    const response = await axios({ url, method: 'GET', responseType: 'stream', timeout: 60000 });
    const writer = fs.createWriteStream(outPath);
    response.data.pipe(writer);
    return new Promise((resolve, reject) => {
      writer.on('finish', () => resolve(outPath));
      writer.on('error', reject);
    });
  } catch (err) {
    console.error("Download failed:", err.message);
    return null;
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
          boxborderw: 5
        }
      })
      .output(outputPath)
      .on("end", () => resolve(outputPath))
      .on("error", reject)
      .run();
  });
}

async function uploadReel(page, videoPath, caption) {
  await page.goto(`${INSTAGRAM_URL}/reels/upload`, { waitUntil: "networkidle2" });
  await delay(5000);
  const fileInput = await page.$('input[type="file"]');
  if (fileInput) await fileInput.uploadFile(videoPath);
  await delay(10000);
  await page.type('textarea', caption);
  const shareButton = await page.$('div:has-text("Share")');
  if (shareButton) await shareButton.click();
  await delay(15000);
}

async function main() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36');
  await page.setViewport({ width: 1536, height: 730 });

  if (fs.existsSync("session.json")) {
    const cookies = JSON.parse(fs.readFileSync("session.json", "utf8"));
    await page.setCookie(...cookies);
    console.log("Session loaded");
  } else {
    console.log("No session.json found");
    await browser.close();
    return;
  }

  while (true) {
    let reelPath, watermarkedPath;
    try {
      const usernames = await fetchUsernames();
      const username = usernames[Math.floor(Math.random() * usernames.length)];
      console.log("Target:", username);
      const profileUrl = `${INSTAGRAM_URL}/${username}/reels/`;
      await page.goto(profileUrl, { waitUntil: "networkidle2" });
      await delay(5000);
      const links = await page.$$eval("a", as => as.map(a => a.href).filter(href => href.includes("/reel/")));
      if (!links.length) {
        console.log("No reels found");
        await delay(30000);
        continue;
      }
      const randomReel = links[Math.floor(Math.random() * links.length)];
      console.log("Reel URL:", randomReel);
      const videoUrl = await downloadFromIqsaved(page, randomReel);
      if (!videoUrl) {
        console.log("No video URL found");
        await delay(30000);
        continue;
      }
      reelPath = await downloadVideo(videoUrl);
      if (!reelPath) {
        await delay(30000);
        continue;
      }
      watermarkedPath = reelPath.replace(".mp4", "_wm.mp4");
      await addWatermark(reelPath, watermarkedPath);
      const caption = `${getRandomCaption()}\n\n${getRandomHashtags()}`;
      await uploadReel(page, watermarkedPath, caption);
      await delay(300000);
    } catch (err) {
      console.error("Main loop error:", err);
      await delay(180000);
    } finally {
      if (reelPath && fs.existsSync(reelPath)) fs.unlinkSync(reelPath);
      if (watermarkedPath && fs.existsSync(watermarkedPath)) fs.unlinkSync(watermarkedPath);
    }
  }
}

main().catch(console.error);
