# Use official Node image
FROM node:18-bullseye

# Install dependencies with cleanup
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
    fonts-dejavu-core \
    fonts-freefont-ttf \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /usr/src/app

# Copy package files
COPY package.json ./

# Install sharp with specific vips version first
RUN npm install --ignore-scripts sharp@^0.33.4

# Install other dependencies
RUN npm install --only=production

# Copy application files
COPY . .

# Create directories
RUN mkdir -p /usr/src/app/downloads

# Set environment variables
ENV DISPLAY=:99
ENV TZ=Asia/Kolkata
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Run the application
CMD [ "node", "index.js" ]
