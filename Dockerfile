FROM mcr.microsoft.com/playwright:v1.59.1-jammy

RUN apt-get update && apt-get install -y xvfb && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .

ENV DISPLAY=:99

# xvfb virtual display + test run
CMD Xvfb :99 -screen 0 1280x720x24 &> /dev/null & \
    sleep 1 && \
    npx playwright test
