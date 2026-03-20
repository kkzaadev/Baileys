import type { SocketContext } from './types'

export const makePresenceMethods = (ctx: SocketContext) => ({
	sendPresence: async (status: 'available' | 'unavailable') => {
		await ctx.getClient().sendPresence(status)
	},

	presenceSubscribe: async (jid: string) => {
		await ctx.getClient().presenceSubscribe(jid)
	},

	sendChatState: async (jid: string, state: 'composing' | 'recording' | 'paused') => {
		await ctx.getClient().sendChatState(jid, state)
	}
})
