/* ==================================================================
   RACE CLOCK — EVENT CONFIGURATION  (the only file you normally edit)
   ================================================================== */
window.RACE_CONFIG = {
  eventTitle: 'India Marathon',
  eventYear:  '2026',
  footerText: 'Intel India Marathon 2026',

  // Data key for this event. Use the URL ?event=rehearsal for practice
  // runs so race-day data stays clean.
  eventId: 'intel-india-marathon-2026',

  // Board order = order here. id: letters/numbers only.
  // theme: blue | amber | green
  races: [
    { id: '10k', name: '10K Run',  icon: '🏃', theme: 'blue'  },
    { id: '5k',  name: '5K Run',   icon: '🏅', theme: 'amber' },
    { id: '3k',  name: '3K Walk',  icon: '🚶', theme: 'green' },
  ],

  showTenths: true,   // small ".d" after HH:MM:SS on the LED board
  announceMs: 6000,   // how long the "HAS STARTED" splash stays on screen

  /* ----------------------------------------------------------------
     PHONE / REMOTE CONTROL (Firebase Realtime Database)
     Leave as null → "local mode": board + control sync only inside the
     same browser on the same computer.
     Paste your Firebase web config to control the board from a phone.
     These values are public by design; security comes from the database
     rules in firebase/database.rules.json. See README.md.
     ---------------------------------------------------------------- */
  firebase: {
    apiKey:      'AIzaSyAP2mA-jS3n62thbWDBd2fiRqWk8CH4uBI',
    authDomain:  'india-marathon-clock-9d19.firebaseapp.com',
    databaseURL: 'https://india-marathon-clock-9d19-default-rtdb.asia-southeast1.firebasedatabase.app',
    projectId:   'india-marathon-clock-9d19',
    appId:       '1:942684983695:web:703f50c0b851c04c213bfa',
  },
  firebaseSdkVersion: '10.12.2',
};
