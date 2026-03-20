import { Boom } from '@hapi/boom'
import { WAProto } from '../Types'
import type { AnyMessageContent, BaileysEventMap, MediaConnInfo, MessageGenerationOptions, WAMessage } from '../Types'
import { generateWAMessage, getContentType, normalizeMessageContent } from '../Utils/messages'
import { getWAUploadToServer, setMediaHost } from '../Utils/messages-media'
import { jidNormalizedUser } from '../WABinary/index'
import type { SocketContext } from './types'

export const makeMessageMethods = (ctx: SocketContext) => ({
	sendMessage: async (
		jid: string,
		content: AnyMessageContent,
		options?: Omit<MessageGenerationOptions, 'upload' | 'logger' | 'userJid' | 'mediaInNote' | 'statusJidList'>
	): Promise<WAMessage | undefined> => {
		await ctx.ensureInit()
		const client = ctx.getClient()
		const user = ctx.getUser()
		const userJid = user?.id ? jidNormalizedUser(user.id) : ''

		const fullMsg = await generateWAMessage(jid, content, {
			...ctx.fullConfig,
			...options,
			logger: ctx.logger,
			userJid,
			upload: getWAUploadToServer(ctx.fullConfig, async (force = false) => {
				const conn = (await client.getMediaConn(force)) as MediaConnInfo
				if (conn.hosts[0]) setMediaHost(conn.hosts[0].hostname)
				return conn
			})
		})

		const msg = normalizeMessageContent(fullMsg.message)
		if (!msg) throw new Boom('Failed to generate message content', { statusCode: 400 })

		const contentType = getContentType(msg)

		if (contentType === 'protocolMessage') {
			const protoMsg = msg.protocolMessage
			if (protoMsg?.type === WAProto.Message.ProtocolMessage.Type.REVOKE && protoMsg?.key) {
				await client.revokeMessage(jid, protoMsg.key.id!)
				return fullMsg
			}
			if (protoMsg?.type === WAProto.Message.ProtocolMessage.Type.MESSAGE_EDIT && protoMsg?.key && protoMsg?.editedMessage) {
				const editBytes = WAProto.Message.encode(protoMsg.editedMessage).finish()
				const newMsgId = await client.editMessageBytes(jid, protoMsg.key.id!, editBytes)
				fullMsg.key.id = newMsgId || fullMsg.key.id
				return fullMsg
			}
		}

		const protoBytes = WAProto.Message.encode(msg).finish()
		const msgId = await client.sendMessageBytes(jid, protoBytes)
		fullMsg.key.id = msgId || fullMsg.key.id

		ctx.ev.emit('messages.upsert', {
			messages: [fullMsg],
			type: 'append'
		} as BaileysEventMap['messages.upsert'])

		return fullMsg
	},

	updateMediaMessage: async (msg: WAMessage): Promise<WAMessage> => msg,
})
