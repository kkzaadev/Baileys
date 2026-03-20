import { Boom } from '@hapi/boom'
import { WAProto } from '../Types'
import type { AnyMessageContent, BaileysEventMap, MediaConnInfo, MessageGenerationOptions, WAMessage, WAMessageContent } from '../Types'
import { generateWAMessage, getContentType, normalizeMessageContent } from '../Utils/messages'
import { getWAUploadToServer, setMediaHost, getUrlFromDirectPath } from '../Utils/messages-media'
import { jidNormalizedUser } from '../WABinary/index'
import type { SocketContext } from './types'

/** Extract the media content from a WAMessage (image, video, audio, document, sticker) */
function getMediaContent(content: WAMessageContent | null | undefined) {
	return content?.imageMessage
		|| content?.videoMessage
		|| content?.audioMessage
		|| content?.documentMessage
		|| content?.stickerMessage
}

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

		// Send via bridge — use serde path with snake_case conversion in Rust.
		// Strip messageContextInfo as it's handled internally by the bridge.
		const cleanMsg = { ...msg } as Record<string, unknown>
		delete cleanMsg.messageContextInfo
		const msgId = await client.sendMessage(jid, cleanMsg)
		fullMsg.key.id = msgId || fullMsg.key.id

		ctx.ev.emit('messages.upsert', {
			messages: [fullMsg],
			type: 'append'
		} as BaileysEventMap['messages.upsert'])

		return fullMsg
	},

	updateMediaMessage: async (message: WAMessage): Promise<WAMessage> => {
		await ctx.ensureInit()
		const client = ctx.getClient()

		const content = normalizeMessageContent(message.message)
		const mediaContent = getMediaContent(content)
		if (!mediaContent) {
			throw new Boom('Not a media message', { statusCode: 400 })
		}

		const mediaKey = mediaContent.mediaKey
		if (!mediaKey) {
			throw new Boom('Message has no media key', { statusCode: 400 })
		}

		const key = message.key
		const newDirectPath = await client.requestMediaReupload(
			key.id!,
			key.remoteJid!,
			mediaKey instanceof Uint8Array ? mediaKey : new Uint8Array(mediaKey),
			!!key.fromMe,
			key.participant ?? null
		)

		// Update the message with the new URL
		mediaContent.directPath = newDirectPath
		mediaContent.url = getUrlFromDirectPath(newDirectPath)

		ctx.logger.debug(
			{ directPath: newDirectPath, msgId: key.id },
			'media reupload successful'
		)

		ctx.ev.emit('messages.update', [{
			key: message.key,
			update: { message: message.message }
		}])

		return message
	},
})
