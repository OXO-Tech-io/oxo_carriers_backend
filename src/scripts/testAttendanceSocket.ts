import dotenv from 'dotenv';
import path from 'path';
import { io } from 'socket.io-client';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

/**
 * Stands in for the (not-yet-built) local-PC agent: connects to the
 * attendance WebSocket gateway as a given device id and prints every
 * in/out/break event pushed to it, so the gateway can be verified end-to-end
 * without a real agent. See src/modules/attendance/attendance.gateway.ts.
 *
 * Usage: pnpm run test:attendance-socket [deviceId]
 * Then, with that deviceId set on an employee (Update User / device_id
 * column), clock in/out or start/end a break for that employee from the
 * frontend - the event should print here within a second.
 */

const deviceId = process.argv[2] || 'TEST-DEVICE-1';
const port = process.env.PORT || '5000';
const url = `http://localhost:${port}/attendance`;

console.log('🔌 Connecting to attendance WebSocket gateway...');
console.log(`   URL:      ${url}`);
console.log(`   deviceId: ${deviceId}\n`);

const socket = io(url, {
  query: { deviceId },
  reconnection: true,
  reconnectionDelay: 2000,
});

socket.on('connect', () => {
  console.log(`✅ Connected (socket id ${socket.id}). Waiting for attendance events...`);
  console.log(`   Set device_id="${deviceId}" on an employee, then clock in/out or start/end a break for them.\n`);
});

socket.on('attendance:event', (event: { type: string; employeeId: string; occurredAt: string }) => {
  console.log(`📩 [${event.occurredAt}] ${event.type} — employee ${event.employeeId}`);
});

socket.on('disconnect', (reason: string) => {
  console.log(`⚠️  Disconnected (${reason})`);
});

socket.on('connect_error', (error: Error) => {
  console.error(`❌ Connection error: ${error.message}`);
});

process.on('SIGINT', () => {
  console.log('\nClosing connection...');
  socket.close();
  process.exit(0);
});
