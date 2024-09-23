// Example of sending a request with the Firebase ID token
firebase.auth().currentUser.getIdToken(/* forceRefresh */ true).then(function(idToken) {
  // Send the token in the Authorization header
  fetch('/data', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + idToken,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      text: 'New shared text',
      imageUrl: 'https://example.com/image.jpg'
    })
  });
}).catch(function(error) {
  // Handle error
});


