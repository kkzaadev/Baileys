import { getRandomBytes } from '../Utils'
import * as curve from './curve'

function isNonNegativeInteger(n: number): boolean {
	return typeof n === 'number' && n % 1 === 0 && n >= 0
}

export const generateIdentityKeyPair = curve.generateKeyPair

export function generateRegistrationId(): number {
	const registrationId = new Uint16Array(getRandomBytes(2))[0]
	return registrationId & 0x3fff
}

export function generateSignedPreKey(
	identityKeyPair: { privKey: Uint8Array, pubKey: Uint8Array },
	signedKeyId: number
): {
  keyId: number
  keyPair: { privKey: Uint8Array, pubKey: Uint8Array }
  signature: Uint8Array
} {
	if(
		!(identityKeyPair.privKey instanceof Uint8Array) ||
    identityKeyPair.privKey.byteLength !== 32 ||
    !(identityKeyPair.pubKey instanceof Uint8Array) ||
    identityKeyPair.pubKey.byteLength !== 33
	) {
		throw new TypeError('Invalid argument for identityKeyPair')
	}

	if(!isNonNegativeInteger(signedKeyId)) {
		throw new TypeError('Invalid argument for signedKeyId: ' + signedKeyId)
	}

	const keyPair = curve.generateKeyPair()
	const sig = curve.calculateSignature(identityKeyPair.privKey, keyPair.pubKey)
	return {
		keyId: signedKeyId,
		keyPair,
		signature: sig,
	}
}

export function generatePreKey(keyId: number): {
  keyId: number
  keyPair: { privKey: Uint8Array, pubKey: Uint8Array }
} {
	if(!isNonNegativeInteger(keyId)) {
		throw new TypeError('Invalid argument for keyId: ' + keyId)
	}

	const keyPair = curve.generateKeyPair()
	return {
		keyId,
		keyPair,
	}
}