# Use official Node image
FROM node:20-alpine

# Install necessary deps for Puppeteer & ffmpeg
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    ffmpeg

# Set working dir
WORKDIR /app

# Copy and install
COPY package*.json ./
RUN npm install

# Copy all code
COPY . .

# Expose port if needed (not mandatory for headless bot)
EXPOSE 3000

# Run your bot
CMD ["node", "index.js"]
