import { proto } from '../../WAProto/index.js'
import { Curve } from '../Utils/crypto'

describe('Proto bridge roundtrip', () => {
	it('should encode/decode HandshakeMessage correctly', () => {
		const kp = Curve.generateKeyPair()
		const original = {
			clientHello: { ephemeral: kp.public }
		}

		const encoded = proto.HandshakeMessage.encode(original).finish()
		expect(encoded).toBeInstanceOf(Uint8Array)
		expect(encoded.length).toBeGreaterThan(0)

		const decoded = proto.HandshakeMessage.decode(encoded)
		expect(decoded.clientHello).toBeDefined()
		const eph = decoded.clientHello!.ephemeral!
		expect(eph.length).toBe(32)
		expect(Buffer.from(eph as any)).toEqual(Buffer.from(kp.public))
	})

	it('should encode/decode CertChain with byte fields as Buffer', () => {
		const details = Buffer.from([1, 2, 3, 4])
		const signature = Buffer.alloc(64, 0xab)

		const original = {
			intermediate: { details, signature },
			leaf: { details: Buffer.from([5, 6, 7]), signature: Buffer.alloc(64, 0xcd) }
		}

		const encoded = proto.CertChain.encode(original).finish()
		const decoded = proto.CertChain.decode(encoded)

		expect(decoded.intermediate).toBeDefined()
		// Key check: bytes should come back as Buffer, not plain array
		const d = decoded.intermediate!.details!
		const s = decoded.intermediate!.signature!
		expect(Buffer.isBuffer(d) || d instanceof Uint8Array).toBe(true)
		expect(Buffer.from(d as any)).toEqual(details)
		expect(Buffer.from(s as any)).toEqual(signature)
	})

	it('Curve.verify should work with 32-byte keys', () => {
		const kp = Curve.generateKeyPair()
		expect(kp.public.length).toBe(32)
		expect(kp.private.length).toBe(32)

		const message = Buffer.from('test message')
		const sig = Curve.sign(kp.private, message)
		expect(sig).toBeDefined()

		const valid = Curve.verify(kp.public, message, sig)
		expect(valid).toBe(true)

		// Tampered message should fail
		const tamperedMsg = Buffer.from('tampered')
		const invalid = Curve.verify(kp.public, tamperedMsg, sig)
		expect(invalid).toBe(false)
	})
})
