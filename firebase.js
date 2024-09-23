// Import firebase-admin module
const admin = require('firebase-admin');

// Path to your service account key JSON file
const serviceAccount = require('./config/nikshoo-firebase-adminsdk-jjn8z-e5c5c8c893.json');

// Initialize the app with service account and database URL
// admin.initializeApp({
//   credential: admin.credential.cert(serviceAccount),
//   databaseURL: "https://nikshoo-default-rtdb.firebaseio.com/"  // Using Realtime Database URL
// });

// const db = admin.database();  // Realtime Database instance

// module.exports = { admin, db };

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: 'gs://nikshoo.appspot.com',
});

const db = admin.firestore();
const bucket = admin.storage().bucket();