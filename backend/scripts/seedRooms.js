require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Room = require('../models/Room');

const rooms = [
  ...[101, 102, 103, 106, 107, 115].map(roomNumber => ({
    roomNumber,
    roomType: 'Non-AC',
    name: `Non-AC Room ${roomNumber}`,
    description: 'Comfortable Non-AC accommodation',
    price: 1000
  })),

  ...[104, 105, 108, 109, 110, 111, 112, 113, 114, 116, 117].map(roomNumber => ({
    roomNumber,
    roomType: 'AC',
    name: `AC Room ${roomNumber}`,
    description: 'Comfortable air-conditioned accommodation',
    price: 1200
  }))
];

async function seedRooms() {
  try {
    await connectDB();

    for (const room of rooms) {
      await Room.updateOne(
        { roomNumber: room.roomNumber },
        { $setOnInsert: room },
        { upsert: true, setDefaultsOnInsert: true }
      );
    }

    const savedRooms = await Room.find()
      .sort({ roomNumber: 1 })
      .lean();

    console.log('\n========== ROOM DATABASE ==========');
    console.table(savedRooms.map(room => ({
      roomNumber: room.roomNumber,
      roomType: room.roomType,
      price: room.price,
      status: room.status,
      active: room.isActive
    })));

    console.log(`\nTotal rooms in database: ${savedRooms.length}`);

  } catch (error) {
    console.error('Room seeding failed:', error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

seedRooms();
