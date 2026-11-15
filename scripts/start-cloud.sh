#!/usr/bin/env bash
set -e

PORT="${PORT:-8080}"
VOICE_PORT="${VOICE_PORT:-8787}"

echo "=== [SPHEREx Sky Cloud Backend] Starting Services ==="
echo "Python API & Gateway listening on port ${PORT}"
echo "Node Voice Server listening on 127.0.0.1:${VOICE_PORT}"

# Start voice server in the background
if [ -d "voice-server" ]; then
  cd voice-server
  VOICE_PORT="${VOICE_PORT}" node server.js &
  VOICE_PID=$!
  cd ..
  echo "Voice server started with PID ${VOICE_PID}"
fi

# Trap signals for graceful shutdown
trap 'kill ${VOICE_PID:-} 2>/dev/null || true' SIGTERM SIGINT EXIT

# Start Python unified server in foreground
export VOICE_TARGET="http://127.0.0.1:${VOICE_PORT}"
exec python3 server.py "${PORT}"
