# Intel India Marathon 2026 — LED Race Clock

A race clock for the outdoor LED wall, plus a separate control page for the operator.

| Page | Who sees it | URL |
|---|---|---|
| `index.html` | **LED wall**: runners. Display only, no buttons. | `https://<user>.github.io/<repo>/` |
| `control.html` | **Operator**: phone or laptop. Start / End / Reset. | `https://<user>.github.io/<repo>/control.html` |

Each race shows **TO BE STARTED** until the operator presses **Start Race**. The board then shows a
full-screen **"HAS STARTED"** splash and switches to a live `HH:MM:SS` clock. **End Race** freezes the final time.

---

## Why Firebase is needed for phone control

GitHub Pages only serves static files. It has no server, so a button pressed on your phone cannot
reach the browser on the LED PC by itself. Firebase Realtime Database (free "Spark" plan) relays the
signal:

```
Phone: control.html ──► Firebase Realtime DB ──► LED PC: index.html   (about 100–300 ms)
```

It also provides:
- **Operator login.** Only accounts you approve can control the board, enforced by database rules.
- **Server time.** Start and end times use Firebase's clock, so a phone clock that is a few seconds off cannot skew race times.

**Without Firebase** (`firebase: null` in `config.js`), the pages still work in **local mode**:
board and control stay in sync only when both are open in the same browser on the same computer.

---

## 1. One-time Firebase setup (about 10 minutes)

1. Go to https://console.firebase.google.com → **Add project** (Google Analytics is not needed).
2. **Build → Realtime Database → Create database.** Choose the region nearest the venue
   (for India: `asia-southeast1`). Start in **locked mode**.
3. **Rules tab:** replace everything with the contents of [`firebase/database.rules.json`](firebase/database.rules.json) → **Publish**.
4. **Build → Authentication → Get started → Email/Password → Enable.**
5. **Authentication → Users → Add user.** Create the operator login (for example `race-ops@yourdomain`, strong password).
   Copy the **User UID**.
6. **Realtime Database → Data.** Add an entry: key `operators`, child `<that UID>` with value `true`, so the
   data looks like `operators/<UID>: true`. Repeat for each backup operator.
   *A signed-in account that is not listed here cannot change anything.*
7. **Project settings (⚙) → General → Your apps → Web (`</>`)** → register the app → copy the
   `firebaseConfig` values into `config.js`:

```js
firebase: {
  apiKey:      'AIza…',
  authDomain:  'your-project.firebaseapp.com',
  databaseURL: 'https://your-project-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId:   'your-project',
  appId:       '1:…:web:…',
},
```

> These web config values are designed to be public, so committing them to GitHub is normal.
> Security comes from the rules (step 3) and the operator list (step 6).

8. *(Recommended)* **Authentication → Settings → Authorized domains** → add `<user>.github.io`.

## 2. Publish on GitHub Pages

1. Create a GitHub repo and push **all files in this folder**, including `.nojekyll`, `config.js`, `assets/` and `firebase/`.
2. Repo → **Settings → Pages → Source: Deploy from a branch → `main` / root** → Save.
3. After about a minute, open `https://<user>.github.io/<repo>/`.

After editing CSS or JS, bump `?v=2` → `?v=3` in both HTML files so the LED PC does not keep an old cached copy.

## 3. Race-day checklist

- [ ] **LED PC:** open `https://<user>.github.io/<repo>/` in Chrome or Edge → press **F** (or double-click) for full screen.
      The footer shows **● SYNCED** in green when it is connected.
- [ ] **Phone:** open `…/control.html` → sign in → the banner says **Connected**.
- [ ] Set Windows power plan to **never sleep / never turn off the display** on the LED PC.
- [ ] Both devices need internet. The phone can use mobile data and the LED PC can use venue Wi-Fi.
- [ ] Keep a **backup operator** signed in on a second phone.

### Rehearsal without touching race-day data
Add `?event=rehearsal` to **both** URLs, for example `…/control.html?event=rehearsal` and `…/?event=rehearsal`.
Each event id is a separate set of race data.

### If something goes wrong
| Problem | What happens / what to do |
|---|---|
| LED PC loses internet | Clocks **keep running** from the last known state. The footer shows *Reconnecting* and catches up automatically. |
| LED PC browser refreshes or crashes | Reopen the URL. Race times come back from Firebase. |
| Phone loses signal | The banner shows *Offline*. Presses are time-stamped when tapped and sent when the signal returns. Use the backup phone if needed. |
| Pressed Start a few seconds late | Tap **+1s** for each second missed. |
| Pressed End by mistake | **Resume Race** continues from the original start time. |
| Started the wrong race | **Reset** returns it to "To Be Started". |

## Files

```
index.html               LED board (display only)
control.html             Operator control panel
config.js                ← event name, races, Firebase config (edit this)
assets/core.js           State model, sync (Firebase or local), formatting, dialogs
assets/board.js          Board rendering, start splash, auto-fit
assets/control.js        Control panel, sign-in, actions
assets/common.css        Shared colours, buttons, dialogs
assets/board.css         LED layout (scales to any LED resolution or aspect ratio)
assets/control.css       Phone-first control layout
firebase/database.rules.json   Paste into Firebase → Realtime Database → Rules
```

**Add or rename a race:** edit `races` in `config.js` (`id`, `name`, `icon`, `theme`: blue, amber or green).
The board lays out as many cards as you list.

**Local testing:** double-click `index.html` and `control.html` in the same browser
(local mode). Add `?mode=local` to force local mode even when Firebase is configured.
