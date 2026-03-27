import type { SocketContext } from './types'

export const makeNewsletterMethods = (ctx: SocketContext) => ({
	newsletterCreate: async (name: string, description?: string) => {
		return ctx.getClient().newsletterCreate(name, description)
	},

	newsletterMetadata: async (jid: string) => {
		return ctx.getClient().newsletterMetadata(jid)
	},

	newsletterSubscribe: async (jid: string) => {
		return ctx.getClient().newsletterSubscribe(jid)
	},

	newsletterUnsubscribe: async (jid: string) => {
		await ctx.getClient().newsletterUnsubscribe(jid)
	},

	newsletterReactMessage: async (jid: string, serverId: string, reaction?: string) => {
		await ctx.ensureInit()
		await ctx.getClient().newsletterReactMessage(jid, serverId, reaction ?? null)
	}
})
