# Baileyrs (Rust Fork)

A WhatsApp Web API library powered by a Rust/WASM bridge for protocol handling, encryption, and media operations.

> **This is a fork of [Baileys](https://github.com/WhiskeySockets/Baileys)** that replaces internal JavaScript protocol logic with [whatsapp-rust](https://github.com/jlucaso1/whatsapp-rust) compiled to WASM via [whatsapp-rust-bridge](https://github.com/WhiskeySockets/whatsapp-rust-bridge/tree/full-client-wasm).

## What's Different

| Area | Original Baileys | This Fork |
|---|---|---|
| Signal Protocol | JS (libsignal) | Rust/WASM |
| Media encrypt/decrypt | Node.js crypto | Rust AES-256-CBC + HMAC |
| Media upload/download | JS fetch + temp files | Rust with CDN failover, auth refresh, resumable upload |
| Key management | JS auth state | Rust `PersistenceManager` |
| Auto-reconnect | Manual `startSock()` loop | Built-in with fibonacci backoff |

## Install

```
yarn add baileyrs  # or your fork's package name
```

Then import:
```ts
import makeWASocket from 'baileyrs'
```

## Quick Start

```ts
import makeWASocket, { DisconnectReason, useMultiFileAuthState } from 'baileyrs'
import { Boom } from '@hapi/boom'

const { state, saveCreds } = await useMultiFileAuthState('auth_info')
const sock = makeWASocket({ auth: state })

sock.ev.on('creds.update', saveCreds)

sock.ev.on('connection.update', ({ connection, lastDisconnect }) => {
    if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode
        if (statusCode === DisconnectReason.loggedOut) {
            console.log('Logged out')
        }
        // Auto-reconnect is handled by the Rust engine — no need to call makeWASocket again
    }
    if (connection === 'open') {
        console.log('Connected')
    }
})

sock.ev.on('messages.upsert', ({ messages }) => {
    for (const msg of messages) {
        console.log('received message', msg.key.id)
    }
})
```

## Connecting

### QR Code

```ts
const sock = makeWASocket({
    auth: state,
    browser: Browsers.ubuntu('My App')
})
```

A QR code will be emitted via `connection.update` events. Scan it with your phone.

### Pairing Code

```ts
const sock = makeWASocket({ auth: state })

if (!sock.isLoggedIn) {
    const code = await sock.requestPairingCode('5511999999999')
    console.log('Pairing code:', code)
}
```

## Auth State

All crypto keys and Signal sessions are managed by the Rust bridge. The JS auth state only tracks user identity (`me`) for reconnection.

```ts
import { useMultiFileAuthState } from 'baileyrs'

const { state, saveCreds } = await useMultiFileAuthState('auth_folder')
const sock = makeWASocket({ auth: state })
sock.ev.on('creds.update', saveCreds)
```

Files created in `auth_folder/`:
- `creds.json` — User identity (me, registered status)
- `device-*.bin` — Rust device state (noise keys, identity, etc.)
- `session-*.bin` — Signal sessions
- `identity-*.bin` — Signal identity keys
- `pre-key-*.bin` — Signal pre-keys
- `sender-key-*.bin` — Group sender keys

## Sending Messages

```ts
// Text
await sock.sendMessage(jid, { text: 'Hello!' })

// Quote
await sock.sendMessage(jid, { text: 'Reply' }, { quoted: msg })

// Mention
await sock.sendMessage(jid, {
    text: '@12345678901',
    mentions: ['12345678901@s.whatsapp.net']
})

// Forward
await sock.sendMessage(jid, { forward: msg })

// Location
await sock.sendMessage(jid, {
    location: { degreesLatitude: 24.12, degreesLongitude: 55.11 }
})

// Contact
await sock.sendMessage(jid, {
    contacts: {
        displayName: 'Jeff',
        contacts: [{ vcard: 'BEGIN:VCARD\nVERSION:3.0\nFN:Jeff\nEND:VCARD' }]
    }
})

// Reaction
await sock.sendMessage(jid, { react: { text: '💖', key: msg.key } })

// Poll
await sock.sendMessage(jid, {
    poll: { name: 'My Poll', values: ['Yes', 'No'], selectableCount: 1 }
})

// Delete (for everyone)
await sock.sendMessage(jid, { delete: msg.key })

// Edit
await sock.sendMessage(jid, { text: 'updated text', edit: msg.key })

// Disappearing messages
await sock.sendMessage(jid, { disappearingMessagesInChat: 604800 }) // 7 days
```

### Media Messages

Media encryption, upload, and CDN failover are handled entirely by the Rust bridge.

```ts
// Image
await sock.sendMessage(jid, { image: readFileSync('photo.jpg'), caption: 'Hello' })

// Video
await sock.sendMessage(jid, { video: { url: './clip.mp4' }, caption: 'Watch this' })

// Audio
await sock.sendMessage(jid, { audio: { url: './audio.ogg' }, mimetype: 'audio/ogg; codecs=opus' })

// Document
await sock.sendMessage(jid, {
    document: { url: './file.pdf' },
    mimetype: 'application/pdf',
    fileName: 'report.pdf'
})

// View once
await sock.sendMessage(jid, { image: { url: './photo.jpg' }, viewOnce: true })

// GIF (mp4 with gifPlayback)
await sock.sendMessage(jid, { video: readFileSync('anim.mp4'), gifPlayback: true })
```

> Thumbnails are auto-generated for images (requires `jimp` or `sharp`). Video thumbnails need `ffmpeg` on your system, or provide `jpegThumbnail` directly.

#### Streaming Upload (Large Files)

For files that are too large to buffer in memory, pass a `processMedia` hook to `sendMessage`:

```ts
await sock.sendMessage(jid, { video: readFileSync('large-video.mp4') }, {
    processMedia: async (buffer, mediaType, waClient) => {
        const { Writable } = await import('node:stream')
        const fs = await import('node:fs')
        const os = await import('node:os')
        const path = await import('node:path')

        const tmpEnc = path.join(os.tmpdir(), `enc-${Date.now()}`)

        // Streaming encrypt → temp file (constant ~40KB memory)
        const input = new Blob([new Uint8Array(buffer)]).stream()
        const output = Writable.toWeb(fs.createWriteStream(tmpEnc))
        const enc = await waClient.encryptMediaStream(input, output, mediaType)

        // Upload from temp file
        const encData = await fs.promises.readFile(tmpEnc)
        await fs.promises.unlink(tmpEnc)

        const upload = await waClient.uploadEncryptedMediaStream(
            () => new Blob([new Uint8Array(encData)]).stream(),
            enc.mediaKey, enc.fileSha256, enc.fileEncSha256, enc.fileLength, mediaType
        )

        return { upload: { ...upload, ...enc } }
    }
})
```

### Downloading Media

The recommended way to download media is via the socket method — it handles CDN failover, auth refresh, HMAC verification, and media re-upload automatically:

```ts
// Buffer (recommended)
const buffer = await sock.downloadMedia(msg, 'buffer')
await writeFile('photo.jpg', buffer)

// Stream
const stream = await sock.downloadMedia(msg, 'stream')
for await (const chunk of stream) {
    // process chunk — only ~64KB in memory at a time
}
```

<details>
<summary>Advanced: standalone utility (for use without a socket)</summary>

If you need to download media outside of a socket context (e.g., custom logger or reupload logic), use the standalone `downloadMediaMessage` utility:

```ts
import { downloadMediaMessage } from 'baileyrs'

const buffer = await downloadMediaMessage(msg, 'buffer', {}, {
    logger: sock.logger,
    reuploadRequest: m => sock.updateMediaMessage(m),
    waClient: sock.waClient!
})
```

</details>

### Re-upload Expired Media
```ts
await sock.updateMediaMessage(msg)
```

## Read Receipts

```ts
await sock.readMessages([{ remoteJid: msg.key.remoteJid!, id: msg.key.id! }])
```

## Presence

```ts
// Online/offline
await sock.sendPresenceUpdate('available')
await sock.sendPresenceUpdate('unavailable')

// Subscribe to a contact's presence
await sock.presenceSubscribe(jid)

// Typing indicator
await sock.sendChatState(jid, 'composing')
await sock.sendChatState(jid, 'paused')
```

## Chat Actions

```ts
await sock.pinChat(jid, true)
await sock.muteChat(jid, 8 * 60 * 60 * 1000) // mute 8h
await sock.muteChat(jid, null)                 // unmute
await sock.archiveChat(jid, true)
await sock.starMessage(jid, msgId, true)
```

## Reject Calls

```ts
await sock.rejectCall(callId, callFrom)
```

## User Queries

```ts
// Check if on WhatsApp
const [result] = await sock.onWhatsApp('+1234567890')
if (result.exists) console.log('JID:', result.jid)

// Fetch status
const status = await sock.fetchStatus(jid)

// Profile picture
const url = await sock.profilePictureUrl(jid, 'image')

// Business profile
const profile = await sock.getBusinessProfile(jid)

// On-demand history (messages arrive via messaging-history.set event)
await sock.fetchMessageHistory(50, oldestMsg.key, oldestMsg.messageTimestamp)
```

## Profile

```ts
await sock.setPushName('My Name')
await sock.updateProfileStatus('Hello World!')
await sock.updateProfilePicture(jid, imageBytes)
await sock.removeProfilePicture()
```

## Groups

```ts
// Create
const group = await sock.groupCreate('Group Name', ['1234@s.whatsapp.net'])

// Participants
await sock.groupParticipantsUpdate(jid, ['1234@s.whatsapp.net'], 'add')    // or 'remove', 'promote', 'demote'

// Metadata
const metadata = await sock.groupMetadata(jid)
const all = await sock.groupFetchAllParticipating()

// Settings
await sock.groupUpdateSubject(jid, 'New Name')
await sock.groupUpdateDescription(jid, 'New Description')
await sock.groupSettingUpdate(jid, 'announce', true)   // only admins send
await sock.groupSettingUpdate(jid, 'locked', true)      // only admins edit settings
await sock.groupToggleEphemeral(jid, 604800)            // 7 days
await sock.groupMemberAddMode(jid, 'admin_add')         // or 'all_member_add'

// Invite
const code = await sock.groupInviteCode(jid)
const newCode = await sock.groupRevokeInvite(jid)
const response = await sock.groupAcceptInvite(code)
const info = await sock.groupGetInviteInfo(code)

// Join requests
const requests = await sock.groupRequestParticipantsList(jid)
await sock.groupRequestParticipantsUpdate(jid, ['1234@s.whatsapp.net'], 'approve')

// Leave
await sock.groupLeave(jid)
```

## Privacy

```ts
// Block/unblock
await sock.updateBlockStatus(jid, 'block')
await sock.updateBlockStatus(jid, 'unblock')

// Fetch
const settings = await sock.fetchPrivacySettings()
const blocklist = await sock.fetchBlocklist()

// Update privacy settings
await sock.updateLastSeenPrivacy('contacts')        // 'all' | 'contacts' | 'contact_blacklist' | 'none'
await sock.updateOnlinePrivacy('all')                // 'all' | 'match_last_seen'
await sock.updateProfilePicturePrivacy('contacts')
await sock.updateStatusPrivacy('contacts')
await sock.updateReadReceiptsPrivacy('all')          // 'all' | 'none'
await sock.updateGroupsAddPrivacy('contacts')
await sock.updateDefaultDisappearingMode(604800)     // seconds, 0 to disable
```

## Newsletters (Channels)

```ts
const channel = await sock.newsletterCreate('My Channel', 'Description')
const meta = await sock.newsletterMetadata(jid)
await sock.newsletterSubscribe(jid)
await sock.newsletterUnsubscribe(jid)
```

## WASM Memory Monitoring

```ts
import { getWasmMemoryBytes } from 'whatsapp-rust-bridge'

// Get WASM linear memory usage
const wasmBytes = getWasmMemoryBytes()
console.log(`WASM memory: ${(wasmBytes / 1024 / 1024).toFixed(1)} MB`)
```

## Socket Config

```ts
const sock = makeWASocket({
    // Required
    auth: state,

    // Connection
    waWebSocketUrl: 'wss://web.whatsapp.com/ws/chat',
    connectTimeoutMs: 20_000,
    keepAliveIntervalMs: 30_000,
    agent: httpsAgent,

    // Identity
    version: [2, 3000, 1035194821],
    browser: Browsers.macOS('Chrome'),

    // Events
    emitOwnEvents: true,
    shouldIgnoreJid: jid => false,

    // Proxy
    options: { dispatcher: undiciAgent },

    // Cache (Rust-side, see CacheConfig type)
    cache: { group: { ttlSecs: 7200 } }
})
```

## License

MIT License - See [LICENSE](LICENSE) for details.
