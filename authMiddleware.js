// const { admin } = require('./firebase');

// // Middleware to verify Firebase ID token
// async function verifyToken(req, res, next) {
//   const authHeader = req.headers.authorization;

//   if (!authHeader || !authHeader.startsWith('Bearer ')) {
//     return res.status(401).send('Unauthorized: No token provided');
//   }

//   const idToken = authHeader.split('Bearer ')[1];

//   try {
//     // Verify the ID token using Firebase Admin SDK
//     const decodedToken = await admin.auth().verifyIdToken(idToken);
//     req.user = decodedToken;  // Attach the decoded token to the request object
//     next();  // Proceed to the next middleware or route handler
//   } catch (error) {
//     console.error('Error verifying token:', error);
//     return res.status(401).send('Unauthorized: Invalid token');
//   }
// }

// module.exports = verifyToken;


// authMiddleware.js
const admin = require('./firebase').admin;

// Middleware to verify the Firebase ID token
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split('Bearer ')[1];

  if (!token) {
    return res.status(401).send('Unauthorized: No token provided');
  }

  // Verify the Firebase ID token
  admin.auth().verifyIdToken(token)
    .then(decodedToken => {
      req.uid = decodedToken.uid;  // Save the user's UID in the request object
      next();  // Proceed to the next middleware or route
    })
    .catch(error => {
      console.error('Token verification failed:', error);
      res.status(401).send('Unauthorized: Invalid token');
    });
};

module.exports = verifyToken;
