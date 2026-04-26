FROM node:24-bookworm-slim

# Install dependencies required to build better-sqlite3
RUN apt-get update && apt-get install -y python3 build-essential && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Node dependencies
COPY package*.json ./
RUN npm install

# Copy application source
COPY . .

# Build Vite frontend and compile TS backend
RUN npm run build

# Default environment to production
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Start production server
CMD ["npm", "start"]
