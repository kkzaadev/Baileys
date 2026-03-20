import { createCipheriv, createDecipheriv, createHash } from 'crypto'
import {
	calculateAgreement,
	calculateSignature,
	generateKeyPair as bridgeGenerateKeyPair,
	hkdf,
	md5,
	verifySignature
} from 'whatsapp-rust-bridge'
import { KEY_BUNDLE_TYPE } from '../Defaults'
import type { KeyPair } from '../Types'
export { md5, hkdf }

/** prefix version byte to the pub keys, required for some curve crypto functions */
const generateSignalPubKey = (pubKey: Uint8Array | Buffer) =>
	pubKey.length === 33 ? pubKey : Buffer.concat([KEY_BUNDLE_TYPE, pubKey])

export const Curve = {
	generateKeyPair: (): KeyPair => {
		const kp = bridgeGenerateKeyPair()
		return {
			private: Buffer.from(kp.privKey),
			public: Buffer.from(kp.pubKey)
		}
	},
	sharedKey: (privateKey: Uint8Array, publicKey: Uint8Array) => {
		const shared = calculateAgreement(publicKey, privateKey)
		return Buffer.from(shared)
	},
	sign: (privateKey: Uint8Array, buf: Uint8Array) => {
		return calculateSignature(privateKey, buf)
	},
	verify: (pubKey: Uint8Array, message: Uint8Array, signature: Uint8Array) => {
		try {
			return verifySignature(pubKey, message, signature)
		} catch (error) {
			return false
		}
	}
}

export const signedKeyPair = (identityKeyPair: KeyPair, keyId: number) => {
	const preKey = Curve.generateKeyPair()
	const pubKey = generateSignalPubKey(preKey.public)
	const signature = Curve.sign(identityKeyPair.private, pubKey)
	return { keyPair: preKey, signature, keyId }
}

const GCM_TAG_LENGTH = 128 >> 3

export function aesEncryptGCM(plaintext: Uint8Array, key: Uint8Array, iv: Uint8Array, additionalData: Uint8Array) {
	const cipher = createCipheriv('aes-256-gcm', key, iv)
	cipher.setAAD(additionalData)
	return Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()])
}

export function aesDecryptGCM(ciphertext: Uint8Array, key: Uint8Array, iv: Uint8Array, additionalData: Uint8Array) {
	const decipher = createDecipheriv('aes-256-gcm', key, iv)
	const enc = ciphertext.slice(0, ciphertext.length - GCM_TAG_LENGTH)
	const tag = ciphertext.slice(ciphertext.length - GCM_TAG_LENGTH)
	decipher.setAAD(additionalData)
	decipher.setAuthTag(tag)
	return Buffer.concat([decipher.update(enc), decipher.final()])
}

export function sha256(buffer: Buffer) {
	return createHash('sha256').update(buffer).digest()
}
