const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const fs = require("fs");
const axios = require("axios");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const path = require("path");
const delay = (ms) => new Promise((res) => setTimeout(res, ms));

// Setup Puppeteer with stealth (no proxy)
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

async function getVideoUrl(page) {
  try {
    const videoUrl = await page.evaluate(() => {
      const metaVideo = document.querySelector('meta[property="og:video"]');
      if (metaVideo) return metaVideo.content;
      
      const video = document.querySelector('video');
      if (video) return video.src;
      
      const scripts = Array.from(document.querySelectorAll('script'));
      for (const script of scripts) {
        if (script.textContent.includes('video_url')) {
          const match = script.textContent.match(/"video_url":"(https?:\/\/[^"]+\.mp4[^"]*)"/);
          if (match) return match[1];
        }
      }
      return null;
    });
    
    return videoUrl;
  } catch (err) {
    console.error("Failed to extract video URL:", err);
    return null;
  }
}

async function downloadVideo(url) {
  if (!url || url.startsWith('blob:')) {
    console.log("Skipping blob URL");
    return null;
  }

  try {
    const outPath = path.join(VIDEO_DIR, `reel_${Date.now()}.mp4`);
    const response = await axios({
      url,
      method: 'GET',
      responseType: 'arraybuffer',
      timeout: 60000
    });
    
    fs.writeFileSync(outPath, response.data);
    return outPath;
  } catch (err) {
    console.error("Download failed:", err.message);
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
  console.log("\u23EB Uploading reel:", videoPath);
  
  try {
    await page.goto(INSTAGRAM_URL, { 
      waitUntil: "networkidle2", 
      timeout: 60000 
    });
    await delay(5000);

    const createButton = await page.waitForSelector(
      'span:has-text("Create")', 
      { timeout: 10000 }
    );
    await createButton.click();
    await delay(3000);

    const fileInput = await page.$('input[type="file"]');
    if (fileInput) {
      await fileInput.uploadFile(videoPath);
    } else {
      console.log("Using keyboard fallback for file input");
      const [fileChooser] = await Promise.all([
        page.waitForFileChooser({ timeout: 10000 }),
        page.keyboard.press('Enter')
      ]);
      await fileChooser.accept([videoPath]);
    }
    await delay(8000);
    
    const originalButton = await page.waitForSelector(
      'div:has-text("Original")', 
      { timeout: 10000 }
    );
    await originalButton.click();
    await delay(2000);
    
    const nextButtons = await page.$$('div:has-text("Next")');
    if (nextButtons.length > 0) {
      await nextButtons[0].click();
    }
    await delay(3000);
    
    const nextButtons2 = await page.$$('div:has-text("Next")');
    if (nextButtons2.length > 0) {
      await nextButtons2[0].click();
    }
    await delay(3000);
    
    const captionField = await page.waitForSelector(
      'div[aria-label="Write a caption"]', 
      { timeout: 10000 }
    );
    await captionField.type(caption, { delay: 50 });
    await delay(2000);
    
    const shareButtons = await page.$$('div:has-text("Share")');
    if (shareButtons.length > 0) {
      await shareButtons[0].click();
      console.log("\u2705 Reel shared!");
      
      await page.waitForSelector('svg[aria-label="Your post has been shared"]', { timeout: 60000 })
        .catch(() => console.log("⚠️ Post confirmation not detected"));
    } else {
      console.log("Using keyboard fallback for sharing");
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
    headless: "new", // Set to true for production
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
  
  // Set desktop user agent and viewport
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36');
  await page.setViewport({ width: 1536, height: 730 });

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

      const profileUrl = `${INSTAGRAM_URL}/${username}/reels/`;
      await page.goto(profileUrl, { waitUntil: "networkidle2", timeout: 30000 });
      await delay(5000);

      const links = await page.$$eval("a", as =>
        as.map(a => a.href).filter(href => href.includes("/reel/"))
      );

      if (!links.length) {
        console.log("No reels found");
        await delay(30000);
        continue;
      }

      const randomReel = links[Math.floor(Math.random() * links.length)];
      await page.goto(randomReel, { waitUntil: "networkidle2", timeout: 30000 });
      await delay(5000);

      const videoUrl = await getVideoUrl(page);
      if (!videoUrl) {
        console.log("No video URL found");
        await delay(30000);
        continue;
      }

      console.log("Downloading video from:", videoUrl);
      reelPath = await downloadVideo(videoUrl);
      if (!reelPath) {
        console.log("Download failed");
        await delay(30000);
        continue;
      }

      watermarkedPath = reelPath.replace(".mp4", "_wm.mp4");
      await addWatermark(reelPath, watermarkedPath);
      console.log("Watermark added");

      const caption = `${getRandomCaption()}\n\n${getRandomHashtags()}`;
      console.log("Generated caption");

      const uploadSuccess = await uploadReel(page, watermarkedPath, caption);

      const waitTime = uploadSuccess 
        ? 5 * 60 * 1000
        : 2 * 60 * 1000;
      
      console.log(`\u23F3 Waiting ${waitTime/60000} minutes...`);
      await delay(waitTime);
    } catch (err) {
      console.error("\u274C Main loop error:", err);
      console.log("\u23F3 Retrying in 3 minutes...");
      await delay(180000);
    } finally {
      if (reelPath && fs.existsSync(reelPath)) fs.unlinkSync(reelPath);
      if (watermarkedPath && fs.existsSync(watermarkedPath)) fs.unlinkSync(watermarkedPath);
    }
  }
}

main().catch(err => console.error("\u274C Fatal error:", err));
