#!/usr/bin/env node

const io = require('socket.io-client');

// Connect to WebSocket service
const socket = io('http://localhost:3003/updates', {
  transports: ['websocket'],
  reconnection: true,
});

console.log('Connecting to WebSocket service at ws://localhost:3003/updates...');

socket.on('connect', () => {
  console.log('✅ Connected to WebSocket service');
  console.log('Socket ID:', socket.id);

  // Test ping
  console.log('\n📡 Sending ping...');
  socket.emit('ping');
});

socket.on('pong', (data) => {
  console.log('✅ Received pong:', data);

  // Subscribe to a job (user will provide jobId)
  const jobId = process.argv[2];

  if (!jobId) {
    console.log('\n⚠️  No jobId provided. Usage: node test-websocket.js <jobId>');
    console.log('To test:');
    console.log('1. Run this script: node test-websocket.js YOUR-JOB-ID');
    console.log('2. In another terminal, create a job: curl -X POST http://localhost:3000/api/processing/start -H "Content-Type: application/json" -d \'{"totalRecords": 100, "recordsPerMinute": 60}\'');
    console.log('\nKeeping connection open for manual testing...');
    return;
  }

  console.log(`\n📝 Subscribing to job: ${jobId}`);
  socket.emit('subscribe', { jobId });
});

socket.on('subscribed', (data) => {
  console.log('✅ Successfully subscribed to job:', data.jobId);
  console.log('Current status:', JSON.stringify(data.currentStatus, null, 2));
  console.log('\n🔄 Listening for updates...\n');
});

socket.on('job.started', (data) => {
  console.log('🚀 JOB STARTED:', JSON.stringify(data, null, 2));
});

socket.on('job.progress', (data) => {
  const progress = data.progress;
  console.log(`📊 Record ${data.recordId} processed: ${progress.processedCount}/${progress.totalRecords} (${progress.percentage}%) - Worker: ${data.workerId}`);
});

socket.on('job.completed', (data) => {
  console.log('\n✅ JOB COMPLETED:', JSON.stringify(data, null, 2));
  console.log('\nDisconnecting...');
  socket.disconnect();
  process.exit(0);
});

socket.on('job.updated', (data) => {
  console.log('🔄 JOB UPDATED:', JSON.stringify(data, null, 2));
});

socket.on('error', (error) => {
  console.error('❌ Error:', error);
});

socket.on('disconnect', () => {
  console.log('❌ Disconnected from WebSocket service');
});

socket.on('connect_error', (error) => {
  console.error('❌ Connection error:', error.message);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down...');
  socket.disconnect();
  process.exit(0);
});

console.log('\nPress Ctrl+C to exit');
