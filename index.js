// Prevent too many listeners in Railway container
process.setMaxListeners(20);

const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const fs = require("fs");
const axios = require("axios");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const path = require("path");

puppeteer.use(StealthPlugin());
ffmpeg.setFfmpegPath(ffmpegPath);

const isRailway = !!process.env.RAILWAY_ENVIRONMENT;
const VIDEO_DIR = "downloads";
const USED_REELS_FILE = "used_reels.json";
const WATERMARK = "ig/ramn_preet05";
const USERNAMES_URL = "https://raw.githubusercontent.com/virkx3/otp/refs/heads/main/usernames.txt";

const delay = (ms, variance = 0) => new Promise((r) => setTimeout(r, ms + Math.floor(Math.random() * variance)));

if (!fs.existsSync(VIDEO_DIR)) fs.mkdirSync(VIDEO_DIR, { recursive: true });

let usedReels = [];
if (fs.existsSync(USED_REELS_FILE)) {
  try {
    usedReels = JSON.parse(fs.readFileSync(USED_REELS_FILE, "utf8"));
  } catch {
    usedReels = [];
  }
}

function getRandomCaption() {
  try {
    const caps = fs.readFileSync("caption.txt", "utf8").split("\n").filter(Boolean);
    return caps[Math.floor(Math.random() * caps.length)];
  } catch {
    return "Check out this reel! 👀 #viral #trending";
  }
}

function getRandomHashtags(count = 15) {
  try {
    const tags = fs.readFileSync("hashtag.txt", "utf8").split("\n").filter(Boolean);
    const selected = [];
    while (selected.length < count && tags.length) {
      const i = Math.floor(Math.random() * tags.length);
      selected.push(tags.splice(i, 1)[0]);
    }
    return selected.join(" ");
  } catch {
    return "#reels #viral #instagram #trending #explore #foryou";
  }
}

async function fetchUsernames() {
  try {
    const { data } = await axios.get(USERNAMES_URL);
    return data.split("\n").map((u) => u.trim()).filter(Boolean);
  } catch {
    return ["backupusername"];
  }
}

function addWatermark(input, output) {
  return new Promise((resolve, reject) => {
    ffmpeg(input)
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
      .output(output)
      .on("end", () => resolve(output))
      .on("error", reject)
      .run();
  });
}

async function downloadFromIqsaved(page, reelUrl) {
  try {
    console.log("➡️ Visiting iqsaved...");
    await page.goto("https://iqsaved.com/reel/", { waitUntil: "networkidle2", timeout: 60000 });

    await page.type('input[name="url"]', reelUrl);
    await page.keyboard.press("Enter");
    await delay(10000, 5000);

    let link = null;
    for (let tries = 0; tries < 30; tries++) {
      link = await page.$('a[href$=".mp4"]');
      if (link) break;
      await delay(500);
    }

    if (!link) throw new Error("No download link found");
    const url = await page.evaluate((el) => el.href, link);

    const name = `reel_${Date.now()}.mp4`;
    const output = path.join(VIDEO_DIR, name);

    const response = await axios({ method: "GET", url, responseType: "stream" });
    const writer = fs.createWriteStream(output);
    response.data.pipe(writer);

    return new Promise((res, rej) => {
      writer.on("finish", () => res(output));
      writer.on("error", rej);
    });
  } catch (e) {
    console.error("❌ Download error:", e.message);
    return null;
  }
}

async function uploadReel(page, videoPath, caption) {
  console.log("🚀 Uploading reel...");

  if (!fs.existsSync(videoPath)) throw new Error("Video missing: " + videoPath);

  await page.goto("https://www.instagram.com/", { waitUntil: "networkidle2" });
  await delay(5000);

  const createBtn = await page.evaluateHandle(() => {
    const spans = Array.from(document.querySelectorAll("span"));
    return spans.find((s) => s.textContent.includes("Create"));
  });

  if (!createBtn) throw new Error("No Create button");
  await createBtn.click();
  await delay(3000);

  const fileInput = await page.$('input[type="file"]');
  if (!fileInput) throw new Error("No file input");
  await fileInput.uploadFile(videoPath);

  await delay(8000);

  await page.type('div[role="textbox"]', caption, { delay: 30 });
  await delay(2000);

  const shareBtn = await page.$x("//div[contains(., 'Share')]");
  if (shareBtn.length) {
    await shareBtn[0].click();
  } else {
    console.log("No Share button found");
  }
}

async function cleanup(files) {
  for (const f of files) {
    if (fs.existsSync(f)) {
      fs.unlinkSync(f);
      console.log("🧹 Deleted:", f);
    }
  }
}

(async () => {
  const browser = await puppeteer.launch({
    headless: "new",
    executablePath: isRailway ? "/usr/bin/chromium" : undefined,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--no-zygote",
      "--single-process",
    ],
  });

  const page = await browser.newPage();

  if (isRailway && process.env.SESSION_JSON) {
    const cookies = JSON.parse(process.env.SESSION_JSON);
    await page.setCookie(...cookies);
  }

  const usernames = await fetchUsernames();
  const randomUser = usernames[Math.floor(Math.random() * usernames.length)];
  console.log("🔗 Username:", randomUser);

  while (true) {
    const url = `https://www.instagram.com/p/${randomUser}/`;
    const file = await downloadFromIqsaved(page, url);
    if (file) {
      const watermarked = `${file}_wm.mp4`;
      await addWatermark(file, watermarked);
      const caption = `${getRandomCaption()}\n\n${getRandomHashtags()}`;
      await uploadReel(page, watermarked, caption);
      await cleanup([file, watermarked]);
    }
    await delay(30000, 10000);
  }

  // browser.close() is never reached in infinite loop
})();
