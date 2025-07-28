const puppeteer = require("puppeteer");
const fs = require("fs");
const axios = require("axios");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const path = require("path");
const { execSync } = require("child_process");
const delay = (ms) => new Promise((res) => setTimeout(res, ms));

ffmpeg.setFfmpegPath(ffmpegPath);

const INSTAGRAM_URL = "https://www.instagram.com";
const USERNAMES_URL = "https://raw.githubusercontent.com/virkx3/otp/refs/heads/main/usernames.txt";
const WATERMARK = "ig/ramn_preet05";
const VIDEO_DIR = "downloads";
const SCREENSHOT_DIR = "screenshots";

if (!fs.existsSync(VIDEO_DIR)) fs.mkdirSync(VIDEO_DIR);
if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR);

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
  const profileUrl = `${INSTAGRAM_URL}/${username}/reels/`;
  await page.goto(profileUrl, { waitUntil: "domcontentloaded" });
  await delay(3000);

  const links = await page.$$eval("a", (as) =>
    as.map((a) => a.href).filter((href) => href.includes("/reel/"))
  );

  if (!links.length) return null;
  const randomReel = links[Math.floor(Math.random() * links.length)];
  await page.goto(randomReel, { waitUntil: "domcontentloaded" });
  await delay(3000);

  const videoUrl = await page.$eval("video", (v) => v.src);
  const outPath = path.join(VIDEO_DIR, `reel_${Date.now()}.mp4`);
  const writer = fs.createWriteStream(outPath);

  const response = await axios.get(videoUrl, { responseType: "stream" });
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
  console.log("⏫ Uploading reel: ", videoPath);
  // Replace with actual upload logic
  console.log("✅ Uploaded with caption:", caption);
}

async function saveAndPushScreenshot(page, filename = `error-${Date.now()}.png`) {
  const filePath = path.join(SCREENSHOT_DIR, filename);
  await page.screenshot({ path: filePath });

  try {
    execSync(`git config --global user.email \"you@example.com\"`);
    execSync(`git config --global user.name \"auto-bot\"`);
    execSync(`git add ${filePath}`);
    execSync(`git commit -m \"Add screenshot ${filename}\"`);
    execSync(`git push https://${process.env.GITHUB_TOKEN}@github.com/${process.env.REPO}.git main`);
    console.log("📸 Screenshot pushed to GitHub.");
  } catch (err) {
    console.error("❌ Failed to push screenshot:", err.message);
  }
}

async function main() {
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
  const page = await browser.newPage();
  await page.setUserAgent("Mozilla/5.0");

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
        console.log("⚠️ No reel downloaded.");
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
      console.error("❌ Error:", err);
      await saveAndPushScreenshot(page);
      await delay(60000);
    }
  }
}

main();
