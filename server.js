// server.js
const express = require('express');
const admin = require('firebase-admin');
const multer = require('multer'); // Middleware for handling multipart/form-data
require('dotenv').config();
console.log('FIREBASE_PRIVATE_KEY:', process.env.FIREBASE_PRIVATE_KEY); // Debug
const cors = require('cors'); // Import cors middleware
 

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
app.use(cors()); // This will allow requests from all origins


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


const bcrypt = require('bcryptjs'); // To hash and compare passwords

// Endpoint to create a user
app.post('/createAdmin', async (req, res) => {
  const { email, password } = req.body;

  try {
    // Hash the password before storing it
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user in Firebase Authentication (without password)
    const userRecord = await admin.auth().createUser({
      email: email,
    });

    // Add user details to Realtime Database, including hashed password
    await db.ref(`users/${userRecord.uid}`).set({
      email: email,
      password: hashedPassword, // Store hashed password
      isAdmin: false, // Set default role as non-admin
      createdAt: admin.database.ServerValue.TIMESTAMP, // Use ServerValue for timestamp
    });

    res.status(201).send({ message: 'User created successfully', uid: userRecord.uid });
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});


// Endpoint to login an admin
app.post('/adminLogin', async (req, res) => {
  const { email, password } = req.body;

  try {
    // Verify email via Firebase Authentication
    const userRecord = await admin.auth().getUserByEmail(email);

    // Get the user data from the Realtime Database
    const snapshot = await db.ref(`users/${userRecord.uid}`).once('value');
    const userData = snapshot.val();

    if (!userData) {
      return res.status(404).send({ error: 'User not found' });
    }

    // Compare the entered password with the hashed password in the database
    const isPasswordValid = await bcrypt.compare(password, userData.password);

    if (!isPasswordValid) {
      return res.status(401).send({ error: 'Invalid password' });
    }

    // Check if the user is an admin
    if (!userData.isAdmin) {
      return res.status(403).send({ error: 'Unauthorized: Only admins can login.' });
    }

    // Instead of generating a custom token, return the user ID
    res.status(200).send({ message: 'Admin login successful', userId: userRecord.uid });
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});










// Endpoint to get all users and change user roles
app.get('/admin/users', async (req, res) => {
  const { uid } = req.query; // Get admin UID from query parameters

  try {
    // Verify that the user is an admin (implement your own admin verification logic)
    const adminUser = await db.ref(`users/${uid}`).once('value');
    if (!adminUser.exists() || !adminUser.val().isAdmin) {
      return res.status(403).send({ error: 'Access denied. User is not an admin.' });
    }

    // Fetch all users from the database
    const usersSnapshot = await db.ref('users').once('value');
    const users = [];

    usersSnapshot.forEach(userSnapshot => {
      const userData = userSnapshot.val();
      users.push({
        uid: userSnapshot.key,
        email: userData.email,
        isAdmin: userData.isAdmin,
        createdAt: userData.createdAt,
      });
    });

    res.status(200).send(users);
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

// Endpoint to change user role to admin
app.post('/admin/changeRole', async (req, res) => {
  const { uid, userId, role } = req.body; // Get admin UID, target user ID, and new role

  try {
    // Verify that the user is an admin (implement your own admin verification logic)
    const adminUser = await db.ref(`users/${uid}`).once('value');
    if (!adminUser.exists() || !adminUser.val().isAdmin) {
      return res.status(403).send({ error: 'Access denied. User is not an admin.' });
    }

    // Update the user's role
    await db.ref(`users/${userId}`).update({
      isAdmin: role === 'admin',
    });

    res.status(200).send({ message: 'User role updated successfully' });
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});









// Multer setup for image upload handling
const upload = multer({ storage: multer.memoryStorage() });
const { v4: uuidv4 } = require('uuid'); // To generate unique IDs for file names


// Endpoint for admin to upload images
app.post('/admin/uploadImage', upload.single('image'), async (req, res) => {
    const { uid } = req.query; // Get user ID for admin verification
    const { rename } = req.body; // New image name from the request body
    const file = req.file; // Image file

    try {
        // Check if the user is an admin
        const userSnapshot = await db.ref(`users/${uid}`).once('value');
        if (userSnapshot.exists() && userSnapshot.val().isAdmin) {
            // If the admin provided a "rename" value, use it; otherwise, use the original filename
            const newFileName = rename ? `${uuidv4()}-${rename}` : `${uuidv4()}-${file.originalname}`;
            const blob = bucket.file(newFileName);
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
                    imageUrl: `https://storage.googleapis.com/${bucket.name}/${newFileName}`
                });
            });

            // Upload the file buffer to the storage
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
    const { uid } = req.query; // Get user ID for admin verification
    const { renames } = req.body; // Array of rename values
    const files = req.files; // Array of image files

    try {
        // Check if the user is an admin
        const userSnapshot = await db.ref(`users/${uid}`).once('value');
        if (userSnapshot.exists() && userSnapshot.val().isAdmin) {
            let imageUrls = [];

            // Loop through each file and upload it
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                // Use the rename from the request body if provided, otherwise use the original filename
                const rename = renames && renames[i] ? renames[i] : file.originalname;
                // Create a unique filename using uuid
                const uniqueFileName = `${uuidv4()}-${rename}`;
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
    const imageUrls = files.map(file => ({
      fileName: file.name, // Include the file name in the response
      imageUrl: `https://storage.googleapis.com/${bucket.name}/${file.name}` // Image URL
    }));
    res.status(200).send(imageUrls); // Return the array of images with their names and URLs
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

// Endpoint to delete an image
app.delete('/admin/deleteImage', async (req, res) => {
  const { imageName } = req.body; // Image name to delete

  try {
    await bucket.file(imageName).delete(); // Delete the specified image
    res.status(200).send({ message: 'Image deleted successfully' });
  } catch (error) {
    if (error.code === 404) {
      res.status(404).send({ error: 'Image not found' }); // Handle if the image does not exist
    } else {
      res.status(500).send({ error: error.message });
    }
  }
});


// Endpoint to edit an image (upload a new image and replace the old one)
app.put('/admin/editImage', upload.single('image'), async (req, res) => {
  const { uid } = req.query; // Get user ID for admin verification
  const { rename } = req.body; // New image name from the request body
  const file = req.file; // New image file

  if (!file) {
    return res.status(400).send({ error: 'No image uploaded' });
  }

  try {
    // Check if the user is an admin
    const userSnapshot = await db.ref(`users/${uid}`).once('value');
    if (!userSnapshot.exists() || !userSnapshot.val().isAdmin) {
      return res.status(403).send({ error: 'User is not authorized to upload images' });
    }

    // Define the name for the new file
    const newFileName = rename ? `${uuidv4()}-${rename}` : `${uuidv4()}-${file.originalname}`;
    const oldFileName = rename; // Use the provided rename as the old file name

    const oldFile = bucket.file(oldFileName);

    // Check if the old file exists
    const [exists] = await oldFile.exists();
    if (!exists) {
      return res.status(404).send({ message: 'Old image not found' });
    }

    // Delete the old file
    await oldFile.delete();

    // Create a new file reference for the new image
    const newFile = bucket.file(newFileName);
    const blobStream = newFile.createWriteStream({
      metadata: {
        contentType: file.mimetype,
      },
    });

    blobStream.on('finish', async () => {
      // Make the new file public
      await newFile.makePublic();

      res.status(200).send({
        message: 'Image replaced successfully',
        imageUrl: `https://storage.googleapis.com/${bucket.name}/${newFileName}`,
      });
    });

    // Upload the file buffer to the storage
    blobStream.end(file.buffer);
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
    const { uid } = req.query;
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
    const { uid } = req.query;

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
    const { uid } = req.query;
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





const path = require('path'); // Make sure to include the 'path' module

// Multer setup for file uploads (documents)
const uploadDoc = multer({
  storage: multer.memoryStorage(), // Temporarily store the document in memory
  limits: { fileSize: 5 * 1024 * 1024 }, // Limit to 5MB files
  fileFilter: (req, file, cb) => {
    const fileTypes = /pdf|doc|docx/; // Allow only PDF, DOC, DOCX
    const extname = fileTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = fileTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only documents are allowed (pdf, doc, docx)!'));
    }
  }
});

// POST route for partner form submission
app.post('/partner/submit', uploadDoc.single('document'), async (req, res) => {
  const { partnerRole, partnerName, companyName, phoneNumber, email, city, comments } = req.body;
  const document = req.file; // The uploaded file

  try {
    // Check if document is uploaded
    if (!document) {
      return res.status(400).send({ error: 'Document upload required' });
    }

    // Ensure all required fields are provided
    if (!partnerRole || !partnerName || !companyName || !phoneNumber || !email || !city) {
      return res.status(400).send({ error: 'All fields are required' });
    }

    // Generate a new filename by appending the partner's phone number
    const newFileName = `${phoneNumber}-${document.originalname}`;
    const blob = bucket.file(newFileName);
    const blobStream = blob.createWriteStream({
      metadata: {
        contentType: document.mimetype,
      },
    });

    blobStream.on('finish', async () => {
      // Make the document public or keep private based on your needs
      await blob.makePublic(); // You can remove this line if the document should remain private

      // Save the form data and document info to Firebase database
      const partnerRef = db.ref('partners').push();
      await partnerRef.set({
        partnerRole,
        partnerName,
        companyName,
        phoneNumber,
        email,
        city,
        comments: comments || '', // Optional comments
        documentUrl: `https://storage.googleapis.com/${bucket.name}/${newFileName}`, // Public URL
        documentName: document.originalname, // Original file name
        uploadedFileName: newFileName, // File name with phone number
        createdAt: Date.now(),
      });

      res.status(200).send({ message: 'Partner request submitted successfully', documentUrl: `https://storage.googleapis.com/${bucket.name}/${newFileName}` });
    });

    // End the stream and upload the document
    blobStream.end(document.buffer);
  } catch (error) {
    console.error('Error submitting partner request:', error.message);
    res.status(500).send({ error: 'Failed to submit partner request' });
  }
});


// GET route to fetch partner data for admin
app.get('/admin/partner', async (req, res) => {
  const { uid } = req.query;

  try {
    if (!uid) {
      return res.status(400).send({ error: 'User ID is required' });
    }

    // Verify if the user is an admin
    const userSnapshot = await db.ref(`users/${uid}`).once('value');
    if (!userSnapshot.exists()) {
      return res.status(404).send({ error: 'User not found' });
    }

    const user = userSnapshot.val();
    if (!user.isAdmin) {
      return res.status(403).send({ error: 'Unauthorized access' });
    }

    // Fetch all partner data
    const partnersSnapshot = await db.ref('partners').once('value');
    const partners = partnersSnapshot.val();

    res.status(200).send({ partners });
  } catch (error) {
    console.error('Error fetching partner data:', error.message);
    res.status(500).send({ error: 'Failed to fetch partner data' });
  }
});

// DELETE route to remove a partner entry
app.delete('/admin/partner/:id', async (req, res) => {
  const { uid } = req.query;
  const { id } = req.params;

  try {
    if (!uid) {
      return res.status(400).send({ error: 'User ID is required' });
    }

    // Verify if the user is an admin
    const userSnapshot = await db.ref(`users/${uid}`).once('value');
    if (!userSnapshot.exists()) {
      return res.status(404).send({ error: 'User not found' });
    }

    const user = userSnapshot.val();
    if (!user.isAdmin) {
      return res.status(403).send({ error: 'Unauthorized access' });
    }

    // Delete the specific partner entry by ID
    const partnerRef = db.ref(`partners/${id}`);
    const partnerSnapshot = await partnerRef.once('value');
    if (!partnerSnapshot.exists()) {
      return res.status(404).send({ error: 'Partner not found' });
    }

    await partnerRef.remove();
    res.status(200).send({ message: 'Partner deleted successfully' });
  } catch (error) {
    console.error('Error deleting partner entry:', error.message);
    res.status(500).send({ error: 'Failed to delete partner' });
  }
});

 


// Endpoint to create Contact Information 2 (Admin only)
app.post('/api/contact-info-2', async (req, res) => {
  const { address, phone, email } = req.body;

  try {
    await db.ref('contactInfo2').set({ address, phone, email });
    res.json({ message: 'Contact Information 2 created successfully' });
  } catch (error) {
    console.error("Error creating contact info 2:", error);
    res.status(500).json({ error: 'Failed to create contact information' });
  }
});

// Endpoint to update Contact Information 2 (Admin only)
app.put('/api/contact-info-2', async (req, res) => {
  const { address, phone, email } = req.body;

  try {
    const ref = db.ref('contactInfo2');
    const snapshot = await ref.once('value');
    
    if (snapshot.exists()) {
      await ref.update({ address, phone, email });
      res.json({ message: 'Contact Information 2 updated successfully' });
    } else {
      res.status(404).json({ message: 'Contact Information 2 not found' });
    }
  } catch (error) {
    console.error("Error updating contact info 2:", error);
    res.status(500).json({ error: 'Failed to update contact information' });
  }
});

// Endpoint to get Contact Information 2
app.get('/api/contact-info-2', async (req, res) => {
  try {
    const snapshot = await db.ref('contactInfo2').once('value');
    const contactInfo2 = snapshot.val();
    res.json(contactInfo2);
  } catch (error) {
    console.error("Error fetching contact info 2:", error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Endpoint to delete Contact Information 2
app.delete('/api/contact-info-2', async (req, res) => {
  try {
    await db.ref('contactInfo2').remove();
    res.json({ message: 'Contact Information 2 removed successfully' });
  } catch (error) {
    console.error("Error deleting contact info 2:", error);
    res.status(500).json({ error: 'Failed to remove contact information' });
  }
});


// Start the server on the specified port
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
