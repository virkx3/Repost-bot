const puppeteer = require("puppeteer"); // or puppeteer-core with executablePath
const fs = require("fs");
const axios = require("axios");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const path = require("path");
const { instagramGetUrl } = require("instagram-url-direct");

const VIDEO_DIR = "downloads";
const USERNAMES_URL = "https://raw.githubusercontent.com/virkx3/otp/refs/heads/main/usernames.txt";
const WATERMARK = "ig/ramn_preet05";
ffmpeg.setFfmpegPath(ffmpegPath);

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

if (!fs.existsSync(VIDEO_DIR)) fs.mkdirSync(VIDEO_DIR);

const delay = (ms) => new Promise(res => setTimeout(res, ms));

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

async function downloadReel(page, username) {
  await page.goto(`https://www.instagram.com/${username}/reels/`, { waitUntil: "networkidle2" });
  await delay(3000);

  const links = await page.$$eval("a", as =>
    as.map(a => a.href).filter(h => h.includes("/reel/"))
  );
  if (!links.length) return null;

  const reelUrl = links[Math.floor(Math.random() * links.length)];
  console.log("🎯 Reel URL:", reelUrl);

  let result;
  try {
    result = await instagramGetUrl(reelUrl);
  } catch (e) {
    console.warn("⚠️ instagram-url-direct failed, trying page scrape.");
  }

  const videoUrl =
    result?.url_list?.[0]?.url ||
    result?.media_details?.[0]?.url;

  if (!videoUrl || !videoUrl.includes(".mp4")) {
    console.warn("⚠️ Invalid video URL:", videoUrl);
    return null;
  }

  const outPath = path.join(VIDEO_DIR, `reel_${Date.now()}.mp4`);
  const writer = fs.createWriteStream(outPath);

  try {
    const response = await axios.get(videoUrl, {
      responseType: "stream",
      timeout: 60000,
      headers: {
        Referer: reelUrl,
        "User-Agent": iPhone.userAgent,
      },
    });

    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on("finish", () => resolve(outPath));
      writer.on("error", (err) => {
        console.error("❌ Stream error:", err.message);
        reject(null);
      });
    });
  } catch (err) {
    console.error("❌ Video download failed:", err.message);
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
  console.log("⬆️ Uploading reel:", videoPath);
  console.log("✅ Uploaded with caption:\n", caption);
  // You can add actual upload logic here (optional).
}

async function main() {
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
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

  while (true) {
    try {
      const usernames = await fetchUsernames();
      const username = usernames[Math.floor(Math.random() * usernames.length)];
      console.log("🎯 Target:", username);

      const reelPath = await downloadReel(page, username);
      if (!reelPath) {
        console.log("⚠️ No reel downloaded. Trying next...");
        await delay(30000);
        continue;
      }

      const watermarkedPath = reelPath.replace(".mp4", "_wm.mp4");
      await addWatermark(reelPath, watermarkedPath);

      const caption = `${getRandomCaption()}\n\n${getRandomHashtags()}`;
      await uploadReel(page, watermarkedPath, caption);

      fs.unlinkSync(reelPath);
      fs.unlinkSync(watermarkedPath);

      console.log("⏳ Waiting 5 minutes...");
      await delay(5 * 60 * 1000);
    } catch (err) {
      console.error("❌ Main loop error:", err);
      await delay(60000);
    }
  }
}

main();
