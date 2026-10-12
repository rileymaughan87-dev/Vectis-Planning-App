# Shared calendars — setup and how they work

Shared calendars (Planner, Oct 2026) let family or a partner plan
together. Each calendar's events are seen by everyone in it, and anyone in
it can add, move or delete them. Each person ticks whether the calendar
shows on their own calendar.

## One-time setup: the database rules

The calendars live in the same Firebase database as sync (project
`planner-sync`), outside anyone's private data. They need these rules.

1. Open the Firebase console, then **Firestore Database → Rules**.
2. Replace the rules with the text below. The first block is the rule you
   already have, so nothing changes for your own data.
3. Press **Publish**.

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Your own data (sync): only you.
    match /users/{uid}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }

    // Shared calendars: only their members.
    function signedIn() {
      return request.auth != null;
    }
    function memberOf(cal) {
      return signedIn() && request.auth.uid in get(/databases/$(database)/documents/calendars/$(cal)).data.members;
    }

    match /calendars/{cal} {
      allow read: if signedIn() && request.auth.uid in resource.data.members;
      // Making a calendar: you're its only member.
      allow create: if signedIn() && request.resource.data.members == [request.auth.uid];
      // Members change anything (name, colour, leaving). Someone with an
      // invitation's code may add only themselves.
      allow update: if signedIn() && (
        request.auth.uid in resource.data.members || (
          request.resource.data.diff(resource.data).affectedKeys().hasOnly(['members', 'names', 'joinedWith']) &&
          request.resource.data.members.toSet() == resource.data.members.toSet().union([request.auth.uid].toSet()) &&
          exists(/databases/$(database)/documents/calendars/$(cal)/invites/$(request.resource.data.joinedWith))
        )
      );
      allow delete: if false;

      // An invitation: anyone signed in who has the code can read it (to see what they're joining).
      match /invites/{code} {
        allow get: if signedIn();
        allow create, delete: if memberOf(cal);
      }

      match /events/{id} {
        allow read, write: if memberOf(cal);
      }
    }
  }
}
```

Until these rules are published, Settings → Shared calendars shows "The
database refused access…". Everything else keeps working.

## How it works

- **Data.**
  - `calendars/{id}` holds `{name, colorHex, members: [uid], names: {uid: first name}, createdBy}`.
  - Events are in `calendars/{id}/events/{eventID}` as
    `{json, addedBy, addedByName, updatedAt, updatedByName}`. `json` is
    the event in the usual shape, without links to the adder's own goals.
  - Invitations are in `calendars/{id}/invites/{code}`.
- **Code.**
  - `web/src/sync/sharedCalendars.ts` is the Firebase side, loaded only
    while sync is live, using the sync engine's sign-in and database.
  - `web/src/store/shared.ts` is the state. `apply()` takes the same
    edits as your own events and works out what to send.
  - `web/src/store/sharedLive.ts` connects and disconnects with sync.
  - `web/src/store/calendarView.ts` is what screens show: your own
    events and categories plus the shared calendars you've ticked.
- **Your own choices:** `shared_calendars.json`, which calendars you're in
  and whether each shows. It syncs between your own devices.
- **In the app:**
  - A shared calendar appears as a category `shared:{id}`. Choosing it in
    the event editor moves an event into it, and choosing your own
    category moves it back.
  - Shared events show who added them in the editor and on the Daily
    block.
  - Edits to a shared event (dragging, resizing, per-day changes,
    "this and all future days", deleting) go to the calendar through
    `editEvents` in `store/data.ts`.
- **Invitations:** Settings → Shared calendars → Invite someone makes a
  link `…/planner/#join={calendar}~{code}`. Opening it asks the person to
  sign in with Google, then to join. Anyone with the link can join, so
  it's only for people you send it to.
- **Not shared:** the accountability share file and partner view carry
  only your own events.
