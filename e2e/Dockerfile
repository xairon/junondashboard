FROM mcr.microsoft.com/playwright:v1.58.2-noble

WORKDIR /e2e
COPY package.json ./
RUN npm install
COPY playwright.config.ts ./
COPY tests/ ./tests/
COPY convert-videos-to-gif.sh ./

RUN apt-get update && apt-get install -y --no-install-recommends curl ffmpeg && rm -rf /var/lib/apt/lists/*

CMD sh -c 'echo "Waiting for app..." && until curl -sf ${BASE_URL:-http://nginx:80}/ > /dev/null 2>&1; do sleep 2; done && echo "App ready" && npx playwright test'
