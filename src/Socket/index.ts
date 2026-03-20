import { Boom } from '@hapi/boom'
import WebSocket from 'ws'
import { proto } from '../../WAProto/index.js'
import {
	createWhatsAppClient,
	initWasmEngine,
	type GroupMetadataResult as BridgeGroupMetadataResult,
	type JsHttpClientConfig,
	type JsTransportCallbacks,
	type JsTransportHandle,
	type MessageInfo,
	type WasmWhatsAppClient,
	type WhatsAppEvent
} from 'whatsapp-rust-bridge'
import { DEFAULT_CONNECTION_CONFIG } from '../Defaults/index'
import type {
	AnyMessageContent,
	AuthenticationCreds,
	BaileysEventEmitter,
	BaileysEventMap,
	ConnectionState,
	GroupMetadata,
	MediaConnInfo,
	MessageGenerationOptions,
	UserFacingSocketConfig,
	WAMessage
} from '../Types'
import { DisconnectReason, WAProto } from '../Types'
import { makeEventBuffer } from '../Utils/event-buffer'
import { generateWAMessage, getContentType, normalizeMessageContent } from '../Utils/messages'
import { getWAUploadToServer, setMediaHost } from '../Utils/messages-media'
import { jidNormalizedUser } from '../WABinary/index'

let wasmInitialized = false

const makeWASocket = (config: UserFacingSocketConfig) => {
	const fullConfig = { ...DEFAULT_CONNECTION_CONFIG, ...config }
	const { auth, logger, waWebSocketUrl, agent, fetchAgent } = fullConfig

	const ev = makeEventBuffer(logger)
	let client: WasmWhatsAppClient | undefined
	let user: { id?: string; lid?: string } | undefined

	// ── Transport adapter ──
	const makeTransport = (): JsTransportCallbacks => {
		let ws: WebSocket | undefined
		let handle: JsTransportHandle | undefined
		// The WS that disconnect() should close. During reconnection the bridge calls:
		// create_transport() → connect(new) → disconnect(old)
		// connect() sets ws=newWs BEFORE disconnect() runs, so without this,
		// disconnect() would kill the new connection. disconnectTarget captures
		// the OLD ws at connect() time.
		let disconnectTarget: WebSocket | undefined

		return {
			connect(h: JsTransportHandle) {
				handle = h
				const url = typeof waWebSocketUrl === 'string' ? waWebSocketUrl : waWebSocketUrl.toString()

				const wsOpts: WebSocket.ClientOptions = {}
				if (agent) {
					wsOpts.agent = agent as unknown as WebSocket.ClientOptions['agent']
				}

				// Capture the old WS as the disconnect target before replacing
				disconnectTarget = ws
				if (ws) {
					ws.removeAllListeners()
				}

				const newWs = new WebSocket(url, wsOpts)
				newWs.binaryType = 'arraybuffer'
				ws = newWs

				return new Promise<void>((resolve, reject) => {
					newWs.on('open', () => {
						if (ws !== newWs) return
						handle?.onConnected()
						resolve()
					})
					newWs.on('message', (data: ArrayBuffer | Buffer) => {
						if (ws !== newWs) return
						// binaryType='arraybuffer' → data is ArrayBuffer, wrap as view (no copy)
						// If Buffer (shouldn't happen), use subarray to avoid slice copy
						const arr = data instanceof ArrayBuffer
							? new Uint8Array(data)
							: new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
						handle?.onData(arr)
					})
					newWs.on('close', () => {
						if (ws !== newWs) return
						handle?.onDisconnected()
					})
					newWs.on('error', (err: Error) => {
						if (ws !== newWs) return
						logger.error({ err }, 'WebSocket error')
						reject(err)
					})
				})
			},
			send(data: Uint8Array) {
				if (ws?.readyState === WebSocket.OPEN) {
					ws.send(data)
				}
			},
			disconnect() {
				// Close the disconnect target (the OLD ws), not the current ws
				// which might already be a new connection from a concurrent connect()
				const toClose = disconnectTarget ?? ws
				if (toClose) {
					toClose.removeAllListeners()
					toClose.on('error', () => {})
					try { toClose.close() } catch { toClose.terminate() }
				}
				if (toClose === ws) {
					ws = undefined
				}
				disconnectTarget = undefined
			}
		}
	}

	// ── HTTP adapter ──
	const makeHttpClient = (): JsHttpClientConfig => ({
		async execute(url, method, headers, body) {
			const fetchOpts: RequestInit = { method, headers }
			if (body) {
				fetchOpts.body = body as unknown as BodyInit
			}
			if (fetchAgent) {
				fetchOpts.dispatcher = fetchAgent as unknown as RequestInit['dispatcher']
			}

			const resp = await fetch(url, fetchOpts)
			const buf = new Uint8Array(await resp.arrayBuffer())
			return { statusCode: resp.status, body: buf }
		}
	})

	// ── Jid struct → string ──
	const jidStr = (jid: { user: string; server: string }): string => `${jid.user}@${jid.server}`

	// ── Convert bridge message to WAMessage ──
	const bridgeMessageToWAMessage = (msgData: Record<string, unknown>, info: MessageInfo): WAMessage => {
		const message = msgData as unknown as proto.IMessage
		const isFromMe = info.source.is_from_me
		const remoteJid = jidStr(info.source.chat)
		const participant = info.source.is_group ? jidStr(info.source.sender) : undefined

		return WAProto.WebMessageInfo.fromObject({
			key: {
				remoteJid,
				fromMe: isFromMe,
				id: info.id,
				participant
			},
			message,
			messageTimestamp: info.timestamp,
			pushName: info.push_name,
			status: WAProto.WebMessageInfo.Status.SERVER_ACK
		}) as WAMessage
	}

	// ── Event handler ──
	const handleEvent = (event: WhatsAppEvent) => {
		switch (event.type) {
			case 'connected':
				ev.emit('connection.update', { connection: 'open' } as Partial<ConnectionState>)
				break
			case 'disconnected':
				ev.emit('connection.update', {
					connection: 'close',
					lastDisconnect: {
						error: new Boom('Connection closed', { statusCode: DisconnectReason.connectionClosed }),
						date: new Date()
					}
				} as Partial<ConnectionState>)
				break
			case 'qr':
				ev.emit('connection.update', { qr: event.data.code } as Partial<ConnectionState>)
				break
			case 'pair_success': {
				const { id, lid } = event.data
				user = { id, lid }
				const credsUpdate: Partial<AuthenticationCreds> = {
					me: { id, lid },
					registered: true,
					platform: event.data.platform
				}
				ev.emit('creds.update', credsUpdate)
				break
			}
			case 'logged_out':
				ev.emit('connection.update', {
					connection: 'close',
					lastDisconnect: {
						error: new Boom('Logged out', { statusCode: DisconnectReason.loggedOut }),
						date: new Date()
					}
				} as Partial<ConnectionState>)
				break
			case 'message': {
				const { message: msgData, info } = event.data
				const waMsg = bridgeMessageToWAMessage(msgData, info)
				ev.emit('messages.upsert', {
					messages: [waMsg],
					type: 'notify'
				} as BaileysEventMap['messages.upsert'])
				break
			}
			case 'connect_failure':
				ev.emit('connection.update', {
					connection: 'close',
					lastDisconnect: {
						error: new Boom(event.data.message || 'Connection failure', {
							statusCode: DisconnectReason.connectionClosed
						}),
						date: new Date()
					}
				} as Partial<ConnectionState>)
				break
			case 'stream_error':
				ev.emit('connection.update', {
					connection: 'close',
					lastDisconnect: {
						error: new Boom('Stream error: ' + event.data.code, {
							statusCode: DisconnectReason.badSession
						}),
						date: new Date()
					}
				} as Partial<ConnectionState>)
				break
			default:
				logger.debug({ eventType: event.type }, 'unhandled bridge event')
		}
	}

	// ── Initialize and connect ──
	const init = async () => {
		if (!wasmInitialized) {
			initWasmEngine()
			wasmInitialized = true
		}

		ev.emit('connection.update', { connection: 'connecting' } as Partial<ConnectionState>)

		// Restore user from creds if available
		if (auth.creds.me) {
			user = { id: auth.creds.me.id, lid: auth.creds.me.lid }
		}

		client = await createWhatsAppClient(makeTransport(), makeHttpClient(), handleEvent)

		// Start the client (non-blocking)
		client.run()
	}

	// Fire init immediately — store error so subsequent awaits get it too
	let initError: Error | undefined
	const initPromise = init().catch(err => {
		initError = err instanceof Error ? err : new Error(String(err))
		logger.error({ err }, 'failed to initialize bridge client')
	})

	const ensureInit = async () => {
		await initPromise
		if (initError) {
			throw new Boom('Bridge client failed to initialize: ' + initError.message, { statusCode: 500 })
		}
	}

	// ── sendMessage ──
	const sendMessage = async (
		jid: string,
		content: AnyMessageContent,
		options?: Omit<MessageGenerationOptions, 'upload' | 'logger' | 'userJid' | 'mediaInNote' | 'statusJidList'>
	): Promise<WAMessage | undefined> => {
		await ensureInit()

		const userJid = user?.id ? jidNormalizedUser(user.id) : ''

		// Build the full WAMessage using existing Baileys utilities
		const fullMsg = await generateWAMessage(jid, content, {
			...fullConfig,
			...options,
			logger,
			userJid,
			upload: getWAUploadToServer(fullConfig, async (force = false) => {
				const conn = (await client!.getMediaConn(force)) as MediaConnInfo
				if (conn.hosts[0]) {
					setMediaHost(conn.hosts[0].hostname)
				}

				return conn
			})
		})

		const msg = normalizeMessageContent(fullMsg.message)
		if (!msg) {
			throw new Boom('Failed to generate message content', { statusCode: 400 })
		}

		if (!client) {
			throw new Boom('Client not initialized', { statusCode: 500 })
		}

		// Determine what to send via bridge
		const contentType = getContentType(msg)

		if (contentType === 'protocolMessage') {
			const protoMsg = msg.protocolMessage
			if (protoMsg?.type === WAProto.Message.ProtocolMessage.Type.REVOKE && protoMsg?.key) {
				await client.revokeMessage(jid, protoMsg.key.id!)
				return fullMsg
			}

			if (
				protoMsg?.type === WAProto.Message.ProtocolMessage.Type.MESSAGE_EDIT &&
				protoMsg?.key &&
				protoMsg?.editedMessage
			) {
				const editBytes = WAProto.Message.encode(protoMsg.editedMessage).finish()
				const newMsgId = await client.editMessageBytes(jid, protoMsg.key.id!, editBytes)
				fullMsg.key.id = newMsgId || fullMsg.key.id
				return fullMsg
			}
		}

		// Encode to protobuf binary then pass to bridge
		const protoBytes = WAProto.Message.encode(msg).finish()
		const msgId = await client.sendMessageBytes(jid, protoBytes)
		fullMsg.key.id = msgId || fullMsg.key.id

		// Emit the sent message so listeners can see it
		ev.emit('messages.upsert', {
			messages: [fullMsg],
			type: 'append'
		} as BaileysEventMap['messages.upsert'])

		return fullMsg
	}

	// ── groupFetchAllParticipating ──
	const groupFetchAllParticipating = async (): Promise<Record<string, GroupMetadata>> => {
		await ensureInit()
		if (!client) {
			throw new Boom('Client not initialized', { statusCode: 500 })
		}

		const bridgeGroups = await client.groupFetchAllParticipating()
		const result: Record<string, GroupMetadata> = {}
		for (const [groupJid, g] of Object.entries(bridgeGroups)) {
			result[groupJid] = bridgeGroupToMetadata(g)
		}

		return result
	}

	// ── end ──
	const end = async (_error?: Error) => {
		if (client) {
			try {
				await client.disconnect()
			} catch {
				// ignore disconnect errors
			}
			client.free()
			client = undefined
		}
	}

	return {
		ev,
		logger,
		get user() {
			return user
		},
		sendMessage,
		groupFetchAllParticipating,
		updateMediaMessage: async (msg: WAMessage): Promise<WAMessage> => msg,
		end
	}
}

/** Convert bridge group metadata to Baileys GroupMetadata */
function bridgeGroupToMetadata(g: BridgeGroupMetadataResult): GroupMetadata {
	return {
		id: g.id,
		subject: g.subject,
		owner: g.creator,
		creation: g.creationTime,
		desc: g.description,
		descId: g.descriptionId,
		restrict: g.isLocked,
		announce: g.isAnnouncement,
		size: g.size,
		participants: g.participants.map(p => ({
			id: p.jid,
			isAdmin: p.isAdmin,
			admin: p.isAdmin ? 'admin' as const : null
		})),
		ephemeralDuration: g.ephemeralExpiration,
		subjectOwner: g.subjectOwner,
		subjectTime: g.subjectTime,
		joinApprovalMode: g.membershipApproval
	}
}

export default makeWASocket
