FROM node:18

# Install FFmpeg and required libraries for fonts
RUN apt-get update && \
    apt-get install -y \
    ffmpeg \
    libfreetype6 \
    libfontconfig1 \
    && apt-get clean

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

CMD ["node", "index.js"]
