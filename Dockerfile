# Use a modern lightweight Node base
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy both package.json and lockfile
COPY package*.json ./

# Install exactly as lockfile says (clean CI install)
RUN npm ci --omit=dev

# Copy your full codebase
COPY . .

# If Railway needs Chromium for Puppeteer
RUN apk add --no-cache chromium

# Set environment for Puppeteer to find Chromium
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Run your bot
CMD ["node", "index.js"]
