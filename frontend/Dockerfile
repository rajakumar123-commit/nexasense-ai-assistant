# ============================================================
# Frontend Dockerfile
# NexaSense AI Assistant
# React/Vite → Nginx multi-stage build
# ============================================================

# ---------- Stage 1: Build React App ----------
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files first for layer cache
COPY package*.json ./

# Install all dependencies (including devDeps needed for Vite build)
RUN npm install --no-audit --no-fund

# Copy source files
COPY . .

# Build the production bundle
RUN npm run build


# ---------- Stage 2: Serve with Nginx ----------
FROM nginx:alpine

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Copy our custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built React app from stage 1
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
