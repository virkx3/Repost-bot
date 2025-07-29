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
  try {
  console.log("⬆️ Uploading reel...");

  if (!fs.existsSync(videoPath)) {
    throw new Error(`❌ Video file not found at path: ${videoPath}`);
  }

  await page.goto("https://www.instagram.com/", { waitUntil: "networkidle2" });
  await delay(5000);

   // 1. Click Create
    const [createBtn] = await page.$x("//span[contains(text(),'Create')]");
    if (!createBtn) throw new Error("❌ Create button not found");
    await createBtn.click();
    console.log("🆕 Clicked Create");
    await delay(5000);

  // 2. Try using file input directly
  let fileInput = await page.$('input[type="file"][accept*=""]');

  if (!fileInput) {
    console.log("⚠️ File input not found — trying fallback brute-force clicking...");

    // Add fake cursor
    await page.evaluate(() => {
      if (document.getElementById("fake-cursor")) return;
      const cursor = document.createElement("div");
      cursor.id = "fake-cursor";
      cursor.style.position = "fixed";
      cursor.style.width = "20px";
      cursor.style.height = "20px";
      cursor.style.border = "2px solid red";
      cursor.style.borderRadius = "50%";
      cursor.style.zIndex = "9999";
      cursor.style.pointerEvents = "none";
      cursor.style.transition = "top 0.05s, left 0.05s";
      document.body.appendChild(cursor);
    });

    const moveCursor = async (x, y) => {
      await page.evaluate((x, y) => {
        const c = document.getElementById('fake-cursor');
        if (c) {
          c.style.left = `${x}px`;
          c.style.top = `${y}px`;
        }
      }, x, y);
      await page.mouse.move(x, y);
    };

    const fallbackX = 595;
    const fallbackY = 455;
    let filePickerOpened = false;

    for (let i = 1; i <= 50; i++) {
      const x = fallbackX + Math.floor(Math.random() * 20 - 10);
      const y = fallbackY + Math.floor(Math.random() * 20 - 10);

      console.log(`🔁 Fallback click ${i} at (${x}, ${y})`);
      await moveCursor(x, y);
      await page.mouse.click(x, y);

      await delay(2000);

      const screenshotPath = `upload_attempt_${i}.png`;
      await page.screenshot({ path: screenshotPath });
      console.log(`📸 Screenshot saved: ${screenshotPath}`);
      if (GITHUB_TOKEN) await uploadToGitHub(screenshotPath);

      // Re-check for file input
      fileInput = await page.$('input[type="file"][accept*="video/"]');
      if (fileInput) {
        const visible = await fileInput.evaluate(el => {
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        });
        if (visible) {
          console.log(`✅ File picker detected on attempt ${i}`);
          filePickerOpened = true;
          break;
        }
      }
    }

    if (!filePickerOpened) {
      throw new Error("❌ Failed to open file picker after 50 fallback attempts");
    }
  }

  // Upload file now that input is ready
  await fileInput.uploadFile(videoPath);
  console.log("📤 Video file attached");
  await delay(8000);  // Wait for processing

  // 3. Handle crop selector
  await page.evaluate(() => {
    const buttons = [...document.querySelectorAll("div[role='button']")];
    const originalBtn = buttons.find(b =>
      b.textContent?.toLowerCase().includes("original")
    );
    if (originalBtn) originalBtn.click();
  });
  console.log("🖼 Set to Original crop");
  await delay(4000);

  // 4. First Next button
  const nextButtons = await page.$$('div[role="button"]');
  for (const button of nextButtons) {
    const text = await page.evaluate(el => el.textContent, button);
    if (text.includes('Next')) {
      await button.click();
      console.log("➡️ Clicked first Next");
      await delay(4000);
      break;
    }
  }

  // 5. Second Next button
  for (const button of nextButtons) {
    const text = await page.evaluate(el => el.textContent, button);
    if (text.includes('Next')) {
      await button.click();
      console.log("➡️ Clicked second Next");
      await delay(4000);
      break;
    }
  }

  // 6. Add caption
  await page.type('div[role="textbox"]', caption, { delay: 50 });
  console.log("📝 Caption entered");
  await delay(2000);

  // 7. Share button
  const shareButton = await page.$x('//div[text()="Share"]');
  if (shareButton.length > 0) {
    await shareButton[0].click();
    console.log("✅ Reel shared");
    await delay(20000);  // Wait for upload completion
    return true;
  }

  throw new Error("❌ Share button not found");
} catch (err) {
  const timestamp = Date.now();
  const screenshotPath = `upload_error_${timestamp}.png`;
  await page.screenshot({ path: screenshotPath });
  console.error(`❌ Upload error: ${err.message} — Screenshot saved: ${screenshotPath}`);
  if (GITHUB_TOKEN) await uploadToGitHub(screenshotPath);
  return false;
 }
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
