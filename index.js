const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const fs = require("fs");
const axios = require("axios");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const path = require("path");
const { Octokit } = require("@octokit/rest");

puppeteer.use(StealthPlugin());
ffmpeg.setFfmpegPath(ffmpegPath);

const VIDEO_DIR = "downloads";
const WATERMARK = "ig/ramn_preet05";
const USERNAMES_URL = "https://raw.githubusercontent.com/virkx3/otp/refs/heads/main/usernames.txt";
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO_OWNER = "virkx3"; // Replace
const REPO_NAME = "igbot";       // Replace
const delay = (ms) => new Promise((res) => setTimeout(res, ms));

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

async function uploadToGitHub(filePath) {
  try {
    const octokit = new Octokit({ auth: GITHUB_TOKEN });
    const content = fs.readFileSync(filePath, { encoding: "base64" });
    const fileName = path.basename(filePath);
    const now = new Date().toISOString().replace(/[:.]/g, "-");

    await octokit.repos.createOrUpdateFileContents({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      path: `errors/${now}-${fileName}`,
      message: `Upload error screenshot ${now}`,
      content,
      committer: { name: "Bot", email: "bot@example.com" },
      author: { name: "Bot", email: "bot@example.com" },
    });

    console.log("📸 Screenshot pushed to GitHub");
  } catch (err) {
    console.error("❌ GitHub upload failed:", err.message);
  }
}

async function downloadFromIqsaved(page, reelUrl) {
  try {
    console.log("📥 Navigating to iqsaved...");
    await page.goto("https://iqsaved.com/reel/", { waitUntil: "networkidle2", timeout: 60000 });

    await page.waitForSelector('input[name="url"]', { timeout: 15000 });
    await page.type('input[name="url"]', reelUrl);
    await page.keyboard.press('Enter');
    console.log("✅ Submitted reel URL");

    await page.waitForTimeout(10000);
    await page.evaluate(() => window.scrollBy(0, 500));

    await page.waitForXPath("//a[contains(text(), 'Download video')]", { timeout: 15000 });
    const [downloadLinkEl] = await page.$x("//a[contains(text(), 'Download video')]");
    const downloadUrl = await page.evaluate(el => el.href, downloadLinkEl);

    if (!downloadUrl || !downloadUrl.includes(".mp4")) throw new Error("❌ Failed to extract valid download URL.");

    console.log("🎯 Download URL found:", downloadUrl);

    const fileName = `reel_${Date.now()}.mp4`;
    const outputPath = path.join("downloads", fileName);

    const response = await axios({ method: "GET", url: downloadUrl, responseType: "stream" });
    const writer = fs.createWriteStream(outputPath);
    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on("finish", () => {
        console.log("✅ Video downloaded:", fileName);
        resolve(outputPath);
      });
      writer.on("error", reject);
    });
  } catch (err) {
    console.error("❌ iqsaved download error:", err.message);
    return null;
  }
}

async function uploadReel(page, videoPath, caption) {
  console.log("⬆️ Uploading reel...");

      // 1. Click "Create"
    const [createBtn] = await page.$x("//span[contains(text(),'Create')]");
    if (createBtn) {
      await createBtn.click();
      console.log("🆕 Clicked Create");
      await delay(4000);
    } else {
      throw new Error("❌ Create button not found");
    }

  // Wait for input[type="file"] and upload file directly
  await page.waitForSelector('input[type="file"]', { visible: true, timeout: 10000 });
  const fileInput = await page.$('input[type="file"]');
  if (!fileInput) throw new Error("❌ File input not found");
  await fileInput.uploadFile(videoPath);
  console.log("📤 Video selected (via direct file upload)");
  await delay(8000); // wait for UI to process file

  // Set crop to "Original"
  const originalBtn = await page.$x("//span[contains(text(), 'Original')]/ancestor::button");
  if (originalBtn.length) {
    await originalBtn[0].click();
    console.log("🖼 Set to Original crop");
    await delay(4000);
  } else {
    console.warn("⚠️ 'Original' crop button not found — skipping");
  }

  // Click first "Next" button
  const nextBtns = await page.$x("//div[text()='Next']/ancestor::button");
  if (!nextBtns.length) throw new Error("❌ First 'Next' button not found");
  await nextBtns[0].click();
  console.log("➡️ Clicked first Next");
  await delay(5000);

  // Click second "Next" button
  const nextAgain = await page.$x("//div[text()='Next']/ancestor::button");
  if (!nextAgain.length) throw new Error("❌ Second 'Next' button not found");
  await nextAgain[0].click();
  console.log("➡️ Clicked second Next");
  await delay(5000);

  // Wait for caption input
  await page.waitForSelector('textarea[aria-label="Write a caption"], div[role="textbox"]', { timeout: 10000 });
  const captionInput = await page.$('textarea[aria-label="Write a caption"], div[role="textbox"]');
  if (!captionInput) throw new Error("❌ Caption input not found");
  await captionInput.click();
  await captionInput.type(caption, { delay: 50 });
  console.log("✏️ Entered caption");
  await delay(3000);

  // Click "Share" button
  const shareBtn = await page.$x("//div[text()='Share']/ancestor::button");
  if (!shareBtn.length) throw new Error("❌ 'Share' button not found");
  await shareBtn[0].click();
  console.log("📤 Shared reel!");
  await delay(10000); // wait for post to complete

  console.log("✅ Upload completed.");
}
async function main() {
  const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox", "--disable-setuid-sandbox"] });
  const page = await browser.newPage();
  await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/114 Safari/537.36");
  await page.setViewport({ width: 1366, height: 768 });

  if (fs.existsSync("session.json")) {
    const cookies = JSON.parse(fs.readFileSync("session.json", "utf8"));
    await page.setCookie(...cookies);
    console.log("🔐 Session loaded");
  } else {
    console.log("❌ No session.json found");
    await browser.close();
    return;
  }

  while (true) {
    let reelPath, watermarkedPath;
    try {
      const usernames = await fetchUsernames();
      const username = usernames[Math.floor(Math.random() * usernames.length)];
      console.log("🎯 Checking:", username);

      const profileUrl = `https://www.instagram.com/${username}/reels/`;
      await page.goto(profileUrl, { waitUntil: "networkidle2" });
      await delay(5000);

      const links = await page.$$eval("a", as => as.map(a => a.href).filter(href => href.includes("/reel/")));
      if (!links.length) {
        console.log("⚠️ No reels found");
        await delay(20000);
        continue;
      }

      const randomReel = links[Math.floor(Math.random() * links.length)];
      console.log("🎬 Reel:", randomReel);

      reelPath = await downloadFromIqsaved(page, randomReel);
      if (!reelPath) continue;

      watermarkedPath = reelPath.replace(".mp4", "_wm.mp4");
      await addWatermark(reelPath, watermarkedPath);
      console.log("💧 Watermark added");

      const caption = `${getRandomCaption()}\n\n${getRandomHashtags()}`;
      const uploaded = await uploadReel(page, watermarkedPath, caption);

      const waitTime = uploaded ? 5 * 60 * 1000 : 2 * 60 * 1000;
      console.log(`⏱️ Waiting ${waitTime / 60000} minutes...`);
      await delay(waitTime);

    } catch (err) {
      console.error("❌ Loop error:", err.message);
      await delay(180000);
    } finally {
      if (reelPath && fs.existsSync(reelPath)) fs.unlinkSync(reelPath);
      if (watermarkedPath && fs.existsSync(watermarkedPath)) fs.unlinkSync(watermarkedPath);
    }
  }
}

main();
