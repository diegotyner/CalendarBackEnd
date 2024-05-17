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
YOUR_CLIENT_ID = credentials.web.client_id;
YOUR_CLIENT_SECRET = credentials.web.client_secret;
YOUR_REDIRECT_URL = "http://localhost:3000/auth/google/callback";


const oauth2Client = new google.auth.OAuth2(
  YOUR_CLIENT_ID,
  YOUR_CLIENT_SECRET,
  YOUR_REDIRECT_URL
);
oauthClients = []

const scopes = [
  'https://www.googleapis.com/auth/calendar.readonly'
];


app.get('/home', async (req, res) => {
  try {
    // Check if tokens are available in the session

    // If tokens are not available, redirect to the authentication page
    if (oauthClients.length == 0) {
      return res.send("No authorized users available");
    }

    // Use tokens to query Google Calendar API and fetch events
    // const events = await listEvents(refreshTokens);
    let combinedMap = new Map();
    for (const creds of oauthClients) {
      const events = await listEvents(creds);
      const eventsMap = new Map();
      events.forEach(event => {
        const date = event.date;
        if (!eventsMap.has(date)) {
          eventsMap.set(date, []);
        }
        eventsMap.get(date).push(event);
      });
      eventsMap.forEach((value, key) => {
        if (!combinedMap.has(key)) {
          combinedMap.set(key, []);
        }
        combinedMap.get(key).push(...value);
      });
    }
    res.json([...combinedMap]);
  } catch (error) {
    console.error('Error fetching events:', error);
    res.status(500).send('Error fetching events');
  }
});



// Route to start OAuth2 flow
app.get('/auth/google/', (req, res) => {
  // Generate a secure random state value.
  const state = crypto.randomBytes(32).toString('hex');
  
  // Store state in the session
  req.session.state = state;
  
  // Generate a url that asks permissions for the calendar readonly scope
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
    userCredential = tokens;

    // Now you can use the Google APIs with oauth2Client
    const eventsMap = await listEvents(oauth2Client);
    
    const authClone = new google.auth.OAuth2(
      oauth2Client._clientId,
      oauth2Client._clientSecret,
      oauth2Client._redirectUri
    );
    authClone.setCredentials(tokens);
    oauthClients.push(authClone);
    res.json([...eventsMap]);
  } catch (error) {
    console.error('Error retrieving access token:', error);
    res.status(500).send('Error retrieving access token');
  }
});

async function listEvents(auth) {
  class EventObject { 
    constructor(id, calendar, name, date, description, start, end) {
        this.id = id
        this.calendar = calendar;
        this.name = name; // Event name (summary)
        this.date = date;
        this.description = description; // The comments/description to event
        this.starttime = start;
        this.endtime = end;
    }
  }
    const calendar = google.calendar({version: 'v3', auth});

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const endOfWeekFromNow = new Date();
    endOfWeekFromNow.setDate(endOfWeekFromNow.getDate() + 7);
    endOfWeekFromNow.setHours(23, 59, 59, 999);

    // Convert to ISO strings for the Google Calendar API
    const timeMin = startOfToday.toISOString();
    const timeMax = endOfWeekFromNow.toISOString();

    try {
      const calendarList = await calendar.calendarList.list();
      const filteredCalendars = calendarList.data.items.filter(calendarEntry => {
        return calendarEntry.summary.startsWith('⚡');
      });
      const eventPromises = filteredCalendars.map(calendarEntry => {
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
      eventsList = await Promise.all(eventPromises);
      const allEvents = eventsList.flatMap(events => {
        return events.map(event => {
            const start = event.start.dateTime || event.start.date;
            const end = event.end.dateTime || event.end.date;
            return new EventObject(
                event.id,
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
    return eventsMap;
    } catch (error) {
        console.error('Error fetching calendar list:', error);
        return [];
    }
}



/* 
for calendar in calendar_list['items']:
      if calendar.get('summary', 'No summary') == "LDM: General" or calendar.get('summary', 'No summary') == "Neurotech@Davis Projects Calendar":
          continue
      print('------------------------------------------')
      print('Calendar ID:', calendar['id'])
      print('Summary:', calendar.get('summary', 'No summary'))
      print('Description:', calendar.get('description', 'No description'))
      print('------------------------------------------')

      events_result = service.events().list(calendarId=calendar['id'], timeMin=now, timeMax=timeMax ,showDeleted=False, singleEvents=True).execute()
      events = events_result.get("items", [])
      
      if not events:
          print("No upcoming events found.")
          continue

      counter = 0
      for event in events:
          counter += 1
          if event["status"] != "cancelled":
              start = event["start"].get("dateTime", event["start"].get("date"))
              print(start, event["summary"], counter)
              
              # (self, ref, calendar, name, date, description, start, end)
              cal = calendar.get('summary')
              name = event["summary"]
              date = start[:10]
              description = event.get("description", None)
              if "date" in event["start"]: # If an All Day event
                startTime = None
                endTime = None
              else: # If not all day event, has time
                timeString = event["start"].get("dateTime")
                startTime = int(timeString[11:13] + timeString[14:16])
                timeString = event["end"].get("dateTime")
                endTime = int(timeString[11:13] + timeString[14:16])
              MyEvent = EventObject(event, cal, name, date, description, startTime, endTime)


              if date in hashmap: # NEEDS TO BE SORTED
                event_list = hashmap[start[:10]]
                if startTime == None: # If no time
                  event_list.insert(0, MyEvent)
                  continue
                inserted = False
                for i in range(len(event_list)): # If does have time
                  if event_list[i].start == None:
                    continue
                  if startTime < event_list[i].start:
                    event_list.insert(i, MyEvent)
                    inserted = True
                    break
                if not inserted: 
                  event_list.append(MyEvent) 

              else:
                hashmap[date] = [MyEvent]
                  
*/

// Start the server
app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
  });