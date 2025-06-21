import { base64ToBytes, bytesToBase64 } from '../Utils/bytes-utils'
import { BaseKeyType } from './base_key_type'

const CLOSED_SESSIONS_MAX = 40
const SESSION_RECORD_VERSION = 'v1'

interface EphemeralKeyPair {
	publicKey: Uint8Array
	privateKey: Uint8Array
}

interface CurrentRatchet {
	ephemeralKeyPair: EphemeralKeyPair
	lastRemoteEphemeralKey: Uint8Array
	previousCounter: number
	rootKey: Uint8Array
}

interface IndexInfo {
	baseKey: Uint8Array
	baseKeyType: BaseKeyType
	closed: number
	used: number
	created: number
	remoteIdentityKey: Uint8Array
}

interface PendingPreKey {
	baseKey: Uint8Array
	[key: string]: any
}

interface Chain {
	chainKey: {
		counter: number
		key: Uint8Array | null
	}
	chainType: number
	messageKeys: { [key: string]: Uint8Array }
}

export class SessionEntry {
	registrationId?: number
	currentRatchet!: CurrentRatchet
	indexInfo!: IndexInfo
	pendingPreKey?: PendingPreKey
	private _chains: { [key: string]: Chain } = {}

	toString(): string {
		const baseKey = this.indexInfo?.baseKey && bytesToBase64(this.indexInfo.baseKey)
		return `<SessionEntry [baseKey=${baseKey}]>`
	}

	addChain(key: Uint8Array, value: Chain): void {
		const id = bytesToBase64(key)
		if (this._chains.hasOwnProperty(id)) {
			throw new Error('Overwrite attempt')
		}

		this._chains[id] = value
	}

	getChain(key: Uint8Array): Chain | undefined {
		return this._chains[bytesToBase64(key)]
	}

	deleteChain(key: Uint8Array): void {
		const id = bytesToBase64(key)
		if (!this._chains.hasOwnProperty(id)) {
			throw new ReferenceError('Not Found')
		}

		delete this._chains[id]
	}

	*chains(): IterableIterator<[Uint8Array, Chain]> {
		for (const [k, v] of Object.entries(this._chains)) {
			yield [base64ToBytes(k), v]
		}
	}

	serialize(): any {
		const data: any = {
			registrationId: this.registrationId,
			currentRatchet: {
				ephemeralKeyPair: {
					pubKey: bytesToBase64(this.currentRatchet.ephemeralKeyPair.publicKey),
					privKey: bytesToBase64(this.currentRatchet.ephemeralKeyPair.privateKey)
				},
				lastRemoteEphemeralKey: bytesToBase64(this.currentRatchet.lastRemoteEphemeralKey),
				previousCounter: this.currentRatchet.previousCounter,
				rootKey: bytesToBase64(this.currentRatchet.rootKey)
			},
			indexInfo: {
				baseKey: bytesToBase64(this.indexInfo.baseKey),
				baseKeyType: this.indexInfo.baseKeyType,
				closed: this.indexInfo.closed,
				used: this.indexInfo.used,
				created: this.indexInfo.created,
				remoteIdentityKey: bytesToBase64(this.indexInfo.remoteIdentityKey)
			},
			_chains: this.serializeChains(this._chains)
		}
		if (this.pendingPreKey) {
			data.pendingPreKey = { ...this.pendingPreKey }
			data.pendingPreKey.baseKey = bytesToBase64(this.pendingPreKey.baseKey)
		}

		return data
	}

	static deserialize(data: any): SessionEntry {
		const obj = new this()
		obj.registrationId = data.registrationId
		obj.currentRatchet = {
			ephemeralKeyPair: {
				publicKey: base64ToBytes(data.currentRatchet.ephemeralKeyPair.pubKey),
				privateKey: base64ToBytes(data.currentRatchet.ephemeralKeyPair.privKey)
			},
			lastRemoteEphemeralKey: base64ToBytes(data.currentRatchet.lastRemoteEphemeralKey),
			previousCounter: data.currentRatchet.previousCounter,
			rootKey: base64ToBytes(data.currentRatchet.rootKey)
		}
		obj.indexInfo = {
			baseKey: base64ToBytes(data.indexInfo.baseKey),
			baseKeyType: data.indexInfo.baseKeyType,
			closed: data.indexInfo.closed,
			used: data.indexInfo.used,
			created: data.indexInfo.created,
			remoteIdentityKey: base64ToBytes(data.indexInfo.remoteIdentityKey)
		}
		obj._chains = this.deserializeChains(data._chains)
		if (data.pendingPreKey) {
			obj.pendingPreKey = { ...data.pendingPreKey }
			obj.pendingPreKey!.baseKey = base64ToBytes(data.pendingPreKey.baseKey)
		}

		return obj
	}

	private serializeChains(chains: { [key: string]: Chain }): any {
		const r: any = {}
		for (const key of Object.keys(chains)) {
			const c = chains[key]
			const messageKeys: { [key: string]: string } = {}
			for (const [idx, key] of Object.entries(c.messageKeys)) {
				messageKeys[idx] = bytesToBase64(key)
			}

			r[key] = {
				chainKey: {
					counter: c.chainKey.counter,
					key: c.chainKey.key && bytesToBase64(c.chainKey.key)
				},
				chainType: c.chainType,
				messageKeys: messageKeys
			}
		}

		return r
	}

	private static deserializeChains(chainsData: any): {
		[key: string]: Chain
	} {
		const r: { [key: string]: Chain } = {}
		for (const key of Object.keys(chainsData)) {
			const c = chainsData[key]
			const messageKeys: { [key: string]: Uint8Array } = {}
			for (const [idx, key] of Object.entries(c.messageKeys)) {
				messageKeys[idx] = base64ToBytes(key as string)
			}

			r[key] = {
				chainKey: {
					counter: c.chainKey.counter,
					key: c.chainKey.key && base64ToBytes(c.chainKey.key)
				},
				chainType: c.chainType,
				messageKeys: messageKeys
			}
		}

		return r
	}
}

interface Migration {
	version: string
	migrate: (data: any) => void
}

const migrations: Migration[] = [
	{
		version: 'v1',
		migrate: (data: any) => {
			const sessions = data._sessions
			if (data.registrationId) {
				for (const key in sessions) {
					if (!sessions[key].registrationId) {
						sessions[key].registrationId = data.registrationId
					}
				}
			} else {
				for (const key in sessions) {
					if (sessions[key].indexInfo.closed === -1) {
						console.error(
							'V1 session storage migration error: registrationId',
							data.registrationId,
							'for open session version',
							data.version
						)
					}
				}
			}
		}
	}
]

export class SessionRecord {
	sessions: { [key: string]: SessionEntry } = {}
	version: string = SESSION_RECORD_VERSION

	static createEntry(): SessionEntry {
		return new SessionEntry()
	}

	static migrate(data: any): void {
		let run = data.version === undefined
		for (let i = 0; i < migrations.length; ++i) {
			if (run) {
				console.info('Migrating session to:', migrations[i].version)
				migrations[i].migrate(data)
			} else if (migrations[i].version === data.version) {
				run = true
			}
		}

		if (!run) {
			throw new Error('Error migrating SessionRecord')
		}
	}

	static deserialize(data: any): SessionRecord {
		if (data.version !== SESSION_RECORD_VERSION) {
			this.migrate(data)
		}

		const obj = new this()
		if (data._sessions) {
			for (const [key, entry] of Object.entries(data._sessions)) {
				obj.sessions[key] = SessionEntry.deserialize(entry)
			}
		}

		return obj
	}

	serialize(): any {
		const _sessions: { [key: string]: any } = {}
		for (const [key, entry] of Object.entries(this.sessions)) {
			_sessions[key] = entry.serialize()
		}

		return {
			_sessions,
			version: this.version
		}
	}

	haveOpenSession(): boolean {
		const openSession = this.getOpenSession()
		return !!openSession && typeof openSession.registrationId === 'number'
	}

	getSession(key: Uint8Array): SessionEntry | undefined {
		const session = this.sessions[bytesToBase64(key)]
		if (session && session.indexInfo.baseKeyType === BaseKeyType.OURS) {
			throw new Error('Tried to lookup a session using our basekey')
		}

		return session
	}

	getOpenSession(): SessionEntry | undefined {
		for (const session of Object.values(this.sessions)) {
			if (!this.isClosed(session)) {
				return session
			}
		}
	}

	setSession(session: SessionEntry): void {
		this.sessions[bytesToBase64(session.indexInfo.baseKey)] = session
	}

	getSessions(): SessionEntry[] {
		return Array.from(Object.values(this.sessions)).sort((a, b) => {
			const aUsed = a.indexInfo.used || 0
			const bUsed = b.indexInfo.used || 0
			return aUsed === bUsed ? 0 : aUsed < bUsed ? 1 : -1
		})
	}

	closeSession(session: SessionEntry): void {
		if (this.isClosed(session)) {
			console.warn('Session already closed', session)
			return
		}

		console.info('Closing session:', session)
		session.indexInfo.closed = Date.now()
	}

	openSession(session: SessionEntry): void {
		if (!this.isClosed(session)) {
			console.warn('Session already open')
		}

		console.info('Opening session:', session)
		session.indexInfo.closed = -1
	}

	isClosed(session: SessionEntry): boolean {
		return session.indexInfo.closed !== -1
	}

	removeOldSessions(): void {
		while (Object.keys(this.sessions).length > CLOSED_SESSIONS_MAX) {
			let oldestKey: string | undefined
			let oldestSession: SessionEntry | undefined
			for (const [key, session] of Object.entries(this.sessions)) {
				if (
					session.indexInfo.closed !== -1 &&
					(!oldestSession || session.indexInfo.closed < oldestSession.indexInfo.closed)
				) {
					oldestKey = key
					oldestSession = session
				}
			}

			if (oldestKey) {
				console.info('Removing old closed session:', oldestSession)
				delete this.sessions[oldestKey]
			} else {
				throw new Error('Corrupt sessions object')
			}
		}
	}

	deleteAllSessions(): void {
		for (const key of Object.keys(this.sessions)) {
			delete this.sessions[key]
		}
	}
}
