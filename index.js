const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const fs = require("fs");
const axios = require("axios");
const path = require("path");
const ffmpeg = require("fluent-ffmpeg");
// Remove: ffmpeg.setFfmpegPath("/usr/local/bin/ffmpeg");

puppeteer.use(StealthPlugin());

const VIDEO_DIR = "downloads";
const USED_REELS_FILE = "used_reels.json";
const WATERMARK = "ig/ramn_preet05";
const USERNAMES_URL = "https://raw.githubusercontent.com/virkx3/otp/refs/heads/main/usernames.txt";

const fontPaths = [
  path.join(__dirname, 'fonts', 'BebasNeue-Regular.ttf'),
  path.join(__dirname, 'fonts', 'NotoColorEmoji.ttf')
];

// Verify fonts exist
fontPaths.forEach(fontPath => {
  if (!fs.existsSync(fontPath)) {
    console.error(`❌ Critical Error: Missing font file at ${fontPath}`);
    console.error("💡 Solution: Make sure your fonts directory is included in your repository");
    process.exit(1);
  }
}); // Fixed: close the forEach callback and the forEach.

// Now define delay function and the rest
const delay = (ms, variation = 0) => new Promise(res => setTimeout(res, ms + (variation ? Math.floor(Math.random() * variation) : 0)));
if (!fs.existsSync(VIDEO_DIR)) fs.mkdirSync(VIDEO_DIR);

// ... rest of the code

let usedReels = [];
if (fs.existsSync(USED_REELS_FILE)) {
  usedReels = JSON.parse(fs.readFileSync(USED_REELS_FILE, "utf8"));
}

function getRandomCaption() {
  const captions = fs.readFileSync("caption.txt", "utf8").split("\n").filter(Boolean);
  return captions[Math.floor(Math.random() * captions.length)];
}

function getRandomOverlay() {
  const lines = fs.readFileSync("overlay.txt", "utf8").split("\n").filter(Boolean);
  return lines[Math.floor(Math.random() * lines.length)];
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

function addCaptionOverlayAndTransform(inputPath, outputPath, caption) {
  return new Promise((resolve, reject) => {
    const command = ffmpeg(inputPath)
      .videoFilter({
        filter: 'drawtext',
        options: {
          text: caption.replace(/:/g, '\\:').replace(/'/g, "\\'"),
          fontfile: path.join(__dirname, 'fonts', 'BebasNeue-Regular.ttf'),
          fontcolor: 'white',
          fontsize: 44,
          x: '(w-text_w)/2',
          y: '(h-text_h)/2',
          enable: 'between(t,1,4)',
          box: 1,
          boxcolor: 'black@0.6',
          boxborderw: 10
        }
      })
      .videoFilter({
        filter: 'drawtext',
        options: {
          text: caption.replace(/:/g, '\\:').replace(/'/g, "\\'"),
          fontfile: path.join(__dirname, 'fonts', 'NotoColorEmoji.ttf'),
          fontsize: 44,
          x: '(w-text_w)/2',
          y: '(h-text_h)/2',
          fontcolor: 'white',
          enable: 'between(t,1,4)'
        }
      })
      .videoFilter('eq=brightness=0.02:contrast=1.1')
      .videoFilter('crop=iw*0.98:ih*0.98')
      .outputOptions([
        '-preset veryfast',
        '-threads 2',
        '-max_muxing_queue_size 1024'
      ])
      .output(outputPath);

    command
      .on('start', cmd => console.log('▶️ FFmpeg command:', cmd))
      .on('stderr', line => console.log('📝 FFmpeg log:', line))
      .on('end', () => resolve(outputPath))
      .on('error', err => {
        console.error('❌ FFmpeg error:', err.message);
        reject(err);
      })
      .run();
  });
}

async function downloadFromIqsaved(page, reelUrl) {
  try {
    console.log("📥 Navigating to iqsaved...");
    await page.goto("https://iqsaved.com/reel/", { waitUntil: "networkidle2", timeout: 100000 });

    await page.waitForSelector('input[name="url"]', { timeout: 15000 });
    await page.type('input[name="url"]', reelUrl);
    await page.keyboard.press('Enter');
    console.log("✅ Submitted reel URL");

    await delay(10000, 5000); // Random delay between 10-15 seconds
    await page.evaluate(() => window.scrollBy(0, 1000));

    let downloadLinkEl;
    for (let i = 0; i < 30; i++) {
      downloadLinkEl = await page.$('a[href$=".mp4"]');
      if (downloadLinkEl) break;
      await delay(500);
    }
    if (!downloadLinkEl) throw new Error("❌ Failed to find download link.");

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

    await page.setViewport({ width: 1366, height: 900 });
    await delay(5000, 2000); // Random delay between 5-7 seconds

    // Click Create
    const createBtn = await page.evaluateHandle(() => {
      const spans = Array.from(document.querySelectorAll("span"));
      return spans.find(span => span.textContent.includes("Create"));
    });
    if (!createBtn) throw new Error("❌ Create button not found");
    await createBtn.click();
    console.log("🆕 Clicked Create");
    await delay(2000, 1000); // Random delay between 2-3 seconds

    // Click "Post" in the popup
    await page.evaluate(() => {
      const spans = Array.from(document.querySelectorAll("span"));
      const postBtn = spans.find(span => span.textContent.trim() === "Post");
      if (postBtn) {
        postBtn.click();
      }
    });
    console.log("✅ Brute force click for Post done.");
    await delay(2000, 1000);

    const fileInput = await page.$('input[type="file"]');
    if (!fileInput) {
      throw new Error("❌ File input not found — cannot proceed");
    }

    await fileInput.uploadFile(videoPath);
    console.log("📤 Video file attached");
    await delay(8000, 3000); // Random delay between 8-11 seconds

    console.log("🔍 Trying brute force click for OK popup...");
    await page.evaluate(() => {
      const allButtons = Array.from(document.querySelectorAll("button"));
      allButtons.forEach(btn => {
        if (btn.innerText.trim().toUpperCase() === "OK") {
          btn.click();
        }
      });
    });
    await delay(3000, 2000);

    await page.waitForSelector('div[aria-label="Select crop"], svg[aria-label="Select crop"]', { visible: true });
    await page.click('div[aria-label="Select crop"], svg[aria-label="Select crop"]');
    console.log("✅ Clicked crop icon");

    await page.evaluate(() => {
      const spans = Array.from(document.querySelectorAll('span'));
      const found = spans.find(el => el.innerText.trim() === 'Original');
      if (found) {
        found.click();
        console.log("✅ Clicked Original by brute force");
      }
    });

    const nextButtons = await page.$$('div[role="button"]');
    let clickedNext = false;
    for (const button of nextButtons) {
      const text = await page.evaluate(el => el.textContent.trim(), button);
      if (text === "Next") {
        await button.click();
        console.log("➡️ Clicked first Next");
        clickedNext = true;
        await delay(4000, 2000); // Random delay between 4-6 seconds
        break;
      }
    }
    if (!clickedNext) throw new Error("❌ First Next button not found");

    const nextButtons2 = await page.$$('div[role="button"]');
    clickedNext = false;
    for (const button of nextButtons2) {
      const text = await page.evaluate(el => el.textContent.trim(), button);
      if (text === "Next") {
        await button.click();
        console.log("➡️ Clicked second Next");
        clickedNext = true;
        await delay(4000, 2000); // Random delay between 4-6 seconds
        break;
      }
    }
    if (!clickedNext) throw new Error("❌ Second Next button not found");

    await page.type('div[role="textbox"]', caption, { delay: 30 });
    console.log("📝 Caption entered");
    await delay(2000, 1000);

    // Share button
    await page.waitForSelector("div[role='button']");
    const shareBtns = await page.$$('div[role="button"]');
    let clicked = false;
    for (const btn of shareBtns) {
      const txt = await page.evaluate(el => el.innerText.trim(), btn);
      if (txt === "Share") {
        await btn.click();
        console.log("✅ Clicked Share button");
        clicked = true;
        break;
      }
    }
    if (!clicked) console.log("❌ Could not find Share button!");

    return true;
  } catch (err) {
    console.error("❌ uploadReel error:", err.message);
    return false;
  }
}

async function cleanupFiles(filePaths) {
  filePaths.forEach(filePath => {
    if (filePath && fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
        console.log(`🧹 Deleted file: ${path.basename(filePath)}`);
      } catch (err) {
        console.error(`❌ Error deleting file ${filePath}:`, err.message);
      }
    }
  });
}

function isSleepTime() {
  const now = new Date();
  const hours = now.getHours();
  return hours >= 22 || hours < 9;
}

async function handleSleepTime() {
  if (!isSleepTime()) return;
  const now = new Date();
  const wakeTime = new Date();
  if (now.getHours() >= 22) wakeTime.setDate(wakeTime.getDate() + 1);
  wakeTime.setHours(9, 0, 0, 0);
  const msUntilWake = wakeTime - now;
  console.log(`⏰ Sleeping until ${wakeTime.toLocaleTimeString()} (${Math.round(msUntilWake/60000)} minutes)`);
  await delay(msUntilWake);
  console.log("⏰ Wake up! Resuming operations...");
}

async function main() {
  const browser = await puppeteer.launch({ 
    headless: "new", 
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--start-maximized"] 
  });
  const page = await browser.newPage();
  await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36");
  await page.setViewport({ width: 1366, height: 900, deviceScaleFactor: 1 });

  try {
    const { data } = await axios.get("https://raw.githubusercontent.com/virkx3/Repost-bot/refs/heads/main/session.json");
    await page.setCookie(...data);
    console.log("🔐 Session loaded from remote URL");
  } catch (error) {
    console.log("❌ Failed to load session from remote URL");
    await browser.close();
    return;
  }

  while (true) {
    let reelPath, finalPath;
    try {
      await handleSleepTime();
      const usernames = await fetchUsernames();
      const username = usernames[Math.floor(Math.random() * usernames.length)];
      const profileUrl = `https://www.instagram.com/${username}/reels/`;

      await page.goto(profileUrl, { waitUntil: "networkidle2" });
      await delay(5000, 2000);

      const scrollCount = 2 + Math.floor(Math.random() * 5);
      for (let i = 0; i < scrollCount; i++) {
        await page.evaluate(() => window.scrollBy(0, window.innerHeight));
        await delay(1000 + Math.random() * 2000);
      }

      const links = await page.$$eval("a", as => as.map(a => a.href).filter(href => href.includes("/reel/")));
      const availableReels = links.filter(link => !usedReels.includes(link));
      if (!availableReels.length) {
        await delay(30000);
        continue;
      }

      const randomReel = availableReels[Math.floor(Math.random() * availableReels.length)];
      reelPath = await downloadFromIqsaved(page, randomReel);
      if (!reelPath) continue;

      const overlayText = getRandomOverlay();  // From overlay.txt
      const captionText = getRandomCaption();  // For Instagram caption
      const finalCaption = `${captionText}\n\nCredit @${username}\n${getRandomHashtags()}`;

      finalPath = reelPath.replace(".mp4", "_final.mp4");
      await addCaptionOverlayAndTransform(reelPath, finalPath, captionText);

      const uploaded = await uploadReel(page, finalPath, finalCaption);
      if (uploaded) {
        usedReels.push(randomReel);
        fs.writeFileSync(USED_REELS_FILE, JSON.stringify(usedReels, null, 2));
      }

      const nextPostTime = new Date();
      nextPostTime.setHours(nextPostTime.getHours() + 3);
      nextPostTime.setMinutes(0, 0, 0);
      if (nextPostTime.getHours() >= 22 || nextPostTime.getHours() < 9) {
        nextPostTime.setDate(nextPostTime.getDate() + 1);
        nextPostTime.setHours(9, 0, 0, 0);
      }
      const now = new Date();
      const waitTime = nextPostTime - now;
      console.log(`⏱️ Waiting until ${nextPostTime.toLocaleTimeString()} (~${Math.round(waitTime / 60000)} minutes)...`);
      await delay(waitTime);

    } catch (err) {
      console.error("❌ Loop error:", err.message);
      await delay(180000, 60000);
    } finally {
      cleanupFiles([reelPath, finalPath]);
    }
  }
}

main();
