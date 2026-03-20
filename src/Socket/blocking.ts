import type { SocketContext } from './types'

export const makeBlockingMethods = (ctx: SocketContext) => ({
	updateBlockStatus: async (jid: string, action: 'block' | 'unblock') => {
		await ctx.getClient().updateBlockStatus(jid, action)
	},

	fetchBlocklist: async () => {
		return ctx.getClient().fetchBlocklist()
	},
})
