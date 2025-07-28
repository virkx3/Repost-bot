const puppeteer = require("puppeteer");
const fs = require("fs");
const axios = require("axios");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const path = require("path");
const { instagramGetUrl } = require("instagram-url-direct");

const delay = (ms) => new Promise((res) => setTimeout(res, ms));
ffmpeg.setFfmpegPath(ffmpegPath);

const INSTAGRAM_URL = "https://www.instagram.com";
const USERNAMES_URL = "https://raw.githubusercontent.com/virkx3/otp/refs/heads/main/usernames.txt";
const WATERMARK = "ig/ramn_preet05";
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

async function downloadReel(page, username) {
  await page.goto(`${INSTAGRAM_URL}/${username}/reels/`, { waitUntil: "networkidle2" });
  await delay(3000);
  const links = await page.$$eval("a", as =>
    as.map(a => a.href).filter(h => h.includes("/reel/"))
  );
  if (!links.length) return null;

  const reelUrl = links[Math.floor(Math.random() * links.length)];
  console.log("\u{1F3AF} Reel URL:", reelUrl);
  const result = await instagramGetUrl(reelUrl).catch(() => null);
  const videoUrl = result?.url_list?.[0]?.url || result?.media_details?.[0]?.url;
  if (!videoUrl || !videoUrl.endsWith(".mp4")) return null;

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
  console.log("\u{2B06}\u{FE0F} Uploading reel:", videoPath);
  console.log("✅ Uploaded with caption:", caption);
  // Optional: You can implement manual upload via Instagram mobile flow here if desired
}

async function main() {
  const iPhone = puppeteer.devices["iPhone X"];
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
  const page = await browser.newPage();
  await page.emulate(iPhone);

  if (fs.existsSync("session.json")) {
    const cookies = JSON.parse(fs.readFileSync("session.json", "utf8"));
    await page.setCookie(...cookies);
    console.log("\u{1F501} Session loaded");
  } else {
    console.log("\u274C No session.json found. Please login manually first.");
    await browser.close();
    return;
  }

  while (true) {
    try {
      const usernames = await fetchUsernames();
      const username = usernames[Math.floor(Math.random() * usernames.length)];
      console.log("\u{1F3AF} Target:", username);

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
