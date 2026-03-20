import type { SocketContext } from './types'

export const makeProfileMethods = (ctx: SocketContext) => ({
	requestPairingCode: async (phoneNumber: string, customPairingCode?: string): Promise<string> => {
		await ctx.ensureInit()
		return ctx.getClient().requestPairingCode(phoneNumber, customPairingCode)
	},

	setPushName: async (name: string) => {
		await ctx.getClient().setPushName(name)
	},

	getPushName: async () => {
		return ctx.getClient().getPushName()
	},

	getJid: async () => {
		return ctx.getClient().getJid()
	},

	getLid: async () => {
		return ctx.getClient().getLid()
	},

	updateProfilePicture: async (jid: string, imgData: Uint8Array) => {
		return ctx.getClient().updateProfilePicture(imgData)
	},

	removeProfilePicture: async () => {
		return ctx.getClient().removeProfilePicture()
	},

	updateProfileStatus: async (status: string) => {
		await ctx.getClient().updateProfileStatus(status)
	},
})
