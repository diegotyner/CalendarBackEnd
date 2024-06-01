const { google } = require('googleapis');
// const crypto = require('crypto'); // Used for secure states, incompatible with Vercel
const express = require('express');
const session = require('cookie-session');
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
  origin: [process.env.ALLOWED_ORIGIN1, process.env.ALLOWED_ORIGIN2], // Combine allowed origins into a single array
  methods: ["GET"],
  credentials: true
}));

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


app.get("/", (req, res) => { res.send("Express on Vercel")});


app.get('/home', async (req, res) => {
  console.time('Whole Home')
  console.log('---------Home---------')
  const userList = await User.find().exec()
  if (userList.length == 0) {
    return res.send("No authorized users available");
  }

  let combinedMap = new Map();
  for (const userObject of userList) {
    const tokens = userObject.refresh_token 
    console.log(tokens)
    if (!tokens) {
      continue
    }

    try {
      const eventsMap = await listEvents(tokens, userObject.email);
      eventsMap.forEach((value, key) => {
        if (!combinedMap.has(key)) {
          combinedMap.set(key, []);
        }
        combinedMap.get(key).push(...value);
      });
    } catch (error) {
      console.error('Error fetching events for token:', tokens, error);
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
    prompt: 'consent',
    scope: scopes,
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
    console.log(tokens)

    // Bookkeeping DB with new user
    let profile;
    try {
      profile = await oauth2.userinfo.get({ auth: oauth2Client }).then(response => response.data);
      let userInDB = await User.findOne({email: profile.email}).exec()
      if (!userInDB) {
        const user = new User({
          name: profile.name,
          email: profile.email,
          refresh_token: tokens.refresh_token
        });
        await user.save()
        console.log('User saved to DB: ', user.email)
      } else {
        const oldTokens = userInDB.refresh_token;
        userInDB.refresh_token = tokens.refresh_token || oldTokens.refresh_token;
        await userInDB.save();
        console.log('User already in DB, attempted to refresh: ', userInDB.email)
      }
    } catch (error) {
      console.error('Error handling user:', error);
    };
    // const eventsMap = await listEvents(tokens, profile.email);
    // const eventObject = Object.fromEntries(eventsMap);

    console.timeEnd('Whole Callback')
    res.redirect(process.env.ALLOWED_ORIGIN2);
  } catch (error) {
    console.error('Error retrieving access token:', error);
    res.status(500).send('Error retrieving access token');
  }
});


// ------- Declarations ------- //
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
function toPacificTime(date) {
  return new Date(
    date.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })
  );
}
function startOfDayInPacificTime(date) {
  const pacificDate = toPacificTime(date);
  pacificDate.setHours(0, 0, 0, 0);
  return pacificDate;
}
function endOfWeekInPacificTime(date) {
  const pacificDate = toPacificTime(date);
  pacificDate.setDate(pacificDate.getDate() + 7);
  pacificDate.setHours(23, 59, 59, 999);
  return pacificDate;
}   // ------- Declarations ------- //

async function listEvents(auth_tokens, user_email) {
  console.time('List Events')
  oauth2Client.setCredentials({ refresh_token: auth_tokens });
  console.log(auth_tokens)
  const calendar = google.calendar({version: 'v3', auth: oauth2Client});

  const startOfToday = startOfDayInPacificTime(new Date());
  const endOfWeekFromNow = endOfWeekInPacificTime(new Date());

  // Convert to ISO strings for the Google Calendar API
  const timeMin = startOfToday.toISOString();
  const timeMax = endOfWeekFromNow.toISOString();
  console.log(timeMin, timeMax)
  try {
    console.time('Calendar List')
    const calendarList = (await calendar.calendarList.list()).data.items;
    console.timeEnd('Calendar List')
    
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
          let start = event.start.dateTime || event.start.date;
          let end = event.end.dateTime || event.end.date;

          // In stupid UTC time and needs to process
          if (start.length > 18 && start[19] == 'Z') {
            const start_date_object = new Date(start);
            const start_pacific_timeString = new Intl.DateTimeFormat('en-US', {
                timeZone: 'America/Los_Angeles',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false
            }).format(start_date_object);
            const start_splitStr = start_pacific_timeString.split(/[/,\s]/); // [month, day, year, time]
            const start_timeSplt = start_splitStr[4].split(':'); // [hours, minutes, seconds]
            start = `${start_splitStr[2]}-${start_splitStr[0]}-${start_splitStr[1]}T${start_timeSplt[0]}:${start_timeSplt[1]}:${start_timeSplt[2]}-07:00`;
            
            const end_date_object = new Date(end);
            const end_pacific_timeString = new Intl.DateTimeFormat('en-US', {
                timeZone: 'America/Los_Angeles',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false
            }).format(end_date_object);
            const end_splitStr = end_pacific_timeString.split(/[/,\s]/); // [month, day, year, time]
            const end_timeSplt = end_splitStr[4].split(':'); // [hours, minutes, seconds]
            end = `${end_splitStr[2]}-${end_splitStr[0]}-${end_splitStr[1]}T${end_timeSplt[0]}:${end_timeSplt[1]}:${end_timeSplt[2]}-07:00`;
          }

          return new EventObject(
              event.id,
              user_email,
              event.calendarName, 
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



