FROM mcr.microsoft.com/playwright:v1.59.1-jammy

RUN apt-get update && apt-get install -y xvfb && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .

# xvfb provides virtual display for headed Chromium (extensions need it)
ENTRYPOINT ["sh", "-c", "Xvfb :99 -screen 0 1280x720x24 &> /dev/null & sleep 1 && DISPLAY=:99 npx playwright test"]
