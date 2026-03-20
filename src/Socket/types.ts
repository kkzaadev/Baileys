import type { WasmWhatsAppClient } from 'whatsapp-rust-bridge'
import type { BaileysEventEmitter, SocketConfig } from '../Types'
import type { ILogger } from '../Utils/logger'

/** Shared context passed to all Socket method factories */
export interface SocketContext {
	ev: BaileysEventEmitter
	logger: ILogger
	fullConfig: SocketConfig
	getUser: () => { id?: string; lid?: string } | undefined
	setUser: (u: { id?: string; lid?: string }) => void
	/** Waits for init and throws if it failed */
	ensureInit: () => Promise<void>
	/** Returns the bridge client, throwing if not initialized */
	getClient: () => WasmWhatsAppClient
}

/** Convert a bridge Jid struct to a string */
export const jidStr = (jid: { user: string; server: string }): string => `${jid.user}@${jid.server}`
