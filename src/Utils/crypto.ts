import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'crypto'
import * as libsignal from 'libsignal'
import { KEY_BUNDLE_TYPE } from '../Defaults'
import { KeyPair } from '../Types'
import { isEqualBytes } from '../Utils/bytes-utils'

// insure browser & node compatibility
const { subtle } = globalThis.crypto

/** prefix version byte to the pub keys, required for some curve crypto functions */
export const generateSignalPubKey = (pubKey: Uint8Array | Buffer) => (
	pubKey.length === 33
		? pubKey
		: Buffer.concat([ KEY_BUNDLE_TYPE, pubKey ])
)

export const Curve = {
	generateKeyPair: (): KeyPair => {
		const { pubKey, privKey } = libsignal.curve.generateKeyPair()
		return {
			private: Buffer.from(privKey),
			// remove version byte
			public: Buffer.from((pubKey as Uint8Array).slice(1))
		}
	},
	sharedKey: (privateKey: Uint8Array, publicKey: Uint8Array) => {
		const shared = libsignal.curve.calculateAgreement(generateSignalPubKey(publicKey), privateKey)
		return Buffer.from(shared)
	},
	sign: (privateKey: Uint8Array, buf: Uint8Array) => (
		libsignal.curve.calculateSignature(privateKey, buf)
	),
	verify: (pubKey: Uint8Array, message: Uint8Array, signature: Uint8Array) => {
		try {
			libsignal.curve.verifySignature(generateSignalPubKey(pubKey), message, signature)
			return true
		} catch(error) {
			return false
		}
	},
	/**
	 * Prefix version byte to the pub keys, required for some curve crypto functions
	 */
	prefixKeyInPublicKey: (pubKey: Uint8Array): Uint8Array => {
		const KEY_BUNDLE_TYPE = new Uint8Array([5])
		const result = new Uint8Array(KEY_BUNDLE_TYPE.length + pubKey.length)
		result.set(KEY_BUNDLE_TYPE)
		result.set(pubKey, KEY_BUNDLE_TYPE.length)
		return result
	},
	validatePrivKey: (privKey: Uint8Array): void => {
		if(privKey === undefined) {
			throw new Error('Undefined private key')
		}

		if(!(privKey instanceof Uint8Array)) {
			throw new Error(`Invalid private key type: ${typeof privKey}`)
		}

		if(privKey.byteLength !== 32) {
			throw new Error(`Incorrect private key length: ${privKey.byteLength}`)
		}
	},
	scrubPubKeyFormat: (pubKey: Uint8Array): Uint8Array => {
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
	},
	unclampEd25519PrivateKey: (clampedSk: Uint8Array): Uint8Array => {
		const unclampedSk = new Uint8Array(clampedSk)
		// Fix the first byte
		unclampedSk[0] |= 6 // Ensure last 3 bits match expected `110` pattern
		// Fix the last byte
		unclampedSk[31] |= 128 // Restore the highest bit
		unclampedSk[31] &= ~64 // Clear the second-highest bit
		return unclampedSk
	}
}

export const signedKeyPair = (identityKeyPair: KeyPair, keyId: number) => {
	const preKey = Curve.generateKeyPair()
	const pubKey = generateSignalPubKey(preKey.public)

	const signature = Curve.sign(identityKeyPair.private, pubKey)

	return { keyPair: preKey, signature, keyId }
}

const GCM_TAG_LENGTH = 128 >> 3

/**
 * encrypt AES 256 GCM;
 * where the tag tag is suffixed to the ciphertext
 * */
export function aesEncryptGCM(plaintext: Uint8Array, key: Uint8Array, iv: Uint8Array, additionalData: Uint8Array) {
	const cipher = createCipheriv('aes-256-gcm', key, iv)
	cipher.setAAD(additionalData)
	return Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()])
}

/**
 * decrypt AES 256 GCM;
 * where the auth tag is suffixed to the ciphertext
 * */
export function aesDecryptGCM(ciphertext: Uint8Array, key: Uint8Array, iv: Uint8Array, additionalData: Uint8Array) {
	const decipher = createDecipheriv('aes-256-gcm', key, iv)
	// decrypt additional adata
	const enc = ciphertext.slice(0, ciphertext.length - GCM_TAG_LENGTH)
	const tag = ciphertext.slice(ciphertext.length - GCM_TAG_LENGTH)
	// set additional data
	decipher.setAAD(additionalData)
	decipher.setAuthTag(tag)

	return Buffer.concat([ decipher.update(enc), decipher.final() ])
}

export function aesEncryptCTR(plaintext: Uint8Array, key: Uint8Array, iv: Uint8Array) {
	const cipher = createCipheriv('aes-256-ctr', key, iv)
	return Buffer.concat([cipher.update(plaintext), cipher.final()])
}

export function aesDecryptCTR(ciphertext: Uint8Array, key: Uint8Array, iv: Uint8Array) {
	const decipher = createDecipheriv('aes-256-ctr', key, iv)
	return Buffer.concat([decipher.update(ciphertext), decipher.final()])
}

/** decrypt AES 256 CBC; where the IV is prefixed to the buffer */
export function aesDecrypt(buffer: Buffer, key: Buffer) {
	return aesDecryptWithIV(buffer.slice(16, buffer.length), key, buffer.slice(0, 16))
}

/** decrypt AES 256 CBC */
export function aesDecryptWithIV(buffer: Buffer, key: Buffer, IV: Buffer) {
	const aes = createDecipheriv('aes-256-cbc', key, IV)
	return Buffer.concat([aes.update(buffer), aes.final()])
}

// encrypt AES 256 CBC; where a random IV is prefixed to the buffer
export function aesEncrypt(buffer: Buffer | Uint8Array, key: Buffer) {
	const IV = randomBytes(16)
	const aes = createCipheriv('aes-256-cbc', key, IV)
	return Buffer.concat([IV, aes.update(buffer), aes.final()]) // prefix IV to the buffer
}

// encrypt AES 256 CBC with a given IV
export function aesEncrypWithIV(buffer: Buffer, key: Buffer, IV: Buffer) {
	const aes = createCipheriv('aes-256-cbc', key, IV)
	return Buffer.concat([aes.update(buffer), aes.final()]) // prefix IV to the buffer
}

// sign HMAC using SHA 256
export function hmacSign(buffer: Buffer | Uint8Array, key: Buffer | Uint8Array, variant: 'sha256' | 'sha512' = 'sha256') {
	return createHmac(variant, key).update(buffer).digest()
}

export function sha256(buffer: Buffer) {
	return createHash('sha256').update(buffer).digest()
}

export function md5(buffer: Buffer) {
	return createHash('md5').update(buffer).digest()
}

// HKDF key expansion
export async function hkdf(
	buffer: Uint8Array | Buffer,
	expandedLength: number,
	info: { salt?: Buffer, info?: string }
): Promise<Buffer> {
	// Ensure we have a Uint8Array for the key material
	const inputKeyMaterial = buffer instanceof Uint8Array
		? buffer
		: new Uint8Array(buffer)

	// Set default values if not provided
	const salt = info.salt ? new Uint8Array(info.salt) : new Uint8Array(0)
	const infoBytes = info.info
		? new TextEncoder().encode(info.info)
		: new Uint8Array(0)

	// Import the input key material
	const importedKey = await subtle.importKey(
		'raw',
		inputKeyMaterial,
		{ name: 'HKDF' },
		false,
		['deriveBits']
	)

	// Derive bits using HKDF
	const derivedBits = await subtle.deriveBits(
		{
			name: 'HKDF',
			hash: 'SHA-256',
			salt: salt,
			info: infoBytes
		},
		importedKey,
		expandedLength * 8 // Convert bytes to bits
	)

	return Buffer.from(derivedBits)
}


export async function derivePairingCodeKey(pairingCode: string, salt: Buffer): Promise<Buffer> {
	// Convert inputs to formats Web Crypto API can work with
	const encoder = new TextEncoder()
	const pairingCodeBuffer = encoder.encode(pairingCode)
	const saltBuffer = salt instanceof Uint8Array ? salt : new Uint8Array(salt)

	// Import the pairing code as key material
	const keyMaterial = await subtle.importKey(
		'raw',
		pairingCodeBuffer,
		{ name: 'PBKDF2' },
		false,
		['deriveBits']
	)

	// Derive bits using PBKDF2 with the same parameters
	// 2 << 16 = 131,072 iterations
	const derivedBits = await subtle.deriveBits(
		{
			name: 'PBKDF2',
			salt: saltBuffer,
			iterations: 2 << 16,
			hash: 'SHA-256'
		},
		keyMaterial,
		32 * 8 // 32 bytes * 8 = 256 bits
	)

	return Buffer.from(derivedBits)
}

export async function encryptCBC(
	key: Uint8Array,
	data: Uint8Array,
	iv: Uint8Array
): Promise<Uint8Array> {
	const cryptoKey = await crypto.subtle.importKey(
		'raw',
		key,
		{ name: 'AES-CBC', length: 256 },
		false,
		['encrypt']
	)

	const ciphertext = await crypto.subtle.encrypt(
		{ name: 'AES-CBC', iv },
		cryptoKey,
		data
	)

	return new Uint8Array(ciphertext)
}

export async function decryptCBC(
	key: Uint8Array,
	data: Uint8Array,
	iv: Uint8Array
): Promise<Uint8Array> {
	const cryptoKey = await crypto.subtle.importKey(
		'raw',
		key,
		{ name: 'AES-CBC', length: 256 },
		false,
		['decrypt']
	)

	const plaintext = await crypto.subtle.decrypt(
		{ name: 'AES-CBC', iv },
		cryptoKey,
		data
	)

	return new Uint8Array(plaintext)
}

export async function calculateMAC(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
	const cryptoKey = await crypto.subtle.importKey(
		'raw',
		key,
		{ name: 'HMAC', hash: { name: 'SHA-256' } },
		false,
		['sign']
	)

	const mac = await crypto.subtle.sign('HMAC', cryptoKey, data)
	return new Uint8Array(mac)
}

export async function hash(data: Uint8Array): Promise<Uint8Array> {
	const digest = await crypto.subtle.digest('SHA-256', data)
	return new Uint8Array(digest)
}

export async function deriveSecrets(
	input: Uint8Array,
	salt: Uint8Array,
	info: Uint8Array,
	chunks = 3
): Promise<Uint8Array[]> {
	if(salt.byteLength !== 32) {
		throw new Error('Got salt of incorrect length')
	}

	if(!(chunks >= 1 && chunks <= 3)) {
		throw new Error('Invalid number of chunks')
	}

	const importedKey = await crypto.subtle.importKey(
		'raw',
		input,
		{ name: 'HKDF' },
		false,
		['deriveBits']
	)

	const derivedBits = await crypto.subtle.deriveBits(
		{
			name: 'HKDF',
			hash: 'SHA-256',
			salt,
			info,
		},
		importedKey,
		32 * chunks * 8 // bits
	)

	const out: Uint8Array[] = []
	const arr = new Uint8Array(derivedBits)
	for(let i = 0; i < chunks; i++) {
		out.push(arr.slice(i * 32, (i + 1) * 32))
	}

	return out
}

export async function verifyMAC(
	data: Uint8Array,
	key: Uint8Array,
	mac: Uint8Array,
	length: number
): Promise<void> {
	const calculatedMac = (await calculateMAC(key, data)).slice(0, length)
	if(mac.length !== length || calculatedMac.length !== length) {
		throw new Error('Bad MAC length')
	}

	if(!isEqualBytes(mac, calculatedMac)) {
		throw new Error('Bad MAC')
	}
}

export function getRandomBytes(size: number): Uint8Array {
	return crypto.getRandomValues(new Uint8Array(size))
}
