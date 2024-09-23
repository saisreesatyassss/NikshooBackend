// server.js
const express = require('express');
const admin = require('firebase-admin');
const multer = require('multer'); // Middleware for handling multipart/form-data
require('dotenv').config();
console.log('FIREBASE_PRIVATE_KEY:', process.env.FIREBASE_PRIVATE_KEY); // Debug

// // Path to your service account key JSON file
// const serviceAccount = require('./config/nikshoo-firebase-adminsdk-jjn8z-e5c5c8c893.json');


// // Initialize the Firebase Admin SDK
// admin.initializeApp({
//   credential: admin.credential.cert(serviceAccount),
//   storageBucket: 'gs://nikshoo.appspot.com', // Your storage bucket
//   databaseURL: "https://nikshoo-default-rtdb.firebaseio.com/"  // Using Realtime Database URL
// });

// Initialize the Firebase Admin SDK using environment variables
admin.initializeApp({
  credential: admin.credential.cert({
    type: process.env.FIREBASE_TYPE,
    project_id: process.env.FIREBASE_PROJECT_ID,
    private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
    private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'), // Replacing the escaped newlines
    client_email: process.env.FIREBASE_CLIENT_EMAIL,
    client_id: process.env.FIREBASE_CLIENT_ID,
    auth_uri: process.env.FIREBASE_AUTH_URI,
    token_uri: process.env.FIREBASE_TOKEN_URI,
    auth_provider_x509_cert_url: process.env.FIREBASE_AUTH_PROVIDER_CERT_URL,
    client_x509_cert_url: process.env.FIREBASE_CLIENT_CERT_URL
  }),
  storageBucket: 'gs://nikshoo.appspot.com', // Your storage bucket
  databaseURL: "https://nikshoo-default-rtdb.firebaseio.com/"  // Using Realtime Database URL
});
const db = admin.database(); // Realtime Database instance
const bucket = admin.storage().bucket(); // Storage bucket instance

const app = express();
const PORT = process.env.PORT || 3000; // Set the port to 3000 or use an environment variable

app.use(express.json());


app.get('/', (req, res) => {
  res.send('Auth endpoint is working  nikshoo backend');
});


// Endpoint to create a user
app.post('/createUser', async (req, res) => {
  const { email, password } = req.body;

  try {
    // Create user in Firebase Authentication
    const userRecord = await admin.auth().createUser({
      email: email,
      password: password,
    });

    // Add user details to Realtime Database
    await db.ref(`users/${userRecord.uid}`).set({
      email: email,
      isAdmin: false, // Set default role as non-admin
      createdAt: admin.database.ServerValue.TIMESTAMP, // Use ServerValue for timestamp
    });

    res.status(201).send({ message: 'User created successfully', uid: userRecord.uid });
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

// Multer setup for image upload handling
const upload = multer({ storage: multer.memoryStorage() });
const { v4: uuidv4 } = require('uuid'); // To generate unique IDs for file names

// Endpoint for admin to upload images
app.post('/admin/uploadImage', upload.single('image'), async (req, res) => {
  const { uid } = req.body; // Get user ID for admin verification
  const file = req.file; // Image file

  try {
    // Check if the user is an admin
    const userSnapshot = await db.ref(`users/${uid}`).once('value');
    if (userSnapshot.exists() && userSnapshot.val().isAdmin) {
      // Create a unique filename using uuid
      const uniqueFileName = `${uuidv4()}-${file.originalname}`;
      const blob = bucket.file(uniqueFileName);
      const blobStream = blob.createWriteStream({
        metadata: {
          contentType: file.mimetype,
        },
      });

     blobStream.on('finish', async () => {
      // Make the file public
      await blob.makePublic();

      res.status(200).send({
        message: 'Image uploaded successfully',
        imageUrl: `https://storage.googleapis.com/${bucket.name}/${uniqueFileName}`
      });
    });


      blobStream.end(file.buffer);
    } else {
      res.status(403).send({ error: 'User is not authorized to upload images' });
    }
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});


// Endpoint for admin to upload multiple images
app.post('/admin/uploadImages', upload.array('images', 10), async (req, res) => { // Max 10 images can be uploaded
  const { uid } = req.body; // Get user ID for admin verification
  const files = req.files; // Array of image files

  try {
    // Check if the user is an admin
    const userSnapshot = await db.ref(`users/${uid}`).once('value');
    if (userSnapshot.exists() && userSnapshot.val().isAdmin) {
      let imageUrls = [];

      // Loop through each file and upload it
      for (const file of files) {
        // Create a unique filename using uuid
        const uniqueFileName = `${uuidv4()}-${file.originalname}`;
        const blob = bucket.file(uniqueFileName);
        const blobStream = blob.createWriteStream({
          metadata: {
            contentType: file.mimetype,
          },
        });

        // Use promises to handle each file upload
        await new Promise((resolve, reject) => {
          blobStream.on('finish', async () => {
            try {
              // Make the file public
              await blob.makePublic();
              const imageUrl = `https://storage.googleapis.com/${bucket.name}/${uniqueFileName}`;
              imageUrls.push(imageUrl); // Add the image URL to the array
              resolve();
            } catch (error) {
              reject(error);
            }
          });

          blobStream.on('error', (error) => {
            reject(error);
          });

          blobStream.end(file.buffer);
        });
      }

      res.status(200).send({
        message: 'Images uploaded successfully',
        imageUrls: imageUrls, // Return all the uploaded image URLs
      });
    } else {
      res.status(403).send({ error: 'User is not authorized to upload images' });
    }
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});



// Endpoint to get all images
app.get('/admin/images', async (req, res) => {
  try {
    const [files] = await bucket.getFiles(); // Get all files in the bucket
    const imageUrls = files.map(file => `https://storage.googleapis.com/${bucket.name}/${file.name}`);
    res.status(200).send(imageUrls);
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

// Endpoint to delete an image
app.delete('/admin/deleteImage', async (req, res) => {
  const { imageName } = req.body;  

  try {
    await bucket.file(imageName).delete();  
    res.status(200).send({ message: 'Image deleted successfully' });
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

// Endpoint to edit an image (update metadata)
app.put('/admin/editImage', async (req, res) => {
  const { imageName, newName } = req.body; // Name of the image to edit and new name

  try {
    const file = bucket.file(imageName);
    await file.copy(bucket.file(newName)); // Copy to new name
    await file.delete(); // Delete old file
    res.status(200).send({ message: 'Image renamed successfully' });
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

// Start the server on the specified port
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
