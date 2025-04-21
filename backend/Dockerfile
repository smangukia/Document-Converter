FROM node:18-slim

# Install dependencies for Puppeteer
RUN apt-get update && apt-get install -y \
    fonts-liberation \
    gconf-service \
    libappindicator1 \
    libasound2 \
    libatk1.0-0 \
    libcairo2 \
    libcups2 \
    libfontconfig1 \
    libgbm-dev \
    libgdk-pixbuf2.0-0 \
    libgtk-3-0 \
    libicu-dev \
    libjpeg-dev \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libpng-dev \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    xdg-utils \
    wget \
    chromium \
    ca-certificates \
    fonts-freefont-ttf \
    fontconfig \
    dbus \
    xvfb \
    && rm -rf /var/lib/apt/lists/*

# Set environment variables for Puppeteer to use the installed Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
# Add these environment variables to fix GPU issues
ENV PUPPETEER_DISABLE_GPU=true
ENV CHROMIUM_FLAGS="--disable-gpu --no-sandbox --disable-dev-shm-usage --disable-setuid-sandbox --no-zygote --single-process --disable-accelerated-2d-canvas --disable-software-rasterizer --disable-3d-apis --disable-webgl"
# Add Xvfb for headless rendering
ENV DISPLAY=:99

# Create app directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy the rest of the application
COPY . .

# Remove any local .env files to prevent them from overriding runtime environment variables
RUN rm -f .env .env.*

# Build the application
RUN npm run build

# Create directories for uploads and outputs
RUN mkdir -p uploads outputs data

# Create a startup script that runs Xvfb before the application
RUN echo '#!/bin/bash\nXvfb :99 -screen 0 1024x768x16 -ac &\nexec "$@"' > /entrypoint.sh && \
    chmod +x /entrypoint.sh

# Expose the port
EXPOSE 3001

# Use the entrypoint script
ENTRYPOINT ["/entrypoint.sh"]

# Start the application
CMD ["npm", "start"]
