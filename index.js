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
  console.log("\u23EB Uploading reel:", videoPath);
  try {
    await page.goto("https://www.instagram.com/", { waitUntil: "networkidle2" });
    await delay(5000);

    await page.waitForSelector('[aria-label="New post"]', { timeout: 10000 });
    await page.click('[aria-label="New post"]');
    await delay(3000);

    const fileInput = await page.$('input[type="file"]');
    await fileInput.uploadFile(videoPath);
    await delay(5000);

    await page.waitForSelector('text/Next', { timeout: 10000 });
    await page.click('text/Next');
    await delay(2000);

    await page.waitForSelector('text/Next', { timeout: 10000 });
    await page.click('text/Next');
    await delay(2000);

    await page.waitForSelector('textarea', { timeout: 10000 });
    await page.type('textarea', caption);
    await delay(1000);

    const shareButton = await page.$x("//button[contains(text(), 'Share')]");
    if (shareButton.length) {
      await shareButton[0].click();
      console.log("\u2705 Reel shared!");
    } else {
      throw new Error("\u274C Share button not found.");
    }
    await delay(15000);
  } catch (err) {
    console.error("\u274C Upload failed:", err.message);
  }
}

async function main() {
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
  const page = await browser.newPage();

  await page.setUserAgent(
    'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15A372 Safari/604.1'
  );
  await page.setViewport({ width: 375, height: 812, isMobile: true });

  if (fs.existsSync("session.json")) {
    const cookies = JSON.parse(fs.readFileSync("session.json", "utf8"));
    await page.setCookie(...cookies);
    console.log("\uD83D\uDD01 Session loaded");
  } else {
    console.log("\u274C No session.json found. Please login manually first.");
    await browser.close();
    return;
  }

  while (true) {
    try {
      const usernames = await fetchUsernames();
      const username = usernames[Math.floor(Math.random() * usernames.length)];
      console.log("\uD83C\uDFAF Target:", username);

      const reelPath = await downloadReel(page, username);
      if (!reelPath) {
        console.log("\u26A0\uFE0F No reel downloaded.");
        await delay(30000);
        continue;
      }

      const watermarkedPath = reelPath.replace(".mp4", "_wm.mp4");
      await addWatermark(reelPath, watermarkedPath);

      const caption = `${getRandomCaption()}\n\n${getRandomHashtags()}`;
      await uploadReel(page, watermarkedPath, caption);

      fs.unlinkSync(reelPath);
      fs.unlinkSync(watermarkedPath);

      console.log("\u23F3 Waiting 5 minutes...");
      await delay(5 * 60 * 1000);
    } catch (err) {
      console.error("\u274C Error:", err);
      await delay(60000);
    }
  }
}

main();
