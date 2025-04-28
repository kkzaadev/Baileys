import { Mutex } from 'async-mutex'
import { proto } from '../../WAProto'
import { bytesToBase64 } from '../Utils/bytes-utils'
import { calculateMAC, Curve, decryptCBC, deriveSecrets, encryptCBC, verifyMAC } from '../Utils/crypto'
import { ChainType } from './chain_type'
import * as errors from './errors'
import { ProtocolAddress } from './protocol_address'
import { SessionBuilder } from './session_builder'
import { SessionEntry, SessionRecord } from './session_record'

const sessionLocks = new Map<string, Mutex>()
function getSessionLock(addr: string): Mutex {
	let mutex = sessionLocks.get(addr)
	if(!mutex) {
		mutex = new Mutex()
		sessionLocks.set(addr, mutex)
	}

	return mutex
}

const VERSION = 3

export class SessionCipher {
	private addr: ProtocolAddress
	private storage: any

	constructor(storage: any, protocolAddress: ProtocolAddress) {
		if(!(protocolAddress instanceof ProtocolAddress)) {
			throw new TypeError('protocolAddress must be a ProtocolAddress')
		}

		this.addr = protocolAddress
		this.storage = storage
	}

	private _encodeTupleByte(number1: number, number2: number): number {
		if(number1 > 15 || number2 > 15) {
			throw TypeError('Numbers must be 4 bits or less')
		}

		return (number1 << 4) | number2
	}

	private _decodeTupleByte(byte: number): [number, number] {
		return [byte >> 4, byte & 0xf]
	}

	public toString(): string {
		return `<SessionCipher(${this.addr.toString()})>`
	}

	public async getRecord(): Promise<SessionRecord | undefined> {
		const record = await this.storage.loadSession(this.addr.toString())
		if(record && !(record instanceof SessionRecord)) {
			throw new TypeError('SessionRecord type expected from loadSession')
		}

		return record
	}

	public async storeRecord(record: SessionRecord): Promise<void> {
		record.removeOldSessions()
		await this.storage.storeSession(this.addr.toString(), record)
	}


	public async encrypt(
		data: Uint8Array
	): Promise<{ type: number, body: Uint8Array, registrationId: number }> {
		const ourIdentityKey = await this.storage.getOurIdentity()
		const fqAddr = this.addr.toString()
		const mutex = getSessionLock(fqAddr)
		return mutex.acquire().then(async(release) => {
			try {
				const record = await this.getRecord()
				if(!record) {
					throw new errors.SessionError('No sessions')
				}

				const session = record.getOpenSession()
				if(!session) {
					throw new errors.SessionError('No open session')
				}

				const remoteIdentityKey = session.indexInfo.remoteIdentityKey
				if(
					!(await this.storage.isTrustedIdentity(this.addr.id, remoteIdentityKey))
				) {
					throw new errors.UntrustedIdentityKeyError(
						this.addr.id,
						bytesToBase64(remoteIdentityKey)
					)
				}

				const chain = session.getChain(
					session.currentRatchet.ephemeralKeyPair.publicKey
				)
				if(!chain || chain?.chainType === ChainType.RECEIVING) {
					throw new Error('Tried to encrypt on a receiving chain')
				}

				await this.fillMessageKeys(chain, chain.chainKey.counter + 1)
				const keys = await deriveSecrets(
					chain.messageKeys[chain.chainKey.counter],
					Buffer.alloc(32),
					Buffer.from('WhisperMessageKeys')
				)
				delete chain.messageKeys[chain.chainKey.counter]
				const msg = proto.SignalMessage.create()
				msg.ratchetKey = session.currentRatchet.ephemeralKeyPair.publicKey
				msg.counter = chain.chainKey.counter
				msg.previousCounter = session.currentRatchet.previousCounter
				msg.ciphertext = await encryptCBC(
					keys[0],
					data,
					keys[2].slice(0, 16)
				)
				const msgBuf = proto.SignalMessage.encode(msg).finish()
				const macInput = Buffer.alloc(msgBuf.byteLength + 33 * 2 + 1)
				macInput.set(ourIdentityKey.pubKey)
				macInput.set(session.indexInfo.remoteIdentityKey, 33)
				macInput[33 * 2] = this._encodeTupleByte(VERSION, VERSION)
				macInput.set(msgBuf, 33 * 2 + 1)
				const mac = await calculateMAC(keys[1], macInput)
				const result = Buffer.alloc(msgBuf.byteLength + 9)
				result[0] = this._encodeTupleByte(VERSION, VERSION)
				result.set(msgBuf, 1)
				result.set(mac.slice(0, 8), msgBuf.byteLength + 1)
				await this.storeRecord(record)
				let type: number, body: Uint8Array
				if(session.pendingPreKey) {
					type = 3 // prekey bundle
					const preKeyMsg = proto.PreKeySignalMessage.create({
						identityKey: ourIdentityKey.pubKey,
						registrationId: await this.storage.getOurRegistrationId(),
						baseKey: session.pendingPreKey.baseKey,
						signedPreKeyId: session.pendingPreKey.signedKeyId,
						message: result,
					})
					if(session.pendingPreKey.preKeyId) {
						preKeyMsg.preKeyId = session.pendingPreKey.preKeyId
					}

					body = Buffer.concat([
						Buffer.from([this._encodeTupleByte(VERSION, VERSION)]),
						Buffer.from(proto.PreKeySignalMessage.encode(preKeyMsg).finish()),
					])
				} else {
					type = 1 // normal
					body = result
				}

				return {
					type,
					body,
					registrationId: session.registrationId ?? 0,
				}
			} finally {
				release()
			}
		})
	}

	public async decryptWithSessions(
		data: Uint8Array,
		sessions: SessionEntry[]
	): Promise<{ session: SessionEntry, plaintext: Uint8Array }> {
		if(!sessions.length) {
			throw new errors.SessionError('No sessions available')
		}

		const errs: Error[] = []
		for(const session of sessions) {
			let plaintext: Uint8Array
			try {
				plaintext = await this.doDecryptWhisperMessage(data, session)
				session.indexInfo.used = Date.now()
				return {
					session,
					plaintext,
				}
			} catch(e) {
				errs.push(e)
			}
		}

		console.error('Failed to decrypt message with any known session...')
		for(const e of errs) {
			console.error('Session error:' + e, e.stack)
		}

		throw new errors.SessionError('No matching sessions found for message')
	}

	public async decryptWhisperMessage(data: Uint8Array): Promise<Uint8Array> {
		const fqAddr = this.addr.toString()
		const mutex = getSessionLock(fqAddr)
		return mutex.acquire().then(async(release) => {
			try {
				const record = await this.getRecord()
				if(!record) {
					throw new errors.SessionError('No session record')
				}

				const result = await this.decryptWithSessions(data, record.getSessions())
				const remoteIdentityKey = result.session.indexInfo.remoteIdentityKey
				if(
					!(await this.storage.isTrustedIdentity(this.addr.id, remoteIdentityKey))
				) {
					throw new errors.UntrustedIdentityKeyError(
						this.addr.id,
						bytesToBase64(remoteIdentityKey)
					)
				}

				if(record.isClosed(result.session)) {
					console.warn('Decrypted message with closed session.')
				}

				await this.storeRecord(record)
				return result.plaintext
			} finally {
				release()
			}
		})
	}

	public async decryptPreKeyWhisperMessage(
		data: Uint8Array
	): Promise<Uint8Array> {
		const versions = this._decodeTupleByte(data[0])
		if(versions[1] > 3 || versions[0] < 3) {
			// min version > 3 or max version < 3
			throw new Error('Incompatible version number on PreKeyWhisperMessage')
		}

		const fqAddr = this.addr.toString()
		const mutex = getSessionLock(fqAddr)
		return mutex.acquire().then(async(release) => {
			try {
				let record = await this.getRecord()
				const preKeyProto = proto.PreKeySignalMessage.decode(data.slice(1))
				if(!record) {
					if(preKeyProto.registrationId === null) {
						throw new Error('No registrationId')
					}

					record = new SessionRecord()
				}

				if(!preKeyProto.message || !preKeyProto.baseKey) {
					throw new Error('No message or baseKey')
				}

				const builder = new SessionBuilder(this.storage, this.addr)
				const preKeyId = await builder.initIncoming(record, preKeyProto)
				const session = record.getSession(preKeyProto.baseKey)
				const plaintext = await this.doDecryptWhisperMessage(
					preKeyProto.message,
					session!
				)
				await this.storeRecord(record)
				if(preKeyId) {
					await this.storage.removePreKey(preKeyId)
				}

				return plaintext
			} finally {
				release()
			}
		})
	}

	private async doDecryptWhisperMessage(
		messageBuffer: Uint8Array,
		session: SessionEntry
	): Promise<Uint8Array> {
		if(!session) {
			throw new TypeError('session required')
		}

		const versions = this._decodeTupleByte(messageBuffer[0])
		if(versions[1] > 3 || versions[0] < 3) {
			// min version > 3 or max version < 3
			throw new Error('Incompatible version number on WhisperMessage')
		}

		const messageProto = messageBuffer.slice(1, -8)
		const message = proto.SignalMessage.decode(messageProto)

		if(!message.ratchetKey || !message.ciphertext || !message.counter) {
			throw new Error('Invalid message')
		}


		await this.maybeStepRatchet(
			session,
			message.ratchetKey,
			message.previousCounter
		)
		const chain = session.getChain(message.ratchetKey)
		if(!chain || chain.chainType === ChainType.SENDING) {
			throw new Error('Tried to decrypt on a sending chain')
		}

		await this.fillMessageKeys(chain, message.counter)
		if(!chain.messageKeys.hasOwnProperty(message.counter)) {
			throw new errors.MessageCounterError('Key used already or never filled')
		}

		const messageKey = chain.messageKeys[message.counter]
		delete chain.messageKeys[message.counter]
		const keys = await deriveSecrets(
			messageKey,
			Buffer.alloc(32),
			Buffer.from('WhisperMessageKeys')
		)
		const ourIdentityKey = await this.storage.getOurIdentity()
		const macInput = Buffer.alloc(messageProto.byteLength + 33 * 2 + 1)
		macInput.set(session.indexInfo.remoteIdentityKey)
		macInput.set(ourIdentityKey.pubKey, 33)
		macInput[33 * 2] = this._encodeTupleByte(VERSION, VERSION)
		macInput.set(messageProto, 33 * 2 + 1)
		await verifyMAC(macInput, keys[1], messageBuffer.slice(-8), 8)
		const plaintext = await decryptCBC(
			keys[0],
			message.ciphertext,
			keys[2].slice(0, 16)
		)
		delete session.pendingPreKey
		return plaintext
	}

	private async fillMessageKeys(chain: any, counter: number): Promise<void> {
		if(chain.chainKey.counter >= counter) {
			return
		}

		if(counter - chain.chainKey.counter > 2000) {
			throw new errors.SessionError('Over 2000 messages into the future!')
		}

		if(chain.chainKey.key === undefined) {
			throw new errors.SessionError('Chain closed')
		}

		const key = chain.chainKey.key
		chain.messageKeys[chain.chainKey.counter + 1] = await calculateMAC(
			key,
			Buffer.from([1])
		)
		chain.chainKey.key = await calculateMAC(key, Buffer.from([2]))
		chain.chainKey.counter += 1
		return this.fillMessageKeys(chain, counter)
	}

	private async maybeStepRatchet(
		session: SessionEntry,
		remoteKey: any,
		previousCounter: any
	): Promise<void> {
		if(session.getChain(remoteKey)) {
			return
		}

		const ratchet = session.currentRatchet
		const previousRatchet = session.getChain(ratchet.lastRemoteEphemeralKey)
		if(previousRatchet) {
			await this.fillMessageKeys(previousRatchet, previousCounter)
			// @ts-ignore
			delete previousRatchet.chainKey.key // Close
		}

		await this.calculateRatchet(session, remoteKey, false)
		const prevCounter = session.getChain(ratchet.ephemeralKeyPair.publicKey)
		if(prevCounter) {
			ratchet.previousCounter = prevCounter.chainKey.counter
			session.deleteChain(ratchet.ephemeralKeyPair.publicKey)
		}

		const ephemeralKeyPair = Curve.generateKeyPair()
		ratchet.ephemeralKeyPair = {
			privateKey: ephemeralKeyPair.private,
			publicKey: ephemeralKeyPair.public,
		}
		await this.calculateRatchet(session, remoteKey, true)
		ratchet.lastRemoteEphemeralKey = remoteKey
	}

	private async calculateRatchet(
		session: SessionEntry,
		remoteKey: any,
		sending: boolean
	): Promise<void> {
		const ratchet = session.currentRatchet
		const sharedSecret = Curve.sign(
			remoteKey,
			ratchet.ephemeralKeyPair.privateKey
		)
		const masterKey = await deriveSecrets(
			sharedSecret,
			ratchet.rootKey,
			Buffer.from('WhisperRatchet'),
			/*chunks*/ 2
		)
		const chainKey = sending ? ratchet.ephemeralKeyPair.publicKey : remoteKey
		session.addChain(chainKey, {
			messageKeys: {},
			chainKey: {
				counter: -1,
				key: masterKey[1],
			},
			chainType: sending ? ChainType.SENDING : ChainType.RECEIVING,
		})
		ratchet.rootKey = masterKey[0]
	}

	public async hasOpenSession(): Promise<boolean> {
		const fqAddr = this.addr.toString()
		const mutex = getSessionLock(fqAddr)
		return mutex.acquire().then(async(release) => {
			try {
				const record = await this.getRecord()
				if(!record) {
					return false
				}

				return record.haveOpenSession()
			} finally {
				release()
			}
		})
	}

	public async closeOpenSession(): Promise<void> {
		const fqAddr = this.addr.toString()
		const mutex = getSessionLock(fqAddr)
		return mutex.acquire().then(async(release) => {
			try {
				const record = await this.getRecord()
				if(record) {
					const openSession = record.getOpenSession()
					if(openSession) {
						record.closeSession(openSession)
						await this.storeRecord(record)
					}
				}
			} finally {
				release()
			}
		})
	}
}
