import { Boom } from '@hapi/boom'
import type { WhatsAppEvent, MessageInfo } from 'whatsapp-rust-bridge'
import { proto } from '../../WAProto/index.js'
import type { AuthenticationCreds, BaileysEventMap, ConnectionState, WAMessage, WAPresence } from '../Types'
import { DisconnectReason, WAProto } from '../Types'
import type { SocketContext } from './types'
import { jidStr } from './types'

/** Convert bridge message event data to a Baileys WAMessage */
export const bridgeMessageToWAMessage = (msgData: Record<string, unknown>, info: MessageInfo): WAMessage => {
	const message = msgData as unknown as proto.IMessage
	return WAProto.WebMessageInfo.fromObject({
		key: {
			remoteJid: jidStr(info.source.chat),
			fromMe: info.source.is_from_me,
			id: info.id,
			participant: info.source.is_group ? jidStr(info.source.sender) : undefined
		},
		message,
		messageTimestamp: info.timestamp,
		pushName: info.push_name,
		status: WAProto.WebMessageInfo.Status.SERVER_ACK
	}) as WAMessage
}

/** Create the event handler that maps bridge events → Baileys events */
export const makeEventHandler = (ctx: SocketContext) => {
	return (event: WhatsAppEvent) => {
		const { ev } = ctx

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
				ctx.setUser({ id, lid })
				ev.emit('creds.update', {
					me: { id, lid },
					registered: true,
					platform: event.data.platform
				} as Partial<AuthenticationCreds>)
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
				ev.emit('messages.upsert', { messages: [waMsg], type: 'notify' } as BaileysEventMap['messages.upsert'])
				break
			}

			case 'receipt': {
				const d = event.data
				const chat = d.source.chat
				const sender = d.source.sender
				if (chat && d.message_ids?.length) {
					ev.emit('message-receipt.update', [{
						key: {
							remoteJid: jidStr(chat),
							id: d.message_ids[0],
							fromMe: d.source.is_from_me,
							participant: d.source.is_group ? jidStr(sender) : undefined
						},
						receipt: { receiptTimestamp: d.timestamp }
					}])
				}
				break
			}

			case 'presence': {
				const d = event.data
				if (d.from) {
					const jid = jidStr(d.from)
					ev.emit('presence.update', {
						id: jid,
						presences: {
							[jid]: {
								lastKnownPresence: (d.unavailable ? 'unavailable' : 'available') as WAPresence,
								lastSeen: d.last_seen ?? undefined
							}
						}
					})
				}
				break
			}

			case 'chat_presence': {
				const d = event.data
				const chat = d.source.chat
				const sender = d.source.sender
				if (chat && sender) {
					ev.emit('presence.update', {
						id: jidStr(chat),
						presences: {
							[jidStr(sender)]: {
								lastKnownPresence: (d.state || 'composing') as WAPresence
							}
						}
					})
				}
				break
			}

			case 'group_update': {
				const d = event.data
				if (d.group_jid) {
					ev.emit('groups.update', [{ id: jidStr(d.group_jid) }] as BaileysEventMap['groups.update'])
				}
				break
			}

			case 'picture_update': {
				const d = event.data
				if (d.jid) {
					ev.emit('contacts.update', [{ id: jidStr(d.jid), imgUrl: 'changed' }])
				}
				break
			}

			case 'push_name_update': {
				const d = event.data
				if (d.jid) {
					ev.emit('contacts.update', [{ id: jidStr(d.jid), notify: d.new_push_name }])
				}
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
				ctx.logger.debug({ eventType: event.type }, 'unhandled bridge event')
		}
	}
}
