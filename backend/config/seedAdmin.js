const bcrypt = require('bcryptjs');
const Admin = require('../models/Admin');

async function seedAdmin() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME || 'Hotel Administrator';

  if (!email || !password || password.length < 12) {
    throw new Error(
      'Set ADMIN_EMAIL and an ADMIN_PASSWORD of at least 12 characters in .env'
    );
  }

  const existingAdmin = await Admin.findOne({ email });

  if (existingAdmin) {
    console.log('Admin account already exists:', email);
    return;
  }

  const hashedPassword = await bcrypt.hash(password, 12);

  await Admin.create({
    name,
    email,
    password: hashedPassword,
    role: 'admin',
    isActive: true
  });

  console.log('Initial admin account created:', email);
}

module.exports = seedAdmin;
