// Dual-context Instagram Bot

const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const delay = ms => new Promise(res => setTimeout(res, ms));

const VIDEO_DIR = "downloads";
const COOKIES_FILE = "session.json";
const WATERMARK = "ig/ramn_preet05";

ffmpeg.setFfmpegPath(ffmpegPath);
if (!fs.existsSync(VIDEO_DIR)) fs.mkdirSync(VIDEO_DIR);

async function launchContexts() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  const desktopContext = await browser.createIncognitoBrowserContext();
  const desktopPage = await desktopContext.newPage();
  await desktopPage.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36");

  const mobileContext = await browser.createIncognitoBrowserContext();
  const mobilePage = await mobileContext.newPage();
  await mobilePage.setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1");
  await mobilePage.setViewport({ width: 390, height: 844, isMobile: true, deviceScaleFactor: 3 });

  if (fs.existsSync(COOKIES_FILE)) {
    const cookies = JSON.parse(fs.readFileSync(COOKIES_FILE, "utf8"));
    await desktopPage.setCookie(...cookies);
    await mobilePage.setCookie(...cookies);
  }

  return { browser, desktopPage, mobilePage };
}

async function downloadReel(page, reelUrl, outPath) {
  await page.goto(reelUrl, { waitUntil: "networkidle2", timeout: 30000 });
  await page.waitForSelector("video", { timeout: 15000 });
  const videoUrl = await page.$eval("video", el => el.src);

  if (!videoUrl || videoUrl.startsWith("blob:")) throw new Error("No valid video URL");

  const response = await axios({ url: videoUrl, method: "GET", responseType: "arraybuffer" });
  fs.writeFileSync(outPath, response.data);
  return outPath;
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
  await page.goto("https://www.instagram.com/", { waitUntil: "networkidle2", timeout: 60000 });
  await delay(7000);

  const fileInput = await page.$('input[type="file"]');
  if (fileInput) await fileInput.uploadFile(videoPath);
  else throw new Error("File input not found");

  await delay(8000);

  const nextBtn = await page.$x("//div[contains(text(),'Next')]");
  if (nextBtn[0]) await nextBtn[0].click();
  await delay(3000);

  const captionInput = await page.$('textarea[aria-label="Write a caption"]');
  if (captionInput) await captionInput.type(caption);
  await delay(2000);

  const shareBtn = await page.$x("//div[contains(text(),'Share')]");
  if (shareBtn[0]) await shareBtn[0].click();
  await delay(15000);
  return true;
}

(async () => {
  const { browser, desktopPage, mobilePage } = await launchContexts();
  const reelUrl = "https://www.instagram.com/reel/REEL_ID_HERE/";
  const filePath = path.join(VIDEO_DIR, `reel_${Date.now()}.mp4`);

  try {
    const downloaded = await downloadReel(desktopPage, reelUrl, filePath);
    const watermarked = filePath.replace(".mp4", "_wm.mp4");
    await addWatermark(downloaded, watermarked);
    await uploadReel(mobilePage, watermarked, "🔥 New Reel #reels #bot");
  } catch (err) {
    console.error("❌ Error:", err.message);
  } finally {
    await browser.close();
  }
})();
