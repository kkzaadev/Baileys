import { jest } from '@jest/globals'
import { Boom } from '@hapi/boom'
import { proto } from '../../WAProto/index.js'
import { makeWASocket, DisconnectReason } from '../index.js'
import { DEFAULT_CONNECTION_CONFIG } from '../Defaults/index.js'

// Mock the WebSocket
jest.mock('../Socket/Client/websocket.js', () => {
	return {
		WebSocketClient: jest.fn().mockImplementation(() => ({
			connect: jest.fn().mockResolvedValue(undefined),
			close: jest.fn(),
			on: jest.fn(),
			off: jest.fn(),
			emit: jest.fn(),
			isOpen: true,
			isClosed: false,
			isClosing: false,
			isConnecting: false,
			send: jest.fn(),
		})),
	}
})

describe('Connection Deadlock', () => {
	it('should not deadlock if history sync is disabled', async () => {
		// Create a simple auth state for testing
		const authState = {
			creds: {
				noiseKey: {
					private: new Uint8Array(32),
					public: new Uint8Array(32)
				},
				pairingEphemeralKeyPair: {
					private: new Uint8Array(32),
					public: new Uint8Array(32)
				},
				signedIdentityKey: {
					private: new Uint8Array(32),
					public: new Uint8Array(32)
				},
				signedPreKey: {
					keyId: 1,
					privateKey: new Uint8Array(32),
					publicKey: new Uint8Array(32),
					signature: new Uint8Array(64)
				},
				registrationId: 12345,
				advSecretKey: 'test',
				me: {
					id: '1234567890@s.whatsapp.net',
					name: 'Test User'
				},
				accountSyncCounter: 0,
				myAppStateKeyId: null
			},
			keys: {
				get: jest.fn().mockResolvedValue({}),
				set: jest.fn().mockResolvedValue(undefined)
			}
		}

		const sock = makeWASocket({
			...DEFAULT_CONNECTION_CONFIG,
			auth: authState,
			// This is the key setting to reproduce the deadlock
			shouldSyncHistoryMessage: () => false,
		})

		const regularMessageListener = jest.fn()
		sock.ev.on('messages.upsert', regularMessageListener)

		// 1. Initial connection opens
		sock.ev.emit('connection.update', { connection: 'open' })

		// 2. Pending notifications are received, which should trigger buffering
		sock.ev.emit('connection.update', { receivedPendingNotifications: true })

		// 3. A history sync notification arrives.
		// With `shouldSyncHistoryMessage: false`, the old code would not flush the buffer.
		// The new code should see this, decide to skip syncing, and flush the buffer.
		const historySyncNotification = proto.WebMessageInfo.fromObject({
			key: { remoteJid: 'status@broadcast', fromMe: false, id: 'hist_sync_1' },
			messageTimestamp: Date.now() / 1000,
			message: {
				protocolMessage: {
					type: proto.Message.ProtocolMessage.Type.HISTORY_SYNC_NOTIFICATION,
					historySyncNotification: {
						syncType: proto.HistorySync.HistorySyncType.RECENT,
					},
				},
			},
		})
		sock.ev.emit('messages.upsert', { messages: [historySyncNotification], type: 'notify' })

		// 4. A regular message arrives *after* the history sync notification.
		// In a deadlock state, this message would be buffered indefinitely.
		const regularMessage = proto.WebMessageInfo.fromObject({
			key: { remoteJid: '12345@s.whatsapp.net', fromMe: false, id: 'regular_msg_1' },
			messageTimestamp: Date.now() / 1000,
			message: { conversation: 'hello' },
		})
		sock.ev.emit('messages.upsert', { messages: [regularMessage], type: 'notify' })

		// Let the event loop run
		await new Promise(resolve => setImmediate(resolve))

		// 5. Assert that the regular message was processed.
		// This will fail if the buffer is deadlocked.
		expect(regularMessageListener).toHaveBeenCalledWith({
			messages: [regularMessage],
			type: 'notify',
		})

		// Cleanup
		sock.ev.removeAllListeners()
	})
})