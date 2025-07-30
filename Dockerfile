# Use the official Node.js image as a base
FROM node:16-slim

# Set environment variable for Chromium (for Puppeteer)
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Install dependencies (ffmpeg, fonts, and Chromium for Puppeteer)
RUN apt-get update && apt-get install -y \
    ffmpeg \
    chromium \
    libnss3 \
    libgconf-2-4 \
    libasound2 \
    libatk1.0-0 \
    libcups2 \
    fonts-liberation \
    libappindicator3-1 \
    libx11-xcb1 \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

# Set working directory inside the container
WORKDIR /app

# Copy package.json and package-lock.json (if available)
COPY package*.json ./

# Install Node.js dependencies
RUN npm install --production

# Copy the entire script to the container
COPY . .

# Expose the port (if needed for any service listening, can be left out if not)
EXPOSE 8080

# Run the script when the container starts
CMD ["node", "your-script.js"]
