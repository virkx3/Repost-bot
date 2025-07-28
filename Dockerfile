# Use the official Node.js image with the same version you're using locally
FROM node:18.18.2-slim

# Install required system dependencies for Puppeteer and FFmpeg
RUN apt-get update && \
    apt-get install -y \
    wget \
    gnupg \
    git \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgcc1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    lsb-release \
    xdg-utils \
    ffmpeg \
    xvfb \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json first
COPY package*.json ./

# Install Node.js dependencies
RUN npm install --force

# Copy the rest of the application
COPY . .

# Command to run the application
CMD ["node", "index.js"]
