FROM node:24-alpine
RUN apk add --no-cache python3 py3-pip openssl tzdata
WORKDIR /app
COPY src/package*.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY src/ ./
RUN python3 -m venv work/fints-venv && work/fints-venv/bin/pip install --no-cache-dir fints==5.0.1
COPY start.mjs /app/start.mjs
ENV PORT=8099 FINANZFLIPS_DATA_DIR=/data FINANZFLIPS_HA_INGRESS=1 TZ=Europe/Berlin
CMD ["node", "start.mjs"]
