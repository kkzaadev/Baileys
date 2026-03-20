import { Boom } from '@hapi/boom'
import { jest } from '@jest/globals'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { Agent } from 'node:https'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import P from 'pino'
import makeWASocket, {
	DisconnectReason,
	downloadMediaMessage,
	jidNormalizedUser,
	proto,
	useMultiFileAuthState,
	type WAMessage
} from '../../index'

jest.setTimeout(60_000)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type WASocket = ReturnType<typeof makeWASocket>

const logger = P({ level: process.env.LOG_LEVEL ?? 'warn' })
const agent = new Agent({ rejectUnauthorized: false })
const socketUrl = process.env.SOCKET_URL ?? 'wss://127.0.0.1:8080/ws/chat'

async function createTestClient(label: string): Promise<{
	sock: WASocket
	jid: string
	lid?: string
	authFolder: string
}> {
	const authFolder = mkdtempSync(join(tmpdir(), `baileys-e2e-${label}-`))
	const { state, saveCreds } = await useMultiFileAuthState(authFolder)

	const sock = makeWASocket({
		auth: { creds: state.creds, keys: state.keys },
		waWebSocketUrl: socketUrl,
		logger: logger.child({ user: label }),
		agent,
		fetchAgent: agent
	})

	sock.ev.on('creds.update', saveCreds)

	const jid = await new Promise<string>((resolve, reject) => {
		sock.ev.on('connection.update', update => {
			if (update.connection === 'open') {
				resolve(jidNormalizedUser(sock.user?.id))
			} else if (update.connection === 'close') {
				const reason = (update.lastDisconnect?.error as Boom)?.output?.statusCode
				if (reason === DisconnectReason.loggedOut) {
					reject(new Error(`${label}: Logged out`))
				}
			}
		})
	})

	return { sock, jid, lid: sock.user?.lid, authFolder }
}

async function destroyTestClient(client: { sock: WASocket; authFolder: string }) {
	try {
		client.sock.setAutoReconnect(false)
		await client.sock.end()
	} catch {
		/* ignore */
	}

	try {
		rmSync(client.authFolder, { recursive: true, force: true })
	} catch {
		/* ignore */
	}
}

function waitForMessage(
	sock: WASocket,
	predicate: (msg: proto.IWebMessageInfo) => boolean,
	timeoutMs = 15_000
): Promise<proto.IWebMessageInfo> {
	return new Promise((resolve, reject) => {
		const listener = (data: { messages: proto.IWebMessageInfo[] }) => {
			const msg = data.messages.find(predicate)
			if (msg) {
				sock.ev.off('messages.upsert', listener)
				clearTimeout(tid)
				resolve(msg)
			}
		}

		sock.ev.on('messages.upsert', listener)
		const tid = setTimeout(() => {
			sock.ev.off('messages.upsert', listener)
			reject(new Error('Timed out waiting for message'))
		}, timeoutMs)
	})
}

function getTextContent(msg: proto.IWebMessageInfo): string | undefined {
	return msg.message?.extendedTextMessage?.text || msg.message?.conversation || undefined
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('E2E: Two-user messaging', () => {
	let alice: Awaited<ReturnType<typeof createTestClient>>
	let bob: Awaited<ReturnType<typeof createTestClient>>

	beforeAll(async () => {
		;[alice, bob] = await Promise.all([createTestClient('alice'), createTestClient('bob')])
		logger.info({ alice: alice.jid, bob: bob.jid }, 'Both users connected')
	})

	afterAll(async () => {
		await Promise.all([destroyTestClient(alice), destroyTestClient(bob)])
	})

	// ── Text messages ──

	test('Alice sends text → Bob receives it', async () => {
		const text = `Hello Bob! ${Date.now()}`

		const bobReceived = waitForMessage(bob.sock, m => getTextContent(m) === text && !m.key?.fromMe)

		const sent = await alice.sock.sendMessage(bob.jid, { text })
		const received = await bobReceived

		// Sender side
		expect(sent).toBeDefined()
		expect(sent!.key.id).toBeTruthy()

		// Receiver side: correct text, not fromMe, remoteJid matches sender
		expect(getTextContent(received)).toBe(text)
		expect(received.key?.fromMe).toBe(false)
		expect(received.key?.remoteJid).toBe(alice.jid)

		// Message ID should match between sender and receiver
		expect(received.key?.id).toBe(sent!.key.id)
	})

	test('Bob sends text → Alice receives it', async () => {
		const text = `Hi Alice! ${Date.now()}`

		const aliceReceived = waitForMessage(alice.sock, m => getTextContent(m) === text && !m.key?.fromMe)

		const sent = await bob.sock.sendMessage(alice.jid, { text })
		const received = await aliceReceived

		expect(getTextContent(received)).toBe(text)
		expect(received.key?.fromMe).toBe(false)
		expect(received.key?.remoteJid).toBe(bob.jid)
		expect(received.key?.id).toBe(sent!.key.id)
	})

	// ── Edit ──

	test('Alice sends → edits → sender returns correct edit proto', async () => {
		const original = `Original ${Date.now()}`
		const edited = `Edited ${Date.now()}`

		const bobGotOriginal = waitForMessage(bob.sock, m => getTextContent(m) === original && !m.key?.fromMe)
		const sent = await alice.sock.sendMessage(bob.jid, { text: original })
		const originalReceived = await bobGotOriginal

		// Verify original was received correctly
		expect(originalReceived.key?.id).toBe(sent!.key.id)

		const editResult = await alice.sock.sendMessage(bob.jid, { text: edited, edit: sent!.key })
		expect(editResult).toBeDefined()
		expect(editResult!.message?.protocolMessage?.type).toBe(proto.Message.ProtocolMessage.Type.MESSAGE_EDIT)
		expect(editResult!.message?.protocolMessage?.key?.id).toBe(sent!.key.id)

		const editedContent = editResult!.message?.protocolMessage?.editedMessage
		expect(editedContent?.extendedTextMessage?.text || editedContent?.conversation).toBe(edited)
	})

	// ── Delete ──

	test('Alice sends → deletes → sender returns correct revoke proto', async () => {
		const text = `Delete me ${Date.now()}`

		const bobGotIt = waitForMessage(bob.sock, m => getTextContent(m) === text && !m.key?.fromMe)
		const sent = await alice.sock.sendMessage(bob.jid, { text })
		await bobGotIt

		const deleted = await alice.sock.sendMessage(bob.jid, { delete: sent!.key })
		expect(deleted).toBeDefined()
		expect(deleted!.message?.protocolMessage?.type).toBe(proto.Message.ProtocolMessage.Type.REVOKE)
		expect(deleted!.message?.protocolMessage?.key?.id).toBe(sent!.key.id)
	})

	// ── Reactions ──

	test('Alice sends → Bob reacts with correct key reference', async () => {
		const text = `React to me ${Date.now()}`

		const bobGotIt = waitForMessage(bob.sock, m => getTextContent(m) === text && !m.key?.fromMe)
		await alice.sock.sendMessage(bob.jid, { text })
		const received = await bobGotIt

		const reaction = await bob.sock.sendMessage(alice.jid, {
			react: { text: '❤️', key: received.key as proto.IMessageKey }
		})

		expect(reaction).toBeDefined()
		expect(reaction!.message?.reactionMessage?.text).toBe('❤️')
		// Reaction should reference the original message
		expect(reaction!.message?.reactionMessage?.key?.id).toBe(received.key?.id)
	})

	// ── Reply with quote ──

	test('Alice sends → Bob replies → Alice gets reply with quoted original', async () => {
		const question = `Question ${Date.now()}`
		const answer = `Answer ${Date.now()}`

		const bobGotQuestion = waitForMessage(bob.sock, m => getTextContent(m) === question && !m.key?.fromMe)
		const sentQuestion = await alice.sock.sendMessage(bob.jid, { text: question })
		const questionMsg = await bobGotQuestion

		const aliceGotReply = waitForMessage(alice.sock, m => getTextContent(m) === answer && !m.key?.fromMe)
		await bob.sock.sendMessage(alice.jid, { text: answer }, { quoted: questionMsg as WAMessage })
		const reply = await aliceGotReply

		// Reply text correct
		expect(getTextContent(reply)).toBe(answer)
		expect(reply.key?.fromMe).toBe(false)

		// Context info has the quoted message
		const ctx = reply.message?.extendedTextMessage?.contextInfo
		expect(ctx).toBeDefined()
		expect(ctx?.quotedMessage).toBeDefined()
		// Quoted message ID references the original
		expect(ctx?.stanzaId).toBe(sentQuestion!.key.id)
	})

	// ── Media: image ──

	test('Alice sends image → Bob receives, verifies metadata, and downloads', async () => {
		const image = readFileSync('./Media/cat.jpeg')
		const caption = `DM cat ${Date.now()}`

		const bobGotImage = waitForMessage(bob.sock, m => m.message?.imageMessage?.caption === caption && !m.key?.fromMe)

		await alice.sock.sendMessage(bob.jid, { image, caption })
		const received = await bobGotImage

		// Verify image message structure
		const imgMsg = received.message?.imageMessage
		expect(imgMsg).toBeDefined()
		expect(imgMsg?.caption).toBe(caption)
		expect(imgMsg?.mimetype).toContain('image')
		expect(imgMsg?.mediaKey).toBeDefined()
		expect(imgMsg?.fileLength).toBeGreaterThan(0)
		expect(imgMsg?.fileSha256).toBeDefined()

		// Download and verify
		const buffer = await downloadMediaMessage(
			received as WAMessage,
			'buffer',
			{},
			{ logger: bob.sock.logger, reuploadRequest: m => bob.sock.updateMediaMessage(m) }
		)

		expect(Buffer.isBuffer(buffer)).toBe(true)
		expect(buffer.length).toBeGreaterThan(0)
		// Downloaded content should match original size (approximately — encryption adds padding)
		expect(buffer.length).toBeGreaterThanOrEqual(image.length * 0.9)
	})

	// ── Media: video ──

	test('Bob sends video → Alice receives and verifies metadata', async () => {
		const video = readFileSync('./Media/ma_gif.mp4')
		const caption = `DM video ${Date.now()}`

		const aliceGotVideo = waitForMessage(
			alice.sock,
			m => m.message?.videoMessage?.caption === caption && !m.key?.fromMe
		)

		await bob.sock.sendMessage(alice.jid, { video, caption })
		const received = await aliceGotVideo

		const vidMsg = received.message?.videoMessage
		expect(vidMsg).toBeDefined()
		expect(vidMsg?.caption).toBe(caption)
		expect(vidMsg?.mimetype).toContain('video')
		expect(vidMsg?.mediaKey).toBeDefined()
		expect(vidMsg?.fileLength).toBeGreaterThan(0)

		// Download and verify
		const buffer = await downloadMediaMessage(
			received as WAMessage,
			'buffer',
			{},
			{ logger: alice.sock.logger, reuploadRequest: m => alice.sock.updateMediaMessage(m) }
		)

		expect(Buffer.isBuffer(buffer)).toBe(true)
		expect(buffer.length).toBeGreaterThan(0)
	})

	// ── Read receipts ──

	test('Bob sends → Alice reads → readMessages completes without error', async () => {
		const text = `Read me ${Date.now()}`

		const aliceGotIt = waitForMessage(alice.sock, m => getTextContent(m) === text && !m.key?.fromMe)
		await bob.sock.sendMessage(alice.jid, { text })
		const received = await aliceGotIt

		// Verify we have the required fields for read receipt
		expect(received.key?.remoteJid).toBeTruthy()
		expect(received.key?.id).toBeTruthy()

		// Should not throw
		await expect(
			alice.sock.readMessages([
				{
					remoteJid: received.key!.remoteJid!,
					id: received.key!.id!,
					participant: received.key!.participant ?? undefined
				}
			])
		).resolves.toBeUndefined()
	})

	// ── Forward ──

	test('Alice sends to self → forwards to Bob → Bob gets forwarded content', async () => {
		const text = `Forward me ${Date.now()}`
		const sent = await alice.sock.sendMessage(alice.jid, { text })
		expect(sent).toBeDefined()

		const bobGotForward = waitForMessage(bob.sock, m => getTextContent(m) === text && !m.key?.fromMe)

		await alice.sock.sendMessage(bob.jid, { forward: sent! })
		const forwarded = await bobGotForward

		// Content matches
		expect(getTextContent(forwarded)).toBe(text)
		// Different message ID (it's a new message, not the same one)
		expect(forwarded.key!.id).not.toBe(sent!.key.id)
		// Sender is Alice
		expect(forwarded.key?.remoteJid).toBe(alice.jid)
	})

	// ── Contact card ──

	test('Alice sends vCard → Bob receives it with correct fields', async () => {
		const vcard = 'BEGIN:VCARD\nVERSION:3.0\nFN:Test Contact\nTEL;type=CELL:+1234567890\nEND:VCARD'

		const bobGotContact = waitForMessage(bob.sock, m => !!m.message?.contactMessage?.vcard && !m.key?.fromMe)

		await alice.sock.sendMessage(bob.jid, {
			contacts: { displayName: 'Test Contact', contacts: [{ vcard }] }
		})

		const received = await bobGotContact

		expect(received.message?.contactMessage).toBeDefined()
		expect(received.message?.contactMessage?.vcard).toContain('FN:Test Contact')
		expect(received.message?.contactMessage?.vcard).toContain('+1234567890')
		expect(received.key?.fromMe).toBe(false)
		expect(received.key?.remoteJid).toBe(alice.jid)
	})
})
