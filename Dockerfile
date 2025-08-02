FROM node:18-slim

# Set timezone
ENV TZ=Asia/Kolkata

# Install required packages
RUN apt-get update && apt-get install -y \
  wget curl xz-utils ca-certificates \
  fonts-liberation libappindicator3-1 libasound2 libatk-bridge2.0-0 \
  libatk1.0-0 libcups2 libdbus-1-3 libdrm2 libx11-xcb1 libxcomposite1 libxdamage1 \
  libxrandr2 libgbm1 libnspr4 libnss3 libxss1 libgtk-3-0 xdg-utils \
  fonts-noto-color-emoji fonts-noto-cjk fonts-noto-mono fonts-noto-core \
  fonts-noto-unhinted fonts-noto-ui-core fonts-noto \
  --no-install-recommends && apt-get clean && rm -rf /var/lib/apt/lists/*

# Install FFmpeg 6.x static build
RUN mkdir -p /opt/ffmpeg && \
  curl -L https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz | \
  tar -xJ --strip-components=1 -C /opt/ffmpeg && \
  ln -s /opt/ffmpeg/ffmpeg /usr/local/bin/ffmpeg && \
  ln -s /opt/ffmpeg/ffprobe /usr/local/bin/ffprobe

# Set working directory
WORKDIR /app

# Copy project files
COPY . .

# Install Node.js dependencies
RUN npm install

# Start the bot
CMD ["npm", "start"]
