const puppeteer = require("puppeteer-core");
const fs = require("fs");
const axios = require("axios");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const path = require("path");
const { instagramGetUrl } = require("instagram-url-direct");

ffmpeg.setFfmpegPath(ffmpegPath);

const INSTAGRAM_URL = "https://www.instagram.com";
const USERNAMES_URL = "https://raw.githubusercontent.com/virkx3/otp/refs/heads/main/usernames.txt";
const WATERMARK = "ig/ramn_preet05";
const VIDEO_DIR = "downloads";

if (!fs.existsSync(VIDEO_DIR)) fs.mkdirSync(VIDEO_DIR);
const delay = (ms) => new Promise((res) => setTimeout(res, ms));

// ✅ Manual iPhone X descriptor
const iPhone = {
  name: 'iPhone X',
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 11_0 like Mac OS X) ' +
    'AppleWebKit/604.1.38 (KHTML, like Gecko) ' +
    'Version/11.0 Mobile/15A372 Safari/604.1',
  viewport: {
    width: 375,
    height: 812,
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    isLandscape: false,
  },
};

function getRandomCaption() {
  if (!fs.existsSync("caption.txt")) return "";
  const captions = fs.readFileSync("caption.txt", "utf8").split("\n").filter(Boolean);
  return captions[Math.floor(Math.random() * captions.length)];
}

function getRandomHashtags(count = 15) {
  if (!fs.existsSync("hashtag.txt")) return "";
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
  return res.data.split("\n").map((u) => u.trim()).filter(Boolean);
}

async function downloadReel(page, username) {
  await page.goto(`${INSTAGRAM_URL}/${username}/reels/`, { waitUntil: "networkidle2" });
  await delay(3000);

  const links = await page.$$eval("a", (as) =>
    as.map((a) => a.href).filter((href) => href.includes("/reel/"))
  );

  if (!links.length) return null;
  const reelUrl = links[Math.floor(Math.random() * links.length)];
  console.log("🎯 Reel URL:", reelUrl);

  let videoUrl = null;

  // Try with API
  try {
    const result = await instagramGetUrl(reelUrl);
    videoUrl = result?.url_list?.[0]?.url || result?.media_details?.[0]?.url;
  } catch {
    console.warn("⚠️ instagram-url-direct failed, trying page scrape.");
  }

  // Fallback to scraping
  if (!videoUrl) {
    try {
      await page.goto(reelUrl, { waitUntil: "networkidle2" });
      await delay(3000);
      videoUrl = await page.$eval("video", (v) => v.src);
    } catch {
      console.error("❌ Video scraping failed.");
      return null;
    }
  }

  if (!videoUrl || !videoUrl.endsWith(".mp4")) {
    console.warn("⚠️ Invalid video URL:", videoUrl);
    return null;
  }

  const outPath = path.join(VIDEO_DIR, `reel_${Date.now()}.mp4`);
  const writer = fs.createWriteStream(outPath);
  const response = await axios.get(videoUrl, { responseType: "stream", timeout: 60000 });
  response.data.pipe(writer);

  return new Promise((resolve) => {
    writer.on("finish", () => resolve(outPath));
    writer.on("error", () => resolve(null));
  });
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

async function uploadReel(page, videoPath, caption) {
  console.log("⬆️ Uploading:", videoPath);
  console.log("📄 Caption:\n", caption);
  // Upload steps could be added using puppeteer if needed
}

async function main() {
  const browser = await puppeteer.launch({
    headless: "new", // or false for visible browser
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    executablePath: process.env.CHROME_BIN || undefined, // for Railway or hosting
  });

  const page = await browser.newPage();
  await page.setUserAgent(iPhone.userAgent);
  await page.setViewport(iPhone.viewport);

  if (fs.existsSync("session.json")) {
    const cookies = JSON.parse(fs.readFileSync("session.json", "utf8"));
    await page.setCookie(...cookies);
    console.log("🔁 Session loaded");
  } else {
    console.log("❌ No session.json found. Please login manually first.");
    await browser.close();
    return;
  }

  console.log("✅ Session valid. Continue with bot logic...");

  while (true) {
    try {
      const usernames = await fetchUsernames();
      const username = usernames[Math.floor(Math.random() * usernames.length)];
      console.log("🎯 Target:", username);

      const reelPath = await downloadReel(page, username);
      if (!reelPath) {
        console.log("⚠️ No reel downloaded. Retry in 30s...");
        await delay(30000);
        continue;
      }

      const watermarked = reelPath.replace(".mp4", "_wm.mp4");
      await addWatermark(reelPath, watermarked);

      const caption = `${getRandomCaption()}\n\n${getRandomHashtags()}`;
      await uploadReel(page, watermarked, caption);

      fs.unlinkSync(reelPath);
      fs.unlinkSync(watermarked);

      console.log("⏳ Waiting 5 minutes before next...");
      await delay(5 * 60 * 1000);
    } catch (err) {
      console.error("❌ Error:", err.message);
      await delay(60000);
    }
  }
}

main();
