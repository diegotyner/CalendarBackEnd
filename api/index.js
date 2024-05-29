const { google } = require('googleapis');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const mongoose = require('mongoose');
const oauth2 = google.oauth2('v2');
const cors = require('cors');
require('dotenv').config();

// Initialize Express app
const app = express();
const port = 3000;
module.exports = app;

// Connect to Mongo
const User = require('../models/schema');
const dbURI = process.env.DB_URI
mongoose.connect(dbURI)
  .then( (result) => {
    console.log('Connected to db')
    app.listen(port, () => {console.log(`Server is running on http://localhost:${port}`)});
  })
  .catch( (err) => console.log(err))


app.use(cors({
      origin: [process.env.ALLOWED_ORIGIN],
      methods: ["GET"],
      credentials: true
  }
));

// Set up session middleware
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: true,
}));


const oauth2Client = new google.auth.OAuth2(
  process.env.CLIENT_ID,
  process.env.CLIENT_SECRET,
  process.env.REDIRECT_URL
);

const scopes = [ 'https://www.googleapis.com/auth/calendar.readonly', 'https://www.googleapis.com/auth/userinfo.profile', 'https://www.googleapis.com/auth/userinfo.email'];

// app.get("/", (req, res) => res.send("Express on Vercel"));
app.get("/", (req, res) => { res.send("Express on Vercel")});

app.get('/home', async (req, res) => {
  console.time('Whole Home')
  console.log('---------Home---------')
  const tokenList = await User.find().exec()
  if (tokenList.length == 0) {
    return res.send("No authorized users available");
  }

  let combinedMap = new Map();
  for (const userObject of tokenList) {
    const token = userObject.token
    if (!token) {
      continue
    }

    try {
      const eventsMap = await listEvents(token, userObject.email);
  
      eventsMap.forEach((value, key) => {
        if (!combinedMap.has(key)) {
          combinedMap.set(key, []);
        }
        combinedMap.get(key).push(...value);
      });
    } catch (error) {
      console.error('Error fetching events for token:', token, error);
    }
  }
  const combinedObject = Object.fromEntries(combinedMap);
  console.timeEnd('Whole Home')
  res.json(combinedObject);
});



// Route to start OAuth2 flow
app.get('/auth/google/', (req, res) => {
  console.log('---------Authenticating---------')

  // const state = crypto.randomBytes(32).toString('hex');
  // req.session.state = state;
  
  const authorizationUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    // Enable incremental authorization. Recommended as a best practice.
    include_granted_scopes: true
    // Include the state parameter to reduce the risk of CSRF attacks.
    // state: state
  });
  res.redirect(authorizationUrl);
});

// Route for OAuth2 callback
app.get('/auth/google/callback', async (req, res) => {
  console.log('---------Callback---------')
  console.time('Whole Callback')
  const code = req.query;
  // const storedState = req.session.state;
  // if (state !== storedState) {
  //   return res.status(403).send('State mismatch');
  // }

  try {
    // Exchange authorization code for access token
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Bookkeeping DB with new user
    let profile;
    try {
      profile = await oauth2.userinfo.get({ auth: oauth2Client }).then(response => response.data);
      let userInDB = await User.findOne({email: profile.email}).exec()
      if (!userInDB) {
        const user = new User({
          name: profile.name,
          email: profile.email,
          token: tokens
        });
        await user.save()
        console.log('User saved to DB: ', user.email)
      } else {
        userInDB.token = tokens;
        await userInDB.save();
        console.log('User updated in DB: ', userInDB.email)
      }
    } catch (error) {
      console.error('Error handling user:', error);
    };

    const eventsMap = await listEvents(tokens, profile.email);
    const eventObject = Object.fromEntries(eventsMap);
    console.timeEnd('Whole Callback')
    res.json(eventObject);
  } catch (error) {
    console.error('Error retrieving access token:', error);
    res.status(500).send('Error retrieving access token');
  }
});

async function listEvents(auth_token, user_email) {
  console.time('List Events')
  class EventObject { 
    constructor(id, user, calendar, name, date, description, start, end) {
        this.id = id;
        this.user = user;
        this.calendar = calendar;
        this.name = name; // Event name (summary)
        this.date = date;
        this.description = description; // The comments/description to event
        this.starttime = start;
        this.endtime = end;
    }
  }

  oauth2Client.setCredentials(auth_token)
  const calendar = google.calendar({version: 'v3', auth: oauth2Client});

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const endOfWeekFromNow = new Date();
  endOfWeekFromNow.setDate(endOfWeekFromNow.getDate() + 7);
  endOfWeekFromNow.setHours(23, 59, 59, 999);

  // Convert to ISO strings for the Google Calendar API
  const timeMin = startOfToday.toISOString();
  const timeMax = endOfWeekFromNow.toISOString();
  try {
    console.time('Calendar List')
    const calendarList = (await calendar.calendarList.list()).data.items;
    console.timeEnd('Calendar List')

    // const calendarNames = calendarList.map(calendarEntry => {
    //   return calendarEntry.summary
    // })    
    // console.log(calendarNames);
    
    const eventPromises = calendarList.map(calendarEntry => {
        const calendarId = calendarEntry.id;
        const calendarName = calendarEntry.summary; // Get the calendar name
        return calendar.events.list({ 
          calendarId: calendarId,
          timeMin: timeMin,
          timeMax: timeMax,
          showDeleted: false,
          singleEvents: true            
        }).then(response => {
          return response.data.items.map(event => ({
              ...event,
              calendarName: calendarName // Attach the calendar name to each event
          }));
      }).catch(error => {
            console.error(`Error fetching events for calendar ${calendarId}:`, error);
            return null; // Return null or an empty list to handle the error
        });
    });
    console.time('Event Promises')
    const eventsList = await Promise.all(eventPromises);
    console.timeEnd('Event Promises')
    const allEvents = eventsList.flatMap(events => {
      return events.map(event => {
          const start = event.start.dateTime || event.start.date;
          const end = event.end.dateTime || event.end.date;

          // In stupid UTC time and needs to process
          if (start.length > 18 && start[19] == 'Z') {
            let hours = Number(start.slice(11, 13)) - 7;
            start = start.slice(0, 11) + hours.toString() + start.slice(13, 19) + "-07:00"
          }

          return new EventObject(
              event.id,
              user_email,
              event.calendarName, // Use the calendar name here
              event.summary,
              start.split('T')[0],
              event.description || '',
              start,
              end
          );
      });
    });
    const eventsMap = new Map();
    allEvents.forEach(event => {
      const date = event.date;
      if (!eventsMap.has(date)) {
          eventsMap.set(date, []);
      }
      eventsMap.get(date).push(event);
    });
    console.timeEnd('List Events')
    return eventsMap;
  } catch (error) {
      console.error('Error fetching calendar list:', error);
      return [];
  }
}



