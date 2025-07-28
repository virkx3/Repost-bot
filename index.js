const puppeteer = require("puppeteer");
const fs = require("fs");
const axios = require("axios");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const path = require("path");

const VIDEO_DIR = "downloads";
if (!fs.existsSync(VIDEO_DIR)) fs.mkdirSync(VIDEO_DIR);

const WATERMARK = "ig/your_username";
const INSTAGRAM_URL = "https://www.instagram.com";
const USERNAMES_URL = "https://raw.githubusercontent.com/virkx3/otp/refs/heads/main/usernames.txt";
const delay = (ms) => new Promise((res) => setTimeout(res, ms));

ffmpeg.setFfmpegPath(ffmpegPath);

// ✅ Proxy credentials
const proxy = {
  ip: "isp.decodo.com",
  port: "10001",
  username: "spg1c4utf1",
  password: "9VUm5exYtkh~iS8h6y"
};

async function getUsernames() {
  const res = await axios.get(USERNAMES_URL);
  return res.data.split("\n").map(line => line.trim()).filter(Boolean);
}

async function setupBrowser(proxy) {
  const proxyUrl = `http://${proxy.ip}:${proxy.port}`;
  const args = [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    `--proxy-server=${proxyUrl}`
  ];

  const browser = await puppeteer.launch({ headless: true, args });
  const context = await browser.createIncognitoBrowserContext();
  const page = await context.newPage();

  // 🔐 Set proxy authentication
  await page.authenticate({
    username: proxy.username,
    password: proxy.password
  });

  // 🖥 Set User-Agent
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36"
  );
  await page.setViewport({ width: 1366, height: 768 });

  return { browser, page };
}

async function downloadReel(page, username) {
  try {
    const profileUrl = `${INSTAGRAM_URL}/${username}/reels/`;
    await page.goto(profileUrl, { waitUntil: "networkidle2", timeout: 60000 });
    await delay(3000);

    const links = await page.$$eval("a", as => as.map(a => a.href).filter(href => href.includes("/reel/")));
    if (!links.length) return null;

    const randomReel = links[Math.floor(Math.random() * links.length)];
    await page.goto(randomReel, { waitUntil: "networkidle2", timeout: 60000 });
    await delay(3000);

    await page.waitForSelector("video", { timeout: 10000 });
    const videoUrl = await page.$eval("video", v => v.src);

    if (!videoUrl || videoUrl.startsWith("blob:")) {
      console.log("❌ Skipping blob video");
      return null;
    }

    const videoData = await axios.get(videoUrl, {
      responseType: "arraybuffer",
      timeout: 60000
    });

    const fileName = `reel_${Date.now()}.mp4`;
    const filePath = path.join(VIDEO_DIR, fileName);
    fs.writeFileSync(filePath, videoData.data);

    console.log(`✅ Downloaded: ${fileName}`);
    return filePath;
  } catch (err) {
    console.error("❌ Download error:", err.message);
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
          boxborderw: 5
        }
      })
      .output(outputPath)
      .on("end", () => resolve(outputPath))
      .on("error", reject)
      .run();
  });
}

async function main() {
  const usernames = await getUsernames();
  const { browser, page } = await setupBrowser(proxy);

  for (const username of usernames) {
    console.log("🎯 Target:", username);
    const videoPath = await downloadReel(page, username);
    if (!videoPath) continue;

    const watermarkedPath = videoPath.replace(".mp4", "_wm.mp4");
    await addWatermark(videoPath, watermarkedPath);

    // Add your upload logic here if needed

    fs.unlinkSync(videoPath);
    fs.unlinkSync(watermarkedPath);
    await delay(30000);
  }

  await browser.close();
}

main();
