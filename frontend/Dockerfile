# ============================================================
# Frontend Dockerfile
# NexaSense AI Assistant
# ============================================================

# ---------- Stage 1: Build React App ----------
FROM node:20-alpine AS builder

WORKDIR /app

# ✅ ADD THIS (IMPORTANT)
ARG VITE_RAZORPAY_KEY_ID
ENV VITE_RAZORPAY_KEY_ID=$VITE_RAZORPAY_KEY_ID

# Copy package files first
COPY package*.json ./

RUN npm install --no-audit --no-fund

# ✅ Cache Buster: Force re-copy on code changes without breaking npm install cache
# Update this string to force a rebuild of the React bundle
ARG CACHEBUST=v3.1_force_rebuild

# Copy source files
COPY . .

# Build with env injected
RUN npm run build


# ---------- Stage 2: Serve with Nginx ----------
FROM nginx:alpine

RUN rm /etc/nginx/conf.d/default.conf

COPY nginx.conf /etc/nginx/conf.d/default.conf

COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]