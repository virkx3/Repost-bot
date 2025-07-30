# Use official Node image with Chromium dependencies
FROM node:20-slim

# Install system dependencies for Puppeteer + ffmpeg + fonts + sharp
RUN apt-get update && \
    apt-get install -y wget ca-certificates fonts-dejavu \
    ffmpeg chromium chromium-driver libnss3 libatk-bridge2.0-0 libgtk-3-0 libasound2 && \
    rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files & install deps first for layer caching
COPY package.json ./
RUN npm install

# Copy the rest of your app
COPY . .

# Expose port if needed (Railway handles this by default)
EXPOSE 8080

# Start the bot
CMD ["npm", "start"]
