import { hash } from '../Utils/crypto'

const VERSION = 0

async function iterateHash(
	data: Uint8Array,
	key: Uint8Array,
	count: number
): Promise<Uint8Array> {
	const combined = new Uint8Array(data.length + key.length)
	combined.set(data)
	combined.set(key, data.length)
	const result = await hash(combined)
	if(--count === 0) {
		return result
	} else {
		return iterateHash(result, key, count)
	}
}

function shortToArrayBuffer(number: number): Uint8Array {
	return new Uint8Array([number])
}

function getEncodedChunk(hash: Uint8Array, offset: number): string {
	const chunk =
    (hash[offset] * Math.pow(2, 32) +
      hash[offset + 1] * Math.pow(2, 24) +
      hash[offset + 2] * Math.pow(2, 16) +
      hash[offset + 3] * Math.pow(2, 8) +
      hash[offset + 4]) %
    100000
	let s = chunk.toString()
	while(s.length < 5) {
		s = '0' + s
	}

	return s
}

async function getDisplayStringFor(
	identifier: string,
	key: Uint8Array,
	iterations: number
): Promise<string> {
	const bytes = new Uint8Array([...shortToArrayBuffer(VERSION), ...key, ...new TextEncoder().encode(identifier)])
	const output = new Uint8Array(await iterateHash(bytes, key, iterations))
	return (
		getEncodedChunk(output, 0) +
    getEncodedChunk(output, 5) +
    getEncodedChunk(output, 10) +
    getEncodedChunk(output, 15) +
    getEncodedChunk(output, 20) +
    getEncodedChunk(output, 25)
	)
}

export class FingerprintGenerator {
	constructor(public readonly iterations: number) {}

	async createFor(
		localIdentifier: string,
		localIdentityKey: Uint8Array,
		remoteIdentifier: string,
		remoteIdentityKey: Uint8Array
	): Promise<string> {
		if(
			typeof localIdentifier !== 'string' ||
      typeof remoteIdentifier !== 'string' ||
      !(localIdentityKey instanceof Uint8Array) ||
      !(remoteIdentityKey instanceof Uint8Array)
		) {
			throw new Error('Invalid arguments')
		}

		const fingerprints = await Promise.all([
			getDisplayStringFor(localIdentifier, localIdentityKey, this.iterations),
			getDisplayStringFor(remoteIdentifier, remoteIdentityKey, this.iterations),
		])
		return fingerprints.sort().join('')
	}
}