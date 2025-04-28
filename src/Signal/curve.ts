import * as curveJs from 'curve25519-js'
import { getRandomBytes } from '../Utils'

const KEY_BUNDLE_TYPE: Uint8Array = new Uint8Array([5])

const prefixKeyInPublicKey = (pubKey: Uint8Array): Uint8Array => {
	const result = new Uint8Array(KEY_BUNDLE_TYPE.length + pubKey.length)
	result.set(KEY_BUNDLE_TYPE)
	result.set(pubKey, KEY_BUNDLE_TYPE.length)
	return result
}

function validatePrivKey(privKey: Uint8Array): void {
	if(privKey === undefined) {
		throw new Error('Undefined private key')
	}

	if(!(privKey instanceof Uint8Array)) {
		throw new Error(`Invalid private key type: ${typeof privKey}`)
	}

	if(privKey.byteLength !== 32) {
		throw new Error(`Incorrect private key length: ${privKey.byteLength}`)
	}
}

function scrubPubKeyFormat(pubKey: Uint8Array): Uint8Array {
	if(!(pubKey instanceof Uint8Array)) {
		throw new Error(`Invalid public key type: ${typeof pubKey}`)
	}

	if(
		pubKey === undefined ||
    ((pubKey.byteLength !== 33 || pubKey[0] !== 5) && pubKey.byteLength !== 32)
	) {
		throw new Error('Invalid public key')
	}

	if(pubKey.byteLength === 33) {
		return pubKey.slice(1)
	} else {
		console.error(
			'WARNING: Expected pubkey of length 33, please report the ST and client that generated the pubkey'
		)
		return pubKey
	}
}

export function generateKeyPair(): { privKey: Uint8Array, pubKey: Uint8Array } {
	const keyPair = curveJs.generateKeyPair(getRandomBytes(32))
	return {
		privKey: new Uint8Array(keyPair.private),
		pubKey: prefixKeyInPublicKey(new Uint8Array(keyPair.public)),
	}
}

export function calculateAgreement(
	pubKey: Uint8Array,
	privKey: Uint8Array
): Uint8Array {
	pubKey = scrubPubKeyFormat(pubKey)
	validatePrivKey(privKey)
	if(!pubKey || pubKey.byteLength !== 32) {
		throw new Error('Invalid public key')
	}

	const secret = curveJs.sharedKey(privKey, pubKey)
	return new Uint8Array(secret)
}

export function calculateSignature(
	privKey: Uint8Array,
	message: Uint8Array
): Uint8Array {
	validatePrivKey(privKey)
	if(!message) {
		throw new Error('Invalid message')
	}

	return new Uint8Array(curveJs.sign(privKey, message, undefined))
}

export function verifySignature(
	pubKey: Uint8Array,
	msg: Uint8Array,
	sig: Uint8Array
): boolean {
	pubKey = scrubPubKeyFormat(pubKey)
	if(!pubKey || pubKey.byteLength !== 32) {
		throw new Error('Invalid public key')
	}

	if(!msg) {
		throw new Error('Invalid message')
	}

	if(!sig || sig.byteLength !== 64) {
		throw new Error('Invalid signature')
	}

	return curveJs.verify(pubKey, msg, sig)
}

function unclampEd25519PrivateKey(clampedSk: Uint8Array): Uint8Array {
	const unclampedSk = new Uint8Array(clampedSk)

	// Fix the first byte
	unclampedSk[0] |= 6 // Ensure last 3 bits match expected `110` pattern

	// Fix the last byte
	unclampedSk[31] |= 128 // Restore the highest bit
	unclampedSk[31] &= ~64 // Clear the second-highest bit

	return unclampedSk
}

export function getPublicFromPrivateKey(privKey: Uint8Array): Uint8Array {
	const unclampedPK = unclampEd25519PrivateKey(privKey)
	const keyPair = curveJs.generateKeyPair(unclampedPK)
	return prefixKeyInPublicKey(keyPair.public)
}
