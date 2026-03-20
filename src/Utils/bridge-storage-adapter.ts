/**
 * Adapter that wraps Baileys' auth state into the bridge's
 * SignalStorage + MessageDecryptionContext interfaces.
 *
 * The bridge expects raw bytes for sessions/keys, while Baileys
 * stores them as deserialized objects. This adapter handles the conversion.
 */
import type { SignalAuthState, SignalKeyStoreWithTransaction } from '../Types'
import type { SignalRepositoryWithLIDStore } from '../Types/Signal'
import { generateSignalPubKey } from './crypto'

/**
 * Convert snake_case keys to camelCase, recursively.
 * Used to convert prost/serde output to Baileys-compatible format.
 */
export function snakeToCamelDeep(obj: any): any {
	if (obj === null || obj === undefined) return obj
	if (obj instanceof Uint8Array || ArrayBuffer.isView(obj)) return obj
	// Convert BigInt to Number (lossy for >2^53, matches protobufjs behavior)
	if (typeof obj === 'bigint') return Number(obj)
	if (Array.isArray(obj)) return obj.map(snakeToCamelDeep)
	if (typeof obj === 'object') {
		const result: any = {}
		for (const [key, value] of Object.entries(obj)) {
			const camelKey = key.replace(/_([a-z])/g, (_, l: string) => l.toUpperCase())
			result[camelKey] = snakeToCamelDeep(value)
		}

		return result
	}

	return obj
}

/**
 * Create a MessageDecryptionContext that the bridge's `decryptMessageStanza` can use.
 *
 * This bridges between Baileys' auth state and the bridge's SignalStorage interface,
 * plus adds the LID mapping and SKDM processing callbacks.
 */
export function createBridgeDecryptionContext(auth: SignalAuthState, signalRepository: SignalRepositoryWithLIDStore) {
	const { creds, keys } = auth
	const parsedKeys = keys as SignalKeyStoreWithTransaction

	return {
		// --- SignalStorage interface (raw bytes) ---

		async loadSession(address: string): Promise<Uint8Array | null | undefined> {
			try {
				const result = await parsedKeys.get('session', [address])
				const sess = result[address]
				return sess ? new Uint8Array(sess) : null
			} catch {
				return null
			}
		},

		storeSession(address: string, _record: any): Promise<void> {
			// The bridge passes a SessionRecord wasm object, we need to serialize it
			const serialized = _record.serialize ? _record.serialize() : _record
			return parsedKeys.set({ session: { [address]: serialized } }) as Promise<void>
		},

		storeSessionRaw(address: string, data: Uint8Array): Promise<void> {
			return parsedKeys.set({ session: { [address]: data } }) as Promise<void>
		},

		getOurIdentity() {
			const { signedIdentityKey } = creds
			return {
				pubKey: new Uint8Array(generateSignalPubKey(signedIdentityKey.public)),
				privKey: new Uint8Array(signedIdentityKey.private)
			}
		},

		getOurRegistrationId(): number {
			return creds.registrationId
		},

		isTrustedIdentity(_name: string, _identityKey: Uint8Array, _direction: number): boolean {
			return true // TOFU
		},

		async loadPreKey(id: number) {
			const keyId = id.toString()
			const result = await parsedKeys.get('pre-key', [keyId])
			const key = result[keyId]
			if (key) {
				return {
					pubKey: new Uint8Array(key.public),
					privKey: new Uint8Array(key.private)
				}
			}

			return null
		},

		removePreKey(id: number): Promise<void> {
			return parsedKeys.set({ 'pre-key': { [id]: null } }) as Promise<void>
		},

		loadSignedPreKey(_id: number) {
			const key = creds.signedPreKey
			return {
				pubKey: new Uint8Array(key.keyPair.public),
				privKey: new Uint8Array(key.keyPair.private),
				signature: new Uint8Array(key.signature)
			}
		},

		async loadSenderKey(keyId: string): Promise<Uint8Array | null | undefined> {
			const result = await parsedKeys.get('sender-key', [keyId])
			const key = result[keyId]
			return key ? new Uint8Array(key) : null
		},

		async storeSenderKey(keyId: string, record: Uint8Array): Promise<void> {
			await parsedKeys.set({ 'sender-key': { [keyId]: record } })
		},

		// --- MessageDecryptionContext extensions ---

		async getLIDForPN(pn: string): Promise<string | null> {
			return signalRepository.lidMapping.getLIDForPN(pn)
		},

		async storeLIDPNMapping(lid: string, pn: string): Promise<void> {
			await signalRepository.lidMapping.storeLIDPNMappings([{ lid, pn }])
		},

		async migrateSession(fromJid: string, toJid: string): Promise<void> {
			await signalRepository.migrateSession(fromJid, toJid)
		},

		async processSenderKeyDistribution(groupId: string, authorJid: string, skdmBytes: Uint8Array): Promise<void> {
			await signalRepository.processSenderKeyDistributionMessage({
				authorJid,
				item: { groupId, axolotlSenderKeyDistributionMessage: skdmBytes }
			})
		}
	}
}
