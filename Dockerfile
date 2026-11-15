FROM python:3.11-slim

# Install Node.js 20 & runtime utilities
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python requirements
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install Node dependencies for voice server
COPY voice-server/package*.json ./voice-server/
RUN cd voice-server && npm install --omit=dev

# Copy application files
COPY . .

# Ensure startup script is executable
RUN chmod +x ./scripts/start-cloud.sh

ENV PORT=8080
ENV HOST=0.0.0.0
ENV NODE_ENV=production

EXPOSE 8080

CMD ["./scripts/start-cloud.sh"]
