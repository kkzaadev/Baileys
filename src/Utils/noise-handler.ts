import { NoiseSession } from 'whatsapp-rust-bridge'
import { proto } from '../../WAProto/index.js'
import { WA_CERT_DETAILS } from '../Defaults'
import type { KeyPair } from '../Types'
import type { BinaryNode } from '../WABinary'
import { Curve } from './crypto'
import type { ILogger } from './logger'

export const makeNoiseHandler = ({
	keyPair: { private: privateKey, public: publicKey },
	NOISE_HEADER,
	logger,
	routingInfo
}: {
	keyPair: KeyPair
	NOISE_HEADER: Uint8Array
	logger: ILogger
	routingInfo?: Buffer | undefined
}) => {
	logger = logger.child({ class: 'ns' })

	const session = new NoiseSession(
		publicKey,
		NOISE_HEADER,
		routingInfo ? new Uint8Array(routingInfo) : undefined
	)

	return {
		encrypt: (plaintext: Uint8Array): Uint8Array => {
			return session.encrypt(plaintext)
		},
		decrypt: (ciphertext: Uint8Array): Uint8Array => {
			return session.decrypt(ciphertext)
		},
		authenticate: (data: Uint8Array) => {
			session.authenticate(data)
		},
		mixIntoKey: (data: Uint8Array) => {
			session.mixIntoKey(data)
		},
		finishInit: async () => {
			session.finishInit()
			logger.trace('Noise handler transitioned to Transport state')
		},
		processHandshake: (handshake: proto.HandshakeMessage, noiseKey: KeyPair) => {
			const serverHello = handshake.serverHello!
			// Step 1: Process server hello — authenticate ephemeral, mix shared secrets, decrypt static + payload
			const certDecoded = session.processHandshakeInit(
				serverHello.ephemeral!,
				serverHello.static!,
				serverHello.payload!,
				privateKey
			)

			// Step 2: Verify certificate chain
			const certChain = proto.CertChain.decode(certDecoded)

			const { intermediate: certIntermediate, leaf } = certChain
			if (!leaf?.details || !leaf?.signature) {
				throw new Error('invalid noise leaf certificate')
			}

			if (!certIntermediate?.details || !certIntermediate?.signature) {
				throw new Error('invalid noise intermediate certificate')
			}

			const details = proto.CertChain.NoiseCertificate.Details.decode(certIntermediate.details!)

			const verify = Curve.verify(details.key!, leaf.details, leaf.signature)
			const verifyIntermediate = Curve.verify(
				WA_CERT_DETAILS.PUBLIC_KEY,
				certIntermediate.details,
				certIntermediate.signature
			)

			if (!verify) {
				throw new Error('noise certificate signature invalid')
			}

			if (!verifyIntermediate) {
				throw new Error('noise intermediate certificate signature invalid')
			}

			if (details.issuerSerial !== WA_CERT_DETAILS.SERIAL) {
				throw new Error('certification match failed')
			}

			// Step 3: Encrypt our noise key and mix shared secret
			const keyEnc = session.processHandshakeFinish(
				noiseKey.public,
				noiseKey.private,
				serverHello!.ephemeral!
			)

			return keyEnc
		},
		encodeFrame: (data: Buffer | Uint8Array): Buffer => {
			const encoded = session.encodeFrameRaw(data)
			return Buffer.from(encoded)
		},
		decodeFrame: async (newData: Buffer | Uint8Array, onFrame: (buff: Uint8Array | BinaryNode) => void) => {
			const frames = session.decodeFrame(newData)
			for (let i = 0; i < frames.length; i++) {
				const frame = frames[i]

				if (logger.level === 'trace') {
					logger.trace({ msg: (frame as BinaryNode)?.attrs?.id }, 'recv frame')
				}

				onFrame(frame)
			}
		}
	}
}
