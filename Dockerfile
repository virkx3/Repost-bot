FROM node:18-slim

ENV TZ=Asia/Kolkata

# Install dependencies, ffmpeg, and fonts
RUN apt-get update && apt-get install -y \
  wget ca-certificates fonts-liberation libappindicator3-1 libasound2 libatk-bridge2.0-0 \
  libatk1.0-0 libcups2 libdbus-1-3 libdrm2 libx11-xcb1 libxcomposite1 libxdamage1 \
  libxrandr2 libgbm1 libnspr4 libnss3 libxss1 libgtk-3-0 xdg-utils \
  ffmpeg fonts-dejavu-core \
  --no-install-recommends && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY . .

RUN npm install

CMD ["npm", "start"]
