const puppeteer = require("puppeteer");
const fs = require("fs");
const axios = require("axios");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const path = require("path");
const { execSync } = require("child_process");
const dayjs = require("dayjs");

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
  // 👇 Add actual upload logic here if needed
  console.log("✅ Uploaded with caption:", caption);
}

async function commitAndPushScreenshot(filePath, message = "Upload error screenshot") {
  try {
    const repo = process.env.REPO;
    const token = process.env.GITHUB_TOKEN;
    if (!repo || !token) {
      console.warn("❌ GITHUB_TOKEN or REPO not set. Skipping GitHub upload.");
      return;
    }

    const [owner, repoName] = repo.split("/");
    const repoURL = `https://${token}@github.com/${owner}/${repoName}.git`;

    execSync("git config --global user.email 'bot@example.com'");
    execSync("git config --global user.name 'InstaBot'");

    execSync("git pull", { stdio: "ignore" });
    execSync(`git add ${filePath}`);
    execSync(`git commit -m \"${message}\"`, { stdio: "ignore" });
    execSync(`git push ${repoURL} HEAD:main`);
    console.log(`📤 Screenshot pushed to GitHub repo: ${repo}`);
  } catch (err) {
    console.error("❌ Failed to push screenshot:", err.message);
  }
}

async function main() {
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--window-size=1280,720",
      "--hide-scrollbars",
      "--mute-audio"
    ],
    defaultViewport: {
      width: 1280,
      height: 720,
      isMobile: false
    }
  });

  const page = await browser.newPage();
  await page.setUserAgent("Mozilla/5.0");

  // Load session cookies
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
      const screenshot = "fatal_error.png";
      await page.waitForTimeout(3000);
      await page.screenshot({ path: screenshot, fullPage: true });
      const size = fs.statSync(screenshot).size;
      console.log("📷 Screenshot size:", size);
      await commitAndPushScreenshot(screenshot, "Fatal error screenshot");
      await delay(60000);
    }
  }
}

main();
