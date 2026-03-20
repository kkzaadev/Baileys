import { Boom } from '@hapi/boom'
import type { WhatsAppEvent, MessageInfo } from 'whatsapp-rust-bridge'
import { proto } from '../../WAProto/index.js'
import type { AuthenticationCreds, BaileysEventMap, ConnectionState, WAMessage, WAPresence } from '../Types'
import { DisconnectReason, WAProto } from '../Types'
import type { SocketContext } from './types'
import { jidStr } from './types'

/** Convert bridge message event data to a Baileys WAMessage */
const bridgeMessageToWAMessage = (msgData: Record<string, unknown>, info: MessageInfo): WAMessage => {
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
			// ── Connection lifecycle ──
			case 'connected':
				// whatsapp-rust already sends available presence on connect internally
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

			case 'pairing_code':
				ev.emit('connection.update', { qr: event.data.code } as Partial<ConnectionState>)
				break

			case 'pair_success': {
				const { id, lid } = event.data
				ctx.setUser({ id, lid })
				const creds = ctx.fullConfig.auth.creds
				creds.me = { id, lid }
				creds.registered = true
				creds.platform = event.data.platform
				ev.emit('creds.update', creds)
				break
			}

			case 'pair_error':
				ev.emit('connection.update', {
					connection: 'close',
					lastDisconnect: {
						error: new Boom('Pairing failed: ' + event.data.error, {
							statusCode: DisconnectReason.connectionClosed
						}),
						date: new Date()
					}
				} as Partial<ConnectionState>)
				break

			case 'logged_out':
				ev.emit('connection.update', {
					connection: 'close',
					lastDisconnect: {
						error: new Boom('Logged out', { statusCode: DisconnectReason.loggedOut }),
						date: new Date()
					}
				} as Partial<ConnectionState>)
				break

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

			case 'client_outdated':
				ev.emit('connection.update', {
					connection: 'close',
					lastDisconnect: {
						error: new Boom('Client outdated', { statusCode: DisconnectReason.badSession }),
						date: new Date()
					}
				} as Partial<ConnectionState>)
				break

			case 'temporary_ban':
				ev.emit('connection.update', {
					connection: 'close',
					lastDisconnect: {
						error: new Boom('Temporary ban', { statusCode: DisconnectReason.forbidden }),
						date: new Date()
					}
				} as Partial<ConnectionState>)
				break

			// ── Messages ──
			case 'message': {
				const { message: msgData, info } = event.data
				const chatJid = jidStr(info.source.chat)

				// Filter ignored JIDs
				if (ctx.fullConfig.shouldIgnoreJid?.(chatJid)) {
					break
				}

				// Skip own events if emitOwnEvents is false
				if (!ctx.fullConfig.emitOwnEvents && info.source.is_from_me) {
					break
				}

				const waMsg = bridgeMessageToWAMessage(msgData, info)
				ev.emit('messages.upsert', { messages: [waMsg], type: 'notify' } as BaileysEventMap['messages.upsert'])
				break
			}

			case 'receipt': {
				const d = event.data
				const chat = d.source.chat
				const sender = d.source.sender
				const firstId = d.message_ids?.[0]
				if (chat && firstId) {
					ev.emit('message-receipt.update', [{
						key: {
							remoteJid: jidStr(chat),
							id: firstId,
							fromMe: d.source.is_from_me,
							participant: d.source.is_group ? jidStr(sender) : undefined
						},
						receipt: { receiptTimestamp: d.timestamp }
					}])
				}
				break
			}

			// ── Contacts ──
			case 'push_name_update': {
				const d = event.data
				if (d.jid) {
					ev.emit('contacts.update', [{ id: jidStr(d.jid), notify: d.new_push_name }])
				}
				break
			}

			case 'contact_update': {
				const d = event.data
				if (d.jid) {
					ev.emit('contacts.update', [{ id: jidStr(d.jid) }])
				}
				break
			}

			case 'contact_updated': {
				const d = event.data
				if (d.jid) {
					ev.emit('contacts.update', [{ id: jidStr(d.jid) }])
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

			case 'self_push_name_updated': {
				const d = event.data
				const creds = ctx.fullConfig.auth.creds
				if (d.new_name && creds.me) {
					creds.me.name = d.new_name
					ev.emit('creds.update', creds)
				}
				break
			}

			// ── Presence ──
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

			// ── Groups ──
			case 'group_update': {
				const d = event.data
				if (d.group_jid) {
					ev.emit('groups.update', [{ id: jidStr(d.group_jid) }] as BaileysEventMap['groups.update'])
				}
				break
			}

			// ── Chat state updates (app state sync) ──
			case 'archive_update': {
				const d = event.data
				if (d.jid) {
					ev.emit('chats.update', [{ id: jidStr(d.jid), archived: true }])
				}
				break
			}

			case 'pin_update': {
				const d = event.data
				if (d.jid) {
					ev.emit('chats.update', [{ id: jidStr(d.jid), pinned: d.timestamp || undefined }])
				}
				break
			}

			case 'mute_update': {
				const d = event.data
				if (d.jid) {
					ev.emit('chats.update', [{ id: jidStr(d.jid), muteEndTime: d.timestamp || undefined }])
				}
				break
			}

			case 'star_update': {
				const d = event.data
				if (d.chat_jid && d.message_id) {
					ev.emit('messages.update', [{
						key: {
							remoteJid: jidStr(d.chat_jid),
							id: d.message_id,
							fromMe: d.from_me,
							participant: d.participant_jid ? jidStr(d.participant_jid) : undefined
						},
						update: { starred: !!(d.action as Record<string, unknown>)?.starred }
					}])
				}
				break
			}

			case 'mark_chat_as_read_update': {
				const d = event.data
				if (d.jid) {
					ev.emit('chats.update', [{ id: jidStr(d.jid), unreadCount: 0 }])
				}
				break
			}

			// ── Sync events ──
			case 'offline_sync_completed':
			case 'offline_sync_preview':
				// Internal sync signals — no Baileys event equivalent
				break

			case 'history_sync':
				// History sync data — complex mapping, handled by bridge internally
				ctx.logger.debug('history_sync event received (handled by bridge)')
				break

			// ── Device/account ──
			case 'device_list_update':
				// Device list changed — bridge handles session updates internally
				break

			case 'disappearing_mode_changed':
				// Handled by bridge internally
				break

			case 'stream_replaced':
				ev.emit('connection.update', {
					connection: 'close',
					lastDisconnect: {
						error: new Boom('Connection replaced', { statusCode: DisconnectReason.connectionReplaced }),
						date: new Date()
					}
				} as Partial<ConnectionState>)
				break

			case 'qr_scanned_without_multidevice':
				ctx.logger.warn('QR scanned but multi-device not enabled on phone')
				break

			// ── Other ──
			case 'undecryptable_message':
				ctx.logger.warn({ event: event.data }, 'undecryptable message received')
				break

			case 'notification':
			case 'business_status_update':
			case 'newsletter_live_update':
			case 'contact_number_changed':
			case 'contact_sync_requested':
			case 'user_about_update':
			case 'joined_group':
				// These events exist but have no standard Baileys equivalent
				ctx.logger.trace({ eventType: event.type }, 'bridge event (no Baileys mapping)')
				break

			default:
				ctx.logger.debug({ eventType: (event as { type: string }).type }, 'unknown bridge event')
		}
	}
}
