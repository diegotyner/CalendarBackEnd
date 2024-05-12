const { google } = require('googleapis');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const fs = require('fs');

// Initialize Express app
const app = express();
const port = 3000;

// Set up session middleware
app.use(session({
  secret: 'your_secret_here',
  resave: false,
  saveUninitialized: true,
}));

// Google OAuth2 credentials
const credentials = JSON.parse(fs.readFileSync('credentials.json'));
console.log(credentials)
YOUR_CLIENT_ID = credentials.web.client_id;
YOUR_CLIENT_SECRET = credentials.web.client_secret;
YOUR_REDIRECT_URL = "http://localhost:3000/auth/google/callback";

const oauth2Client = new google.auth.OAuth2(
  YOUR_CLIENT_ID,
  YOUR_CLIENT_SECRET,
  YOUR_REDIRECT_URL
);

const scopes = [
  'https://www.googleapis.com/auth/calendar.readonly'
];

app.get('/', (req, res) => {
    console.log("Yup");
    res.send('http://localhost:3000/auth/google/')
});


// Route to start OAuth2 flow
app.get('/auth/google/', (req, res) => {
  // Generate a secure random state value.
  const state = crypto.randomBytes(32).toString('hex');
  
  // Store state in the session
  req.session.state = state;

  console.log("here 1");
  // Generate a url that asks permissions for the Drive activity scope
  const authorizationUrl = oauth2Client.generateAuthUrl({
    // 'online' (default) or 'offline' (gets refresh_token)
    access_type: 'offline',
    /** Pass in the scopes array defined above.
      * Alternatively, if only one scope is needed, you can pass a scope URL as a string */
    scope: scopes,
    // Enable incremental authorization. Recommended as a best practice.
    include_granted_scopes: true,
    // Include the state parameter to reduce the risk of CSRF attacks.
    state: state
  });
  console.log("here 2");
  // Redirect the user to the authorization URL
  res.redirect(authorizationUrl);
});

// Route for OAuth2 callback
app.get('/auth/google/callback', async (req, res) => {
  const { code, state } = req.query;
  const storedState = req.session.state;

  // Check if state matches
  if (state !== storedState) {
    return res.status(403).send('State mismatch');
  }

  try {
    // Exchange authorization code for access token
    const { tokens } = await oauth2Client.getToken(code);
    
    // Set access token in the OAuth2 client
    oauth2Client.setCredentials(tokens);

    // Now you can use the Google APIs with oauth2Client

    const eventPayload = await listEvents(oauth2Client);
    
    // Send the event payload back to the client
    res.json({ events: eventPayload });
  } catch (error) {
    console.error('Error retrieving access token:', error);
    res.status(500).send('Error retrieving access token');
  }
});

async function listEvents(auth) {
    const calendar = google.calendar({version: 'v3', auth});
    const res = await calendar.events.list({
      calendarId: 'primary',
      timeMin: new Date().toISOString(),
      maxResults: 10,
      singleEvents: true,
      orderBy: 'startTime',
    });
    const events = res.data.items;
    if (!events || events.length === 0) {
      console.log('No upcoming events found.');
      return [];
    }
    console.log('Upcoming 10 events:');
    const eventPayload = events.map(event => {
        const start = event.start.dateTime || event.start.date;
        return `${start} - ${event.summary}`;
      });
    
    return eventPayload;
}



// Start the server
app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
  });