import { proto } from '../../WAProto'
import { bytesToBase64 } from '../Utils/bytes-utils'
import { deriveSecrets } from '../Utils/crypto'
import { BaseKeyType } from './base_key_type'
import { ChainType } from './chain_type'
import * as curve from './curve'
import * as errors from './errors'
import { ProtocolAddress } from './protocol_address'
import queueJob from './queue_job'
import { SessionEntry, SessionRecord } from './session_record'

export class SessionBuilder {
	private readonly addr: string
	private readonly storage: any

	constructor(storage: any, protocolAddress: ProtocolAddress) {
		this.addr = protocolAddress.toString()
		this.storage = storage
	}

	async initOutgoing(device: {
    identityKey: Uint8Array
    signedPreKey: {
      publicKey: Uint8Array
      keyId: number
      signature: Uint8Array
    }
    preKey?: { publicKey: Uint8Array, keyId: number }
    registrationId: number
  }): Promise<void> {
		const fqAddr = this.addr
		return await queueJob(fqAddr, async() => {
			if(
				!(await this.storage.isTrustedIdentity(this.addr, device.identityKey))
			) {
				throw new errors.UntrustedIdentityKeyError(
					this.addr,
					// device.identityKey
					device.identityKey.toString()
				)
			}

			curve.verifySignature(
				device.identityKey,
				device.signedPreKey.publicKey,
				device.signedPreKey.signature
			)
			const baseKey = curve.generateKeyPair()
			const devicePreKey = device.preKey?.publicKey
			const session = await this.initSession(
				true,
				baseKey,
				undefined,
				device.identityKey,
				devicePreKey,
				device.signedPreKey.publicKey,
				device.registrationId
			)
			session.pendingPreKey = {
				signedKeyId: device.signedPreKey.keyId,
				baseKey: baseKey.pubKey,
			}
			if(device.preKey) {
				session.pendingPreKey.preKeyId = device.preKey.keyId
			}

			let record = await this.storage.loadSession(fqAddr)
			if(!record) {
				record = new SessionRecord()
			} else {
				const openSession = record.getOpenSession()
				if(openSession) {
					console.warn(
						'Closing stale open session for new outgoing prekey bundle'
					)
					record.closeSession(openSession)
				}
			}

			record.setSession(session)
			await this.storage.storeSession(fqAddr, record)
		})
	}

	async initIncoming(
		record: SessionRecord,
		message: proto.PreKeySignalMessage
	): Promise<number | undefined> {
		const fqAddr = this.addr.toString()
		if(!message.identityKey || !message.baseKey || !message.preKeyId || !message.registrationId) {
			throw new errors.PreKeyError('Invalid PreKey message')
		}

		if(!(await this.storage.isTrustedIdentity(fqAddr, message.identityKey))) {
			throw new errors.UntrustedIdentityKeyError(
				this.addr,
				bytesToBase64(message.identityKey)
			)
		}

		if(record.getSession(message.baseKey)) {
			// This just means we haven't replied.
			return
		}

		const preKeyPair = await this.storage.loadPreKey(message.preKeyId)
		if(message.preKeyId && !preKeyPair) {
			throw new errors.PreKeyError('Invalid PreKey ID')
		}

		const signedPreKeyPair = await this.storage.loadSignedPreKey(
			message.signedPreKeyId
		)
		if(!signedPreKeyPair) {
			throw new errors.PreKeyError('Missing SignedPreKey')
		}

		const existingOpenSession = record.getOpenSession()
		if(existingOpenSession) {
			console.warn('Closing open session in favor of incoming prekey bundle')
			record.closeSession(existingOpenSession)
		}

		record.setSession(
			await this.initSession(
				false,
				preKeyPair,
				signedPreKeyPair,
				message.identityKey,
				message.baseKey,
				undefined,
				message.registrationId
			)
		)
		return message.preKeyId
	}

	async initSession(
		isInitiator: boolean,
		ourEphemeralKey: { privKey: Uint8Array, pubKey: Uint8Array },
		ourSignedKey: { privKey: Uint8Array, pubKey: Uint8Array } | undefined,
		theirIdentityPubKey: Uint8Array,
		theirEphemeralPubKey: Uint8Array | undefined,
		theirSignedPubKey: Uint8Array | undefined,
		registrationId: number | undefined
	) {
		if(isInitiator) {
			if(ourSignedKey) {
				throw new Error('Invalid call to initSession')
			}

			ourSignedKey = ourEphemeralKey
		} else {
			if(theirSignedPubKey) {
				throw new Error('Invalid call to initSession')
			}

			theirSignedPubKey = theirEphemeralPubKey
		}

		let sharedSecret
		if(!ourEphemeralKey || !theirEphemeralPubKey) {
			sharedSecret = new Uint8Array(32 * 4)
		} else {
			sharedSecret = new Uint8Array(32 * 5)
		}

		for(var i = 0; i < 32; i++) {
			sharedSecret[i] = 0xff
		}

		const ourIdentityKey = await this.storage.getOurIdentity()
		const a1 = curve.calculateAgreement(
      theirSignedPubKey!,
      ourIdentityKey.privKey
		)
		const a2 = curve.calculateAgreement(
			theirIdentityPubKey,
      ourSignedKey!.privKey
		)
		const a3 = curve.calculateAgreement(
      theirSignedPubKey!,
      ourSignedKey!.privKey
		)
		if(isInitiator) {
			sharedSecret.set(new Uint8Array(a1), 32)
			sharedSecret.set(new Uint8Array(a2), 32 * 2)
		} else {
			sharedSecret.set(new Uint8Array(a1), 32 * 2)
			sharedSecret.set(new Uint8Array(a2), 32)
		}

		sharedSecret.set(new Uint8Array(a3), 32 * 3)
		if(ourEphemeralKey && theirEphemeralPubKey) {
			const a4 = curve.calculateAgreement(
				theirEphemeralPubKey,
				ourEphemeralKey.privKey
			)
			sharedSecret.set(new Uint8Array(a4), 32 * 4)
		}

		const masterKey = await deriveSecrets(
			Buffer.from(sharedSecret),
			Buffer.alloc(32),
			Buffer.from('WhisperText')
		)
		const session = SessionRecord.createEntry()
		session.registrationId = registrationId
		session.currentRatchet = {
			rootKey: masterKey[0],
			ephemeralKeyPair: isInitiator ? curve.generateKeyPair() : ourSignedKey!,
			lastRemoteEphemeralKey: theirSignedPubKey!,
			previousCounter: 0,
		}
		session.indexInfo = {
			created: Date.now(),
			used: Date.now(),
			remoteIdentityKey: theirIdentityPubKey,
			baseKey: isInitiator ? ourEphemeralKey.pubKey : theirEphemeralPubKey!,
			baseKeyType: isInitiator ? BaseKeyType.OURS : BaseKeyType.THEIRS,
			closed: -1,
		}
		if(isInitiator) {
			// If we're initiating we go ahead and set our first sending ephemeral key now,
			// otherwise we figure it out when we first maybeStepRatchet with the remote's
			// ephemeral key
			await this.calculateSendingRatchet(session, theirSignedPubKey!)
		}

		return session
	}

	async calculateSendingRatchet(session: SessionEntry, remoteKey: Uint8Array) {
		const ratchet = session.currentRatchet
		const sharedSecret = curve.calculateAgreement(
			remoteKey,
			ratchet.ephemeralKeyPair.privKey
		)
		const masterKey = await deriveSecrets(
			sharedSecret,
			ratchet.rootKey,
			Buffer.from('WhisperRatchet')
		)
		session.addChain(ratchet.ephemeralKeyPair.pubKey, {
			messageKeys: {},
			chainKey: {
				counter: -1,
				key: masterKey[1],
			},
			chainType: ChainType.SENDING,
		})
		ratchet.rootKey = masterKey[0]
	}
}