FROM node:20-slim

# Build tools für native Module
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# SECURITY FIX: run as non-root user — prevents container escape privilege escalation
RUN groupadd -r botuser && useradd -r -g botuser botuser \
    && chown -R botuser:botuser /app
USER botuser

CMD ["sh", "-c", "node prestart.js && node dist/index.js"]
