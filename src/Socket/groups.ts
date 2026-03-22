import type { GroupMetadataResult } from 'whatsapp-rust-bridge'
import type { GroupMetadata } from '../Types'
import type { SocketContext } from './types'

/** Convert bridge GroupMetadataResult to Baileys GroupMetadata */
function bridgeGroupToMetadata(g: GroupMetadataResult): GroupMetadata {
	return {
		id: g.id,
		subject: g.subject,
		owner: g.creator,
		creation: g.creationTime,
		desc: g.description,
		descId: g.descriptionId,
		restrict: g.isLocked,
		announce: g.isAnnouncement,
		size: g.size,
		participants: g.participants.map(p => ({
			id: p.jid,
			isAdmin: p.isAdmin,
			admin: p.isAdmin ? ('admin' as const) : null
		})),
		ephemeralDuration: g.ephemeralExpiration,
		subjectOwner: g.subjectOwner,
		subjectTime: g.subjectTime,
		joinApprovalMode: g.membershipApproval
	}
}

export const makeGroupMethods = (ctx: SocketContext) => ({
	groupMetadata: async (jid: string): Promise<GroupMetadata> => {
		const g = await ctx.getClient().getGroupMetadata(jid)
		return bridgeGroupToMetadata(g)
	},

	groupCreate: async (subject: string, participants: string[]) => {
		return ctx.getClient().createGroup(subject, participants)
	},

	groupLeave: async (jid: string) => {
		await ctx.getClient().groupLeave(jid)
	},

	groupUpdateSubject: async (jid: string, subject: string) => {
		await ctx.getClient().groupUpdateSubject(jid, subject)
	},

	groupUpdateDescription: async (jid: string, description?: string) => {
		await ctx.getClient().groupUpdateDescription(jid, description)
	},

	groupParticipantsUpdate: async (
		jid: string,
		participants: string[],
		action: 'add' | 'remove' | 'promote' | 'demote'
	) => {
		return ctx.getClient().groupParticipantsUpdate(jid, participants, action)
	},

	groupFetchAllParticipating: async (): Promise<Record<string, GroupMetadata>> => {
		const bridgeGroups = await ctx.getClient().groupFetchAllParticipating()
		const result: Record<string, GroupMetadata> = {}
		for (const [groupJid, g] of Object.entries(bridgeGroups)) {
			result[groupJid] = bridgeGroupToMetadata(g)
		}

		return result
	},

	groupInviteCode: async (jid: string): Promise<string> => {
		return ctx.getClient().groupInviteCode(jid)
	},

	groupRevokeInvite: async (jid: string): Promise<string> => {
		return ctx.getClient().groupRevokeInvite(jid)
	},

	groupSettingUpdate: async (jid: string, setting: 'locked' | 'announce' | 'membership_approval', value: boolean) => {
		await ctx.getClient().groupSettingUpdate(jid, setting, value)
	},

	groupToggleEphemeral: async (jid: string, expiration: number) => {
		await ctx.getClient().groupToggleEphemeral(jid, expiration)
	},

	groupAcceptInvite: async (code: string): Promise<string | undefined> => {
		return ctx.getClient().groupAcceptInvite(code)
	},

	/** Join a group via a GroupInviteMessage (V4 invite). */
	groupAcceptInviteV4: async (
		key: { remoteJid?: string | null },
		msg: { inviteCode?: string | null; inviteExpiration?: number | null; groupJid?: string | null }
	): Promise<string | undefined> => {
		if (!msg.inviteCode || !msg.groupJid) return undefined
		const adminJid = key.remoteJid || ''
		return ctx.getClient().groupAcceptInviteV4(msg.groupJid, msg.inviteCode, msg.inviteExpiration || 0, adminJid)
	},

	groupGetInviteInfo: async (code: string): Promise<GroupMetadata> => {
		const g = await ctx.getClient().groupGetInviteInfo(code)
		return bridgeGroupToMetadata(g)
	},

	groupRequestParticipantsList: async (jid: string) => {
		return ctx.getClient().groupRequestParticipantsList(jid)
	},

	groupRequestParticipantsUpdate: async (jid: string, participants: string[], action: 'approve' | 'reject') => {
		return ctx.getClient().groupRequestParticipantsUpdate(jid, participants, action)
	}
})
