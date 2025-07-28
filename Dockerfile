# Use the official Node.js image with Debian Bullseye
FROM node:18.18.2-bullseye

# Install required system dependencies
RUN apt-get update && \
    apt-get install -y \
    gconf-service \
    libasound2 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgcc1 \
    libgconf-2-4 \
    libgdk-pixbuf2.0-0 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
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
    ca-certificates \
    fonts-liberation \
    libappindicator1 \
    libnss3 \
    lsb-release \
    xdg-utils \
    wget \
    ffmpeg \
    xvfb

# Install latest Chromium package (matches Puppeteer's expected version)
RUN apt-get install -y chromium

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
