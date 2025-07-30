# Use the official Node.js image as a base
FROM node:16-slim

# Set environment variable for Puppeteer (Chromium path)
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Install dependencies
RUN apt-get update -y && apt-get upgrade -y && apt-get install -y \
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
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Puppeteer dependencies for Chromium
RUN apt-get update && apt-get install -y \
    libxss1 \
    libappindicator3-1 \
    libindicator7 \
    && rm -rf /var/lib/apt/lists/*

# Install necessary dependencies for Puppeteer
RUN apt-get update && apt-get install -y \
    wget \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json (if available)
COPY package*.json ./

# Install node dependencies
RUN npm install --production

# Copy the rest of the application
COPY . .

# Expose the port (if needed)
EXPOSE 8080

# Run the script when the container starts
CMD ["node", "index.js"]
