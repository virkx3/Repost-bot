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
const WATERMARK = "ig/ramn_preet05";
const VIDEO_DIR = "downloads";

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

async function downloadFromIqsaved(page, reelUrl) {
  try {
    await page.goto("https://iqsaved.com/reel/", { waitUntil: "networkidle2", timeout: 60000 });
    await delay(4000);
    await page.type("#url-box", reelUrl);
    await delay(1000);
    await page.click('button[type="submit"]');
    await delay(10000);

    await page.evaluate(() => window.scrollBy(0, 500));
    await delay(3000);

    const videoUrl = await page.$eval('a[href$=".mp4"]', el => el.href);
    if (!videoUrl) return null;

    const fileName = `reel_${Date.now()}.mp4`;
    const filePath = path.join(VIDEO_DIR, fileName);
    const response = await axios.get(videoUrl, { responseType: "stream" });

    const writer = fs.createWriteStream(filePath);
    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on("finish", () => resolve(filePath));
      writer.on("error", reject);
    });
  } catch (err) {
    console.error("Download error:", err.message);
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
  try {
    await page.goto(INSTAGRAM_URL, { waitUntil: "networkidle2", timeout: 60000 });
    await delay(5000);

    const createBtn = await page.$('svg[aria-label="New post"]');
    if (!createBtn) throw new Error("Upload button not found");
    await createBtn.click();
    await delay(3000);

    const fileInput = await page.$('input[type="file"]');
    if (fileInput) {
      await fileInput.uploadFile(videoPath);
    } else {
      const [fileChooser] = await Promise.all([
        page.waitForFileChooser({ timeout: 10000 }),
        page.keyboard.press('Enter'),
      ]);
      await fileChooser.accept([videoPath]);
    }

    await delay(8000);
    const nextBtn = await page.$x("//div[text()='Next']");
    if (nextBtn.length) await nextBtn[0].click();
    await delay(3000);
    const next2 = await page.$x("//div[text()='Next']");
    if (next2.length) await next2[0].click();
    await delay(3000);

    const captionBox = await page.$("textarea[aria-label='Write a caption…']");
    if (captionBox) {
      await captionBox.type(caption, { delay: 50 });
    }

    const shareBtn = await page.$x("//div[text()='Share']");
    if (shareBtn.length) {
      await shareBtn[0].click();
      console.log("✅ Reel uploaded");
      await delay(15000);
      return true;
    }

    throw new Error("Share button not found");
  } catch (err) {
    console.error("❌ Upload failed:", err.message);
    return false;
  }
}

async function main() {
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  const page = await browser.newPage();
  await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115 Safari/537.36");
  await page.setViewport({ width: 1366, height: 768 });

  if (fs.existsSync("session.json")) {
    const cookies = JSON.parse(fs.readFileSync("session.json", "utf8"));
    await page.setCookie(...cookies);
    console.log("🔐 Session loaded");
  } else {
    console.log("❌ session.json missing");
    await browser.close();
    return;
  }

  await page.goto(INSTAGRAM_URL, { waitUntil: "networkidle2" });
  try {
    await page.waitForSelector('svg[aria-label="Home"]', { timeout: 10000 });
    console.log("✅ Logged in");
  } catch {
    console.log("❌ Login session invalid");
    await browser.close();
    return;
  }

  while (true) {
    let reelPath, wmPath;

    try {
      const usernames = await fetchUsernames();
      const username = usernames[Math.floor(Math.random() * usernames.length)];
      console.log("🎯 Checking:", username);

      const profile = `${INSTAGRAM_URL}/${username}/reels/`;
      await page.goto(profile, { waitUntil: "networkidle2" });
      await delay(4000);

      const links = await page.$$eval("a", a => a.map(n => n.href).filter(h => h.includes("/reel/")));
      if (!links.length) {
        console.log("⚠️ No reels found");
        await delay(30000);
        continue;
      }

      const reelLink = links[Math.floor(Math.random() * links.length)];
      console.log("🎥 Reel:", reelLink);

      reelPath = await downloadFromIqsaved(page, reelLink);
      if (!reelPath) {
        await delay(30000);
        continue;
      }

      wmPath = reelPath.replace(".mp4", "_wm.mp4");
      await addWatermark(reelPath, wmPath);
      console.log("🖋️ Watermark done");

      const caption = `${getRandomCaption()}\n\n${getRandomHashtags()}`;
      const success = await uploadReel(page, wmPath, caption);

      const waitMs = success ? 5 * 60 * 1000 : 2 * 60 * 1000;
      console.log(`⏱️ Waiting ${waitMs / 60000} minutes...`);
      await delay(waitMs);
    } catch (err) {
      console.error("🔁 Error:", err.message);
      await delay(180000);
    } finally {
      if (reelPath && fs.existsSync(reelPath)) fs.unlinkSync(reelPath);
      if (wmPath && fs.existsSync(wmPath)) fs.unlinkSync(wmPath);
    }
  }
}

main().catch(err => console.error("💥 Fatal:", err.message));
