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
})
