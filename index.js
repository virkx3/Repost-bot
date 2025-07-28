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

async function downloadReel(page, username) {
  const profileUrl = `${INSTAGRAM_URL}/${username}/reels/`;
  await page.goto(profileUrl, { waitUntil: "networkidle2", timeout: 30000 });
  await delay(5000);

  const links = await page.$$eval("a", (as) =>
    as.map((a) => a.href).filter((href) => href.includes("/reel/"))
  );

  if (!links.length) return null;
  const randomReel = links[Math.floor(Math.random() * links.length)];
  await page.goto(randomReel, { waitUntil: "networkidle2", timeout: 30000 });
  await delay(5000);

  // Get video URL and determine download method
  const videoUrl = await page.$eval("video", (v) => v.src);
  const outPath = path.join(VIDEO_DIR, `reel_${Date.now()}.mp4`);

  if (videoUrl.startsWith('blob:')) {
    console.log("📦 Handling blob URL video with XHR method");
    try {
      // Use XHR to fetch blob in browser context
      const videoData = await page.evaluate(async (url) => {
        return new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('GET', url, true);
          xhr.responseType = 'arraybuffer';
          
          xhr.onload = () => {
            if (xhr.status === 200) {
              resolve(Array.from(new Uint8Array(xhr.response)));
            } else {
              reject(new Error(`XHR failed with status ${xhr.status}`));
            }
          };
          
          xhr.onerror = () => reject(new Error('XHR failed'));
          xhr.send();
        });
      }, videoUrl);

      fs.writeFileSync(outPath, Buffer.from(videoData));
      return outPath;
    } catch (err) {
      console.error("❌ Blob download failed:", err.message);
      return null;
    }
  } else {
    console.log("🌐 Handling direct URL video");
    try {
      const response = await axios({
        url: videoUrl,
        method: 'GET',
        responseType: 'arraybuffer',
        timeout: 60000
      });
      fs.writeFileSync(outPath, response.data);
      return outPath;
    } catch (err) {
      console.error("❌ Direct download failed:", err.message);
      return null;
    }
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
  console.log("\u23EB Uploading reel:", videoPath);
  
  try {
    // Reload homepage to ensure clean state
    await page.goto("https://www.instagram.com/", { 
      waitUntil: "networkidle2", 
      timeout: 60000 
    });
    await delay(7000);

    // Improved new post button detection
    const newPostSelectors = [
      '[aria-label="New post"]',
      '[aria-label="Create new post"]',
      'div[role="button"]:has(> div > svg[aria-label="New post"])',
      'svg[aria-label="New post"]',
      'button:has(> svg[aria-label="New post"])'
    ];

    let postButtonFound = false;
    for (const selector of newPostSelectors) {
      try {
        await page.waitForSelector(selector, { timeout: 10000 });
        await page.click(selector);
        console.log(`✅ Found post button with: ${selector}`);
        postButtonFound = true;
        break;
      } catch (e) {
        console.log(`❌ Not found: ${selector}`);
      }
    }

    if (!postButtonFound) {
      throw new Error("Post button not found with any selector");
    }

    await delay(4000);

    // Handle file upload
    const fileInput = await page.$('input[type="file"]');
    if (fileInput) {
      await fileInput.uploadFile(videoPath);
    } else {
      console.log("❌ File input not found, using keyboard shortcut");
      const [fileChooser] = await Promise.all([
        page.waitForFileChooser({ timeout: 10000 }),
        page.keyboard.press('Enter')
      ]);
      await fileChooser.accept([videoPath]);
    }
    await delay(8000);

    // Next steps
    const nextSelectors = [
      'div[role="button"]:has(div:text("Next")),',
      'button:has(div:text("Next")),',
      'div[aria-label="Next"],',
      '._ac7b._ac7d:has(div:text("Next"))'
    ].join('');

    await page.waitForSelector(nextSelectors, { timeout: 15000 });
    await page.click(nextSelectors);
    await delay(3000);

    await page.waitForSelector(nextSelectors, { timeout: 10000 });
    await page.click(nextSelectors);
    await delay(3000);

    // Caption input
    const captionSelectors = [
      'textarea[aria-label="Write a caption"]',
      'div[aria-label="Write a caption"]',
      'div[contenteditable="true"]'
    ].join(',');

    await page.waitForSelector(captionSelectors, { timeout: 15000 });
    await page.type(captionSelectors, caption, { delay: 50 });
    await delay(2000);

    // Share button
    const shareSelectors = [
      'div[role="button"]:has(div:text("Share")),',
      'button:has(div:text("Share")),',
      'div[aria-label="Share"],',
      '._ac7b._ac7d:has(div:text("Share"))'
    ].join('');

    const shareButton = await page.$(shareSelectors);
    if (shareButton) {
      await shareButton.click();
      console.log("\u2705 Reel shared!");
      
      // Wait for confirmation
      await page.waitForSelector('svg[aria-label="Your post has been shared"]', { timeout: 60000 })
        .catch(() => console.log("⚠️ Post confirmation not detected"));
    } else {
      console.log("❌ Share button not found. Using keyboard fallback");
      await page.keyboard.press('Enter');
    }
    
    await delay(15000);
    return true;
  } catch (err) {
    console.error("\u274C Upload failed:", err.message);
    return false;
  }
}

async function main() {
  const browser = await puppeteer.launch({ 
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--single-process",
      "--no-zygote",
      "--disable-gpu"
    ]
  });
  
  const page = await browser.newPage();
  await page.setUserAgent(
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1'
  );
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true });

  if (fs.existsSync("session.json")) {
    const cookies = JSON.parse(fs.readFileSync("session.json", "utf8"));
    await page.setCookie(...cookies);
    console.log("\uD83D\uDD01 Session loaded");
  } else {
    console.log("\u274C No session.json found");
    await browser.close();
    return;
  }

  // Session validation
  await page.goto(INSTAGRAM_URL, { waitUntil: "networkidle2", timeout: 60000 });
  try {
    await page.waitForSelector('svg[aria-label="Home"]', { timeout: 10000 });
    console.log("✅ Session valid");
  } catch {
    console.log("❌ Session invalid. Reloading...");
    await page.reload();
    await delay(5000);
  }

  while (true) {
    let reelPath, watermarkedPath;
    
    try {
      const usernames = await fetchUsernames();
      const username = usernames[Math.floor(Math.random() * usernames.length)];
      console.log("\uD83C\uDFAF Target:", username);

      reelPath = await downloadReel(page, username);
      if (!reelPath) {
        console.log("\u26A0\uFE0F No reel downloaded. Skipping...");
        await delay(30000);
        continue;
      }

      watermarkedPath = reelPath.replace(".mp4", "_wm.mp4");
      await addWatermark(reelPath, watermarkedPath);

      const caption = `${getRandomCaption()}\n\n${getRandomHashtags()}`;
      const uploadSuccess = await uploadReel(page, watermarkedPath, caption);

      // Adjust wait time based on upload success
      const waitTime = uploadSuccess 
        ? 5 * 60 * 1000  // 5 minutes if successful
        : 2 * 60 * 1000; // 2 minutes if failed
      
      console.log(`\u23F3 Waiting ${waitTime/60000} minutes...`);
      await delay(waitTime);
    } catch (err) {
      console.error("\u274C Main loop error:", err);
      console.log("\u23F3 Retrying in 3 minutes...");
      await delay(180000);
    } finally {
      // Cleanup files
      if (reelPath && fs.existsSync(reelPath)) fs.unlinkSync(reelPath);
      if (watermarkedPath && fs.existsSync(watermarkedPath)) fs.unlinkSync(watermarkedPath);
    }
  }
}

main().catch(err => console.error("\u274C Fatal error:", err));
