// Script to create initial admin user in Firestore
// Run with: node scripts/create-admin.js

const admin = require('firebase-admin');

// Initialize Firebase Admin
const serviceAccount = require('../config/serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'vistaq-backend'
});

const db = admin.firestore();

async function createAdminUser() {
  const uid = 'M2TozMffVma0P5EltEfl52ymays1';
  const email = 'jeremyadmin@vistaq.com';

  const userData = {
    email: email,
    name: 'Jeremy Admin',
    role: 'admin',
    status: 'active',
    groupId: '',
    groupName: '',
    agentId: '',
    agency: '',
    location: '',
    totalPoints: 0,
    totalProspects: 0,
    totalAppointments: 0,
    totalSales: 0,
    totalACE: 0,
    currentBadge: 'Rookie',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  };

  try {
    await db.collection('users').doc(uid).set(userData);
    console.log('✅ Admin user created successfully!');
    console.log('UID:', uid);
    console.log('Email:', email);
    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating admin user:', error);
    process.exit(1);
  }
}

createAdminUser();
