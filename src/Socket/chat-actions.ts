import type { ChatModification } from '../Types'
import type { SocketContext } from './types'

export const makeChatActionMethods = (ctx: SocketContext) => ({
	pinChat: async (jid: string, pin: boolean) => {
		await ctx.getClient().pinChat(jid, pin)
	},

	muteChat: async (jid: string, muteUntil?: number | null) => {
		await ctx.getClient().muteChat(jid, muteUntil)
	},

	archiveChat: async (jid: string, archive: boolean) => {
		await ctx.getClient().archiveChat(jid, archive)
	},

	starMessage: async (jid: string, messageId: string, star: boolean) => {
		await ctx.getClient().starMessage(jid, messageId, star)
	},

	/**
	 * Compatibility wrapper for original Baileys chatModify API.
	 * Routes to the appropriate bridge method based on the modification type.
	 */
	chatModify: async (mod: ChatModification, jid: string) => {
		const client = ctx.getClient()
		if ('archive' in mod) {
			await client.archiveChat(jid, mod.archive)
		} else if ('pin' in mod) {
			await client.pinChat(jid, mod.pin)
		} else if ('mute' in mod) {
			await client.muteChat(jid, mod.mute)
		} else if ('star' in mod) {
			for (const msg of mod.star.messages) {
				await client.starMessage(jid, msg.id, mod.star.star)
			}
		} else if ('markRead' in mod) {
			// markRead through chatModify — not directly supported,
			// use readMessages() instead for proper read receipts
			ctx.logger.debug({ jid }, 'chatModify markRead — use readMessages() for read receipts')
		} else if ('pushNameSetting' in mod) {
			await client.setPushName(mod.pushNameSetting)
		} else {
			ctx.logger.debug({ mod: Object.keys(mod) }, 'chatModify action not supported in bridge mode')
		}
	}
})
