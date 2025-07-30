# Use official Node
FROM node:20-slim

# Install Chromium + FFmpeg + Fonts
RUN apt-get update && \
    apt-get install -y chromium ffmpeg fonts-dejavu-core && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy manifests first
COPY package.json package-lock.json ./

# Install production deps exactly as lockfile
RUN npm ci --omit=dev

# Copy all code
COPY . .

# Chromium path for puppeteer-core
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

CMD ["node", "index.js"]
