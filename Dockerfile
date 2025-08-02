FROM node:18

# Set timezone and environment variables
ENV TZ=Asia/Kolkata
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome

# Install dependencies with Chrome repository
RUN apt-get update && \
    apt-get install -y \
    wget gnupg ca-certificates \
    ffmpeg \
    libfreetype6 \
    libfontconfig1 \
    fonts-noto-color-emoji \
    xvfb && \
    # Add Google Chrome repository
    wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - && \
    echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google.list && \
    apt-get update && \
    apt-get install -y google-chrome-stable && \
    # Cleanup
    apt-get purge --auto-remove -y wget gnupg && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Install Node.js dependencies first for caching
COPY package*.json ./
RUN npm install

# Copy application files
COPY . .

# Start Xvfb and run the application
CMD ["sh", "-c", "Xvfb :99 -screen 0 1024x768x16 & export DISPLAY=:99 && node index.js"]
