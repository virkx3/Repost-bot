# Use official Node base image
FROM node:20-slim

# Install Chromium for puppeteer-core
RUN apt-get update && apt-get install -y chromium

# Set working directory
WORKDIR /app

# Copy dependency files first for build cache
COPY package*.json ./

# Install exact production dependencies
RUN npm ci --omit=dev

# Copy your whole codebase
COPY . .

# Expose your bot entrypoint
CMD ["npm", "start"]
