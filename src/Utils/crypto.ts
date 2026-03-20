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
