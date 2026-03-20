import { Boom } from '@hapi/boom'
import {
	createWhatsAppClient,
	initWasmEngine,
	type WasmWhatsAppClient,
} from 'whatsapp-rust-bridge'
import { DEFAULT_CONNECTION_CONFIG } from '../Defaults/index'
import type { ConnectionState, UserFacingSocketConfig } from '../Types'
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
import { makeTransport, makeHttpClient } from './transport'
import type { SocketContext } from './types'

let wasmInitialized = false

const makeWASocket = (config: UserFacingSocketConfig) => {
	const fullConfig = { ...DEFAULT_CONNECTION_CONFIG, ...config }
	const { auth, logger } = fullConfig

	const ev = makeEventBuffer(logger)
	let client: WasmWhatsAppClient | undefined
	let user: { id?: string; lid?: string } | undefined

	// Shared context for all method factories
	const ctx: SocketContext = {
		ev,
		logger,
		fullConfig,
		getUser: () => user,
		setUser: (u) => { user = u },
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
			initWasmEngine()
			wasmInitialized = true
		}

		ev.emit('connection.update', { connection: 'connecting' } as Partial<ConnectionState>)

		if (auth.creds.me) {
			user = { id: auth.creds.me.id, lid: auth.creds.me.lid }
		}

		client = await createWhatsAppClient(
			makeTransport(fullConfig),
			makeHttpClient(fullConfig),
			handleEvent
		)

		client.run()
	}

	let initError: Error | undefined
	const initPromise = init().catch(err => {
		initError = err instanceof Error ? err : new Error(String(err))
		logger.error({ err }, 'failed to initialize bridge client')
	})

	// End/cleanup
	const end = async (_error?: Error) => {
		if (client) {
			try { await client.disconnect() } catch { /* ignore */ }
			client.free()
			client = undefined
		}
	}

	return {
		ev,
		logger,
		get user() { return user },
		end,
		...makeMessageMethods(ctx),
		...makeGroupMethods(ctx),
		...makeContactMethods(ctx),
		...makeProfileMethods(ctx),
		...makeChatActionMethods(ctx),
		...makePresenceMethods(ctx),
		...makeBlockingMethods(ctx),
		...makeNewsletterMethods(ctx),
	}
}

export default makeWASocket
