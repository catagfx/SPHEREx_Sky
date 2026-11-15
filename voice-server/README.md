# Voice backend (Node + LiveKit)

The existing web and VR clients use LiveKit for audio and data messages. This Express API creates
rooms, signs user tokens, and controls who may speak. Audio travels through LiveKit; Node handles
authorization. A CometChat integration would also require replacing the client SDK and data channel.

## Local setup

Requires Node.js 20+ and the Python dependencies listed in the main README.
The development launcher uses the project's Python .venv automatically when one exists.

From the repository root:

```sh
npm ci
npm --prefix voice-server ci
```

Copy `voice-server/.env.example` to `voice-server/.env`. In PowerShell:

```powershell
Copy-Item voice-server/.env.example voice-server/.env
```

Create a project at https://cloud.livekit.io and put its **WebSocket URL**, **API key** and **API secret**
in that file. Do not put the secret in frontend code. The file is ignored by Git and is loaded relative
to the voice server, regardless of where the command is run. Environment variables from the hosting
platform take precedence.

```dotenv
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=your-api-key
LIVEKIT_API_SECRET=your-api-secret
VOICE_PORT=8787
PUBLIC_URL=http://localhost:5173
ALLOWED_ORIGINS=
VOICE_TRUST_PROXY=1
```

Use `VOICE_TRUST_PROXY=1` when Node is reachable only through the Vite/Python proxy or a trusted
reverse proxy that replaces X-Forwarded-For. Use 0 for direct access to Node.

`npm run dev` installs missing Node dependencies and starts Python, voice, and Vite together.
Open http://localhost:5173. Check http://localhost:5173/api/rooms/health:
`livekit: true` means credentials are present; creating a room also verifies provider access.

For the built site, start these in separate terminals:

```sh
npm run voice
python server.py
```

Open http://localhost:8080. Python forwards `/api/rooms` to Node. Set `PUBLIC_URL=http://localhost:8080`
for matching invite links. If changing the voice port, also change `VOICE_TARGET` in the root
`.env` for Python; Vite receives the selected port automatically through `npm run dev`.

Without LIVEKIT_* credentials the server runs, reports `livekit: false`, and returns a clear 503
when someone tries to create a room. Incorrect credentials or an unavailable provider return 502.

## API

All errors return JSON `{ error: "..." }`. Tokens and host keys must not be logged or cached.

| Method | Path | Request | Result |
|---|---|---|---|
| GET | /api/rooms/health | — | Configuration status (not a provider connectivity probe) |
| POST | /api/rooms | name, maxParticipants? (2–100), ttlHours? (1–48) | roomId, hostKey, inviteUrl, name, maxParticipants |
| GET | /api/rooms/:id | — | Public name, participant count, capacity, expiry |
| POST | /api/rooms/:id/token | name, hostKey? | token, url, role, identity, name, inviteUrl |
| POST | /api/rooms/:id/speakers | hostKey, identity, allow (boolean) | ok |
| POST | /api/rooms/:id/kick | hostKey, identity | ok |

Anyone with an invite may join as a listener. Only the room creator's hostKey grants host access.
The frontend saves it in that browser's localStorage; sharing the invite does not share host access.
A host uses one stable participant identity, including after a page reload.

Listeners subscribe to audio and exchange chat, hand-raise and sky state messages over LiveKit's
data channel. Only the host and up to five promoted listeners may publish microphone audio.
Camera, screen sharing and participant metadata updates are excluded from these grants.
Concurrent promotions are serialized within each room.

Tokens last at most ten minutes for initial connection. LiveKit refreshes tokens for connected clients,
so this does not limit call duration. LiveKit enforces room capacity even when users connect at the
same time. Removing a participant disconnects that session; it is **not a permanent user ban**.
The app has guest names rather than user accounts, so an invite holder can request a new identity.

Expired rooms reject API access immediately. Cleanup closes the LiveKit room once a minute and
retries on provider failures.

## Validation

```sh
npm run test:voice
python tests/voice_proxy.py
npm run typecheck
npm run build
npm test
```

The voice API tests run offline with a fake LiveKit control plane and verify real signed JWTs,
permissions, host authentication, capacity, concurrent promotions, expiry, provider failures,
CORS, validation and rate limiting. Proxy tests exercise the Python routing over HTTP.

To verify real audio, open two separate browser profiles (one can be incognito). Create a room in
one and join using its invite in the other. Check host audio, Raise hand, Give floor, Mute, Remove,
chat and following the presenter's sky. Remote devices and VR require HTTPS and microphone permission.
Offline tests do not verify microphone capture, network traversal or real LiveKit connectivity.

With the Vite app running and LiveKit configured, `npm run test:voice:presence` verifies deafen status
across three isolated browser profiles, including late joins and microphone mute/restore. It uses a
synthetic microphone and closes its temporary LiveKit room afterwards. Participant headphones status
travels over the reliable data channel and is resynchronized when someone joins or reconnects.

## Deployment and current limits

Run one Node process with the environment above, set PUBLIC_URL to the public site, and add any
additional frontend origins to ALLOWED_ORIGINS (comma separated). PUBLIC_URL's origin is allowed
automatically. Serve the site over HTTPS and route /api/rooms to Node, or use the Python proxy.
When hosting Node on another domain, set window.SPX_VOICE_API before the frontend bundle loads.

Rooms and rate limits are stored **in memory**. Restarting Node loses room links and host credentials.
Multiple Node replicas require a shared room store, distributed moderation locking and rate limiting.
Host keys are bearer credentials; this MVP has no user accounts, persistent bans, recordings or chat
history. LiveKit Cloud and self-hosted LiveKit differ in token revocation; consult
https://docs.livekit.io/frontends/reference/tokens-grants/ before deploying a self-hosted service.
