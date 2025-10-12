#!/bin/bash

echo "==================================="
echo "WebSocket Service End-to-End Test"
echo "==================================="
echo ""

# Step 1: Create a job
echo "📝 Creating a new job with 25 records..."
JOB_RESPONSE=$(curl -s -X POST http://localhost:3000/api/processing/start \
  -H "Content-Type: application/json" \
  -d '{"totalRecords": 1000, "recordsPerMinute": 120}')

JOB_ID=$(echo $JOB_RESPONSE | grep -o '"jobId":"[^"]*"' | cut -d'"' -f4)

echo "✅ Job created: $JOB_ID"
echo ""

# Step 2: Connect to WebSocket and subscribe
echo "🔌 Starting WebSocket client..."
echo ""

# Run the WebSocket client with the job ID
node test-websocket.js $JOB_ID
