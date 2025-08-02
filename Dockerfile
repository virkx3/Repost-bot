FROM node:18-slim

# Timezone set karo
ENV TZ=Asia/Kolkata

# System update aur required packages install karo
RUN apt-get update && apt-get install -y \
  wget ca-certificates fonts-liberation libappindicator3-1 libasound2 libatk-bridge2.0-0 \
  libatk1.0-0 libcups2 libdbus-1-3 libdrm2 libx11-xcb1 libxcomposite1 libxdamage1 \
  libxrandr2 libgbm1 libnspr4 libnss3 libxss1 libgtk-3-0 xdg-utils ffmpeg \
  fonts-noto-color-emoji fonts-noto-cjk fonts-noto-mono fonts-noto-core \
  fonts-noto-unhinted fonts-noto-ui-core fonts-noto-serif fonts-noto-sans \
  --no-install-recommends && apt-get clean && rm -rf /var/lib/apt/lists/*

# Working directory set karo
WORKDIR /app

# Project files copy karo
COPY . .

# Dependencies install karo
RUN npm install

# Node app start karo
CMD ["npm", "start"]
