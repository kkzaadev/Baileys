import { Boom } from '@hapi/boom'
import { createWhatsAppClient, initWasmEngine, type WasmWhatsAppClient } from 'whatsapp-rust-bridge'
import { DEFAULT_CONNECTION_CONFIG } from '../Defaults/index'
import type { ConnectionState, UserFacingSocketConfig } from '../Types'
import { DisconnectReason } from '../Types'
import { makeEventBuffer } from '../Utils/event-buffer'
import { makeBlockingMethods } from './blocking'
import { makeChatActionMethods } from './chat-actions'
import { makeContactMethods } from './contacts'
import { makeEventHandler } from './events'
import { makeGroupMethods } from './groups'
import { makeMessageMethods } from './messages'
import { makeNewsletterMethods } from './newsletter'
import { makePresenceMethods } from './presence'
import { makeProfileMethods } from './profile'
import { makeHttpClient, makeTransport } from './transport'
import type { SocketContext } from './types'

let wasmInitialized = false

const makeWASocket = (config: UserFacingSocketConfig) => {
	const fullConfig = { ...DEFAULT_CONNECTION_CONFIG, ...config }
	const { auth, logger } = fullConfig

	const ev = makeEventBuffer()
	let client: WasmWhatsAppClient | undefined
	let user: { id?: string; lid?: string } | undefined

	// Shared context for all method factories
	const ctx: SocketContext = {
		ev,
		logger,
		fullConfig,
		getUser: () => user,
		setUser: u => {
			user = u
		},
		ensureInit: async () => {
			await initPromise
			if (initError) {
				throw new Boom('Bridge client failed to initialize: ' + initError.message, { statusCode: 500 })
			}
		},
		getClient: () => {
			if (!client) throw new Boom('Client not initialized', { statusCode: 500 })
			return client
		}
	}

	const handleEvent = makeEventHandler(ctx)

	// Initialize bridge client
	const init = async () => {
		if (!wasmInitialized) {
			initWasmEngine(logger)
			wasmInitialized = true
		}

		ev.emit('connection.update', { connection: 'connecting' } as Partial<ConnectionState>)

		if (auth.creds.me) {
			user = { id: auth.creds.me.id, lid: auth.creds.me.lid }
		}

		const bridgeStore = auth.store ?? null
		client = await createWhatsAppClient(
			makeTransport(fullConfig),
			makeHttpClient(fullConfig),
			handleEvent,
			bridgeStore,
			fullConfig.cache ?? null
		)

		// Set device props from Baileys browser config (e.g. Browsers.macOS('Chrome'))
		// browser is [osName, browserName, osVersion]
		const [osName, browserName] = fullConfig.browser
		await client.setDeviceProps(osName, browserName)

		// Pass user-configured WA version to bridge
		const [major, minor, patch] = fullConfig.version
		client.setVersion(major, minor, patch)

		client.run()
	}

	let initError: Error | undefined
	const initPromise = init().catch(err => {
		initError = err instanceof Error ? err : new Error(String(err))
		logger.error({ err }, 'failed to initialize bridge client')
	})

	// End/cleanup — guards against double-free
	const end = async () => {
		const c = client
		client = undefined // prevent double-free
		if (c) {
			try {
				await c.disconnect()
			} catch {
				/* ignore */
			}

			try {
				c.free()
			} catch {
				/* ignore if already freed */
			}
		}
	}

	// Logout — disconnect, clear creds, and emit loggedOut
	const logout = async (msg?: string) => {
		const creds = auth.creds
		creds.me = undefined
		creds.registered = false
		ev.emit('creds.update', creds)
		ev.emit('connection.update', {
			connection: 'close',
			lastDisconnect: {
				error: new Boom(msg || 'Logged out', { statusCode: DisconnectReason.loggedOut }),
				date: new Date()
			}
		} as Partial<ConnectionState>)
		await end()
	}

	// Wait for a specific connection state
	const waitForConnectionUpdate = (check: (update: Partial<ConnectionState>) => boolean, timeoutMs?: number) => {
		return new Promise<void>((resolve, reject) => {
			let timeout: NodeJS.Timeout | undefined
			const listener = (update: Partial<ConnectionState>) => {
				if (check(update)) {
					ev.off('connection.update', listener)
					if (timeout) clearTimeout(timeout)
					resolve()
				}
			}

			ev.on('connection.update', listener)
			if (timeoutMs) {
				timeout = setTimeout(() => {
					ev.off('connection.update', listener)
					reject(new Boom('Timed out waiting for connection update', { statusCode: 408 }))
				}, timeoutMs)
			}
		})
	}

	return {
		ev,
		logger,
		get user() {
			return user
		},
		/** Whether the WebSocket is currently connected */
		get isConnected() {
			return client?.isConnected() ?? false
		},
		/** Whether the client has completed pairing */
		get isLoggedIn() {
			return client?.isLoggedIn() ?? false
		},
		end,
		logout,
		waitForConnectionUpdate,
		/** Enable or disable automatic reconnection (enabled by default) */
		setAutoReconnect: (enabled: boolean) => {
			client?.setAutoReconnect(enabled)
		},
		/** Alias for sendPresence (original Baileys compat) */
		sendPresenceUpdate: (presence: 'available' | 'unavailable') => {
			return ctx.getClient().sendPresence(presence)
		},
		/** Fetch all privacy settings as a key-value map */
		fetchPrivacySettings: async () => {
			return ctx.getClient().fetchPrivacySettings()
		},
		/** Update last seen privacy */
		updateLastSeenPrivacy: async (value: string) => {
			await ctx.getClient().updatePrivacySetting('last', value)
		},
		/** Update online privacy */
		updateOnlinePrivacy: async (value: string) => {
			await ctx.getClient().updatePrivacySetting('online', value)
		},
		/** Update profile picture privacy */
		updateProfilePicturePrivacy: async (value: string) => {
			await ctx.getClient().updatePrivacySetting('profile', value)
		},
		/** Update status privacy */
		updateStatusPrivacy: async (value: string) => {
			await ctx.getClient().updatePrivacySetting('status', value)
		},
		/** Update read receipts privacy */
		updateReadReceiptsPrivacy: async (value: string) => {
			await ctx.getClient().updatePrivacySetting('readreceipts', value)
		},
		/** Update groups add privacy */
		updateGroupsAddPrivacy: async (value: string) => {
			await ctx.getClient().updatePrivacySetting('groupadd', value)
		},
		/** Update default disappearing messages duration (seconds). 0 to disable. */
		updateDefaultDisappearingMode: async (duration: number) => {
			await ctx.getClient().updateDefaultDisappearingMode(duration)
		},
		/** Reject an incoming call */
		rejectCall: async (callId: string, callFrom: string) => {
			await ctx.getClient().rejectCall(callId, callFrom)
		},
		/** Fetch user status/about text */
		fetchStatus: async (...jids: string[]) => {
			return ctx.getClient().fetchStatus(jids) as Promise<Array<{ jid: string; status?: string }>>
		},
		/** Get business profile for a JID */
		getBusinessProfile: async (jid: string) => {
			return ctx.getClient().getBusinessProfile(jid)
		},
		/** Request on-demand message history from primary phone */
		fetchMessageHistory: async (
			count: number,
			oldestMsgKey: { remoteJid?: string | null; id?: string | null; fromMe?: boolean | null },
			oldestMsgTimestamp: number
		) => {
			return ctx
				.getClient()
				.fetchMessageHistory(
					count,
					oldestMsgKey.remoteJid || '',
					oldestMsgKey.id || '',
					oldestMsgKey.fromMe || false,
					oldestMsgTimestamp
				)
		},
		/** Set who can add members to a group */
		groupMemberAddMode: async (jid: string, mode: 'admin_add' | 'all_member_add') => {
			await ctx.getClient().groupMemberAddMode(jid, mode)
		},
		...makeMessageMethods(ctx),
		...makeGroupMethods(ctx),
		...makeContactMethods(ctx),
		...makeProfileMethods(ctx),
		...makeChatActionMethods(ctx),
		...makePresenceMethods(ctx),
		...makeBlockingMethods(ctx),
		...makeNewsletterMethods(ctx)
	}
}

export default makeWASocket
