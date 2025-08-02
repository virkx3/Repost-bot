FROM node:18-slim

ENV TZ=Asia/Kolkata

# Install dependencies and fonts (exclude ffmpeg)
RUN apt-get update && apt-get install -y \
  wget curl unzip ca-certificates \
  fonts-noto-color-emoji fonts-noto-cjk fonts-noto-mono fonts-noto-core \
  fonts-noto-unhinted fonts-noto-ui-core fonts-noto \
  libglib2.0-0 libnss3 libatk-bridge2.0-0 libx11-xcb1 libxcomposite1 libxdamage1 \
  libxrandr2 libgbm1 libgtk-3-0 xdg-utils libasound2 libxss1 \
  --no-install-recommends && \
  apt-get clean && rm -rf /var/lib/apt/lists/*

# Install FFmpeg 6.1 static build
RUN mkdir -p /opt/ffmpeg && \
  curl -L https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-amd64-static.tar.xz | tar -xJ --strip-components=1 -C /opt/ffmpeg && \
  ln -s /opt/ffmpeg/ffmpeg /usr/local/bin/ffmpeg

# Set working directory
WORKDIR /app

# Copy project files
COPY . .

# Install Node dependencies
RUN npm install

# Start app
CMD ["npm", "start"]
