# OPTIO Assignment - Data Processing System

## Project Overview

Microservices system for controlled-rate data processing using Redis scheduler, RabbitMQ messaging, Elasticsearch storage, and real-time WebSocket updates.

## Architecture

- **api-gateway**: REST API, parameter management (X, Y controls)
- **scheduler-service**: Redis-based scheduling, rate limiting (Y records/minute)
- **worker-service**: RabbitMQ consumers, Elasticsearch writes (horizontally scalable)
- **websocket-service**: Real-time UI updates via WebSocket

## Tech Stack

- NestJS (TypeScript)
- Angular (frontend)
- Redis (scheduler)
- RabbitMQ (messaging)
- Elasticsearch (storage)
- Docker & Docker Compose

## Key Requirements

1. Process X records at Y records/minute rate
2. X and Y must be dynamically controllable from UI
3. System must handle high load without UI blocking
4. Resilient to service restarts/failures
5. Multi-instance worker support
6. WebSocket real-time updates
7. Max 200ms response time for any service
8. Single Responsibility Principle throughout

## Data Flow

User Input → API Gateway → Redis Scheduler → RabbitMQ → Worker(s) → Elasticsearch → WebSocket → Angular UI

## Important Notes

- Focus on code quality and SRP
- All services must recover gracefully from infrastructure failures
- UI state must persist across page refreshes
- Docker Compose for entire stack
- README with setup/testing instructions
