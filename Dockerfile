# Use Node.js base image with Chrome dependencies
FROM node:20-slim

# Set working directory
WORKDIR /app

# Install system dependencies: FFmpeg, fonts, and Chrome dependencies
RUN apt-get update && apt-get install -y \
  ffmpeg \
  wget \
  unzip \
  fonts-noto-color-emoji \
  libx11-xcb1 libxcomposite1 libxdamage1 libxrandr2 \
  libgtk-3-0 libnss3 libasound2 libxshmfence1 libgbm1 \
  && rm -rf /var/lib/apt/lists/*

# Install BebasNeue font manually
RUN mkdir -p /usr/share/fonts/truetype/bebas && \
  wget -q https://github.com/dharmatype/Bebas-Neue/releases/download/v2.000/BebasNeue-Regular.ttf -O /usr/share/fonts/truetype/bebas/BebasNeue-Regular.ttf && \
  fc-cache -fv

# Copy your project files
COPY . .

# Install Node dependencies
RUN npm install

# Set environment variables for Puppeteer
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# Use Puppeteer's recommended Chromium path (assuming Puppeteer installs Chrome correctly)
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome

# Default command
CMD ["node", "index.js"]
