# Base image
FROM node:18-alpine AS base

# Build argument for service name
ARG SERVICE_NAME

# Create app directory
WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./
COPY nest-cli.json ./
COPY tsconfig*.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Development stage
FROM base AS development
RUN npm ci
COPY . .

# Build stage
FROM development AS build
ARG SERVICE_NAME
RUN npm run build ${SERVICE_NAME}

# Production stage
FROM node:18-alpine AS production
ARG SERVICE_NAME
ENV SERVICE_NAME=${SERVICE_NAME}

WORKDIR /usr/src/app

# Copy package files and install production dependencies
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Copy built application
COPY --from=build /usr/src/app/dist ./dist

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nestjs -u 1001 && \
    chown -R nestjs:nodejs /usr/src/app

USER nestjs

# Expose port (will be overridden by docker-compose)
EXPOSE 3000

# Start the application
CMD node dist/apps/${SERVICE_NAME}/main.js