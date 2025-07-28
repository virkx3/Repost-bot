# Use Node.js base image with Chromium dependencies
FROM node:18-slim

# Install necessary tools: ffmpeg + Chromium dependencies
RUN apt-get update && apt-get install -y \
    ffmpeg \
    wget \
    fonts-liberation \
    libappindicator3-1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    --no-install-recommends \
 && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package.json and install dependencies
COPY package.json ./
RUN npm install

# Copy bot code and required assets
COPY . .

# Puppeteer fix for headless environments
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Start the bot
CMD ["node", "index.js"]
