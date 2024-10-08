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
    private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
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


// Route to check Firebase connectivity
app.get('/checkFirebase', async (req, res) => {
  try {
    // Check Firebase Authentication by listing users
    const listUsersResult = await admin.auth().listUsers(1);
    console.log('Successfully fetched user data:', listUsersResult.users[0].uid);

    // Check Firebase Realtime Database by reading some test data
    const snapshot = await db.ref('/test').once('value');
    const testData = snapshot.val();

    if (!testData) {
      // Write test data to the database if not present
      await db.ref('/test').set({ message: 'Firebase is working!' });
    }

    res.status(200).send({
      message: 'Firebase is connected and working',
      userId: listUsersResult.users[0].uid, // Display the first user's ID (if any)
      testData: testData || { message: 'Firebase is working!' }
    });
  } catch (error) {
    console.error('Error checking Firebase:', error);
    res.status(500).send({ error: 'Failed to connect to Firebase', details: error.message });
  }
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





app.post('/enquiry/submit', async (req, res) => {
  console.log(req.body); // Log the request body to check what is being sent
  
  const { name, contactNo, location, budget, email, organisation, areaSqFt } = req.body;

  if (!name || !contactNo || !location || !budget || !email || !organisation || !areaSqFt) {
    return res.status(400).send({ error: 'Missing required fields' });
  }

  try {
    const enquiryRef = db.ref('enquiries').push();
    await enquiryRef.set({
      name,
      contactNo,
      location,
      budget,
      email,
      organisation,
      areaSqFt,
      createdAt: Date.now(),
    });

    res.status(200).send({ message: 'Enquiry submitted successfully' });
  } catch (error) {
    console.error('Error submitting enquiry:', error); // Log the error for better debugging
    res.status(500).send({ error: 'Failed to submit enquiry' });
  }
});

app.get('/admin/enquiry', async (req, res) => {
  const { uid } = req.query; // Use query for GET requests

  try {
    // Verify if the user is an admin
    const userSnapshot = await db.ref(`users/${uid}`).once('value');
    if (userSnapshot.exists() && userSnapshot.val().isAdmin) {
      const enquiriesSnapshot = await db.ref('enquiries').once('value');
      const enquiries = enquiriesSnapshot.val();
      res.status(200).send({ enquiries });
    } else {
      res.status(403).send({ error: 'Unauthorized access' });
    }
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});



app.delete('/admin/enquiry/:id', async (req, res) => {
  const { uid } = req.body;
  const { id } = req.params;

  try {
    // Verify if the user is an admin
    const userSnapshot = await db.ref(`users/${uid}`).once('value');
    if (userSnapshot.exists() && userSnapshot.val().isAdmin) {
      // Delete the specific enquiry by ID
      await db.ref(`enquiries/${id}`).remove();
      res.status(200).send({ message: 'Enquiry deleted successfully' });
    } else {
      res.status(403).send({ error: 'Unauthorized access' });
    }
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});




app.post('/contact/submit', async (req, res) => {
  const { fullName, phoneNumber, email, location, message } = req.body;

  try {
    // Save the form data to the database (e.g., Firebase or MongoDB)
    const contactRef = db.ref('contacts').push();
    await contactRef.set({
      fullName,
      phoneNumber,
      email,
      location,
      message,
      createdAt: Date.now(),
    });

    res.status(200).send({ message: 'Contact request submitted successfully' });
  } catch (error) {
    res.status(500).send({ error: 'Failed to submit contact request' });
  }
});

app.get('/admin/contact', async (req, res) => {
  const { uid } = req.body;

  try {
    // Verify if the user is an admin
    const userSnapshot = await db.ref(`users/${uid}`).once('value');
    if (userSnapshot.exists() && userSnapshot.val().isAdmin) {
      const contactsSnapshot = await db.ref('contacts').once('value');
      const contacts = contactsSnapshot.val();
      res.status(200).send({ contacts });
    } else {
      res.status(403).send({ error: 'Unauthorized access' });
    }
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});


app.delete('/admin/contact/:id', async (req, res) => {
  const { uid } = req.body;
  const { id } = req.params;

  try {
    // Verify if the user is an admin
    const userSnapshot = await db.ref(`users/${uid}`).once('value');
    if (userSnapshot.exists() && userSnapshot.val().isAdmin) {
      // Delete the specific contact by ID
      await db.ref(`contacts/${id}`).remove();
      res.status(200).send({ message: 'Contact deleted successfully' });
    } else {
      res.status(403).send({ error: 'Unauthorized access' });
    }
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});



// Start the server on the specified port
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
