/**
 * WAProto shim — routes protobuf encode/decode through whatsapp-rust-bridge
 * instead of the 97K-line protobufjs-generated file.
 *
 * Provides the same API surface that Baileys uses:
 *   proto.TypeName.encode(obj).finish()   → Uint8Array
 *   proto.TypeName.decode(buffer)         → decoded object (with .toJSON())
 *   proto.TypeName.create(obj)            → passthrough
 *   proto.TypeName.fromObject(obj)        → passthrough
 *   proto.TypeName.toObject(obj)          → passthrough
 *   proto.TypeName.EnumName.VALUE         → number
 */

import { encodeProto, decodeProto } from 'whatsapp-rust-bridge';

// ---------------------------------------------------------------------------
// Helper: create a proto class with encode/decode/create/fromObject/toObject
// ---------------------------------------------------------------------------
function createProtoClass(typeName) {
  return {
    encode(obj) {
      return {
        finish() {
          return encodeProto(typeName, obj);
        },
      };
    },
    decode(buffer) {
      const data = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
      const decoded = decodeProto(typeName, data);
      if (decoded && typeof decoded === 'object') {
        decoded.toJSON = function () { return this; };
      }
      return decoded;
    },
    create(obj) { return obj || {}; },
    fromObject(obj) { return obj; },
    toObject(obj) { return obj; },
  };
}

// ---------------------------------------------------------------------------
// Proto types with encode/decode used by Baileys
// ---------------------------------------------------------------------------

// Top-level types
const ADVDeviceIdentity = createProtoClass('AdvDeviceIdentity');
const ADVKeyIndexList = createProtoClass('AdvSignedKeyIndexList');
const ADVSignedDeviceIdentity = createProtoClass('AdvSignedDeviceIdentity');
const ADVSignedDeviceIdentityHMAC = createProtoClass('AdvSignedDeviceIdentityHmac');
const ADVSignedKeyIndexList = createProtoClass('AdvSignedKeyIndexList');
const CertChain = createProtoClass('CertChain');
const ClientPayload = createProtoClass('ClientPayload');
const DeviceProps = createProtoClass('DeviceProps');
const ExternalBlobReference = createProtoClass('ExternalBlobReference');
const HandshakeMessage = createProtoClass('HandshakeMessage');
const HistorySync = createProtoClass('HistorySync');
const LIDMigrationMappingSyncPayload = createProtoClass('LidMigrationMappingSyncPayload');
const MediaRetryNotification = createProtoClass('MediaRetryNotification');
const Message = createProtoClass('Message');
const SenderKeyDistributionMessage = createProtoClass('SenderKeyDistributionMessage');
const SenderKeyMessage = createProtoClass('SenderKeyMessage');
const ServerErrorReceipt = createProtoClass('ServerErrorReceipt');
const SyncActionData = createProtoClass('SyncActionData');
const SyncdMutations = createProtoClass('SyncdMutations');
const SyncdPatch = createProtoClass('SyncdPatch');
const SyncdSnapshot = createProtoClass('SyncdSnapshot');
const VerifiedNameCertificate = createProtoClass('VerifiedNameCertificate');
const WebMessageInfo = createProtoClass('WebMessageInfo');

// Additional types used passthrough (no encode/decode in bridge yet, but accessed)
const SyncdMutation = createProtoClass('SyncdMutation');
const SyncdRecord = createProtoClass('SyncdRecord');
const SyncActionValue = createProtoClass('SyncActionValue');
const ExitCode = createProtoClass('ExitCode');

// ---------------------------------------------------------------------------
// Nested types with encode/decode
// ---------------------------------------------------------------------------

// CertChain.NoiseCertificate.Details
CertChain.NoiseCertificate = createProtoClass('CertChain.NoiseCertificate');
CertChain.NoiseCertificate.Details = createProtoClass('CertChain.NoiseCertificate.Details');

// Message nested types
Message.PollVoteMessage = createProtoClass('Message.PollVoteMessage');
Message.EventResponseMessage = createProtoClass('Message.EventResponseMessage');

// Message nested stubs used with fromObject/create (passthrough)
Message.HistorySyncNotification = createProtoClass('Message');
Message.GroupInviteMessage = createProtoClass('Message');
Message.AppStateSyncKeyData = createProtoClass('Message');

// VerifiedNameCertificate.Details
VerifiedNameCertificate.Details = createProtoClass('VerifiedNameCertificate.Details');

// SenderKeyDistributionMessage (also accessed as Message.ISenderKeyDistributionMessage via types)

// ---------------------------------------------------------------------------
// Enums — all values referenced in Baileys source
// ---------------------------------------------------------------------------

// ADVEncryptionType
const ADVEncryptionType = { E2EE: 0, HOSTED: 1 };

// ClientPayload enums
ClientPayload.ConnectReason = { PUSH: 0, USER_ACTIVATED: 1, SCHEDULED: 2, ERROR_RECONNECT: 3, NETWORK_SWITCH: 4, PING_RECONNECT: 5, UNKNOWN: 6 };
ClientPayload.ConnectType = { CELLULAR_UNKNOWN: 0, WIFI_UNKNOWN: 1, CELLULAR_EDGE: 100, CELLULAR_IDEN: 101, CELLULAR_UMTS: 102, CELLULAR_EVDO: 103, CELLULAR_GPRS: 104, CELLULAR_HSDPA: 105, CELLULAR_HSUPA: 106, CELLULAR_HSPA: 107, CELLULAR_CDMA: 108, CELLULAR_1XRTT: 109, CELLULAR_EHRPD: 110, CELLULAR_LTE: 111, CELLULAR_HSPAP: 112 };
ClientPayload.AccountType = { DEFAULT: 0, GUEST: 1 };
ClientPayload.IOSAppExtension = { SHARE_EXTENSION: 0, SERVICE_EXTENSION: 1, INTENTS_EXTENSION: 2 };
ClientPayload.Product = { WHATSAPP: 0, MESSENGER: 1, INTEROP: 2, INTEROP_MSGR: 3, WHATSAPP_LID: 4 };
ClientPayload.TrafficAnonymization = { OFF: 0, STANDARD: 1 };

// ClientPayload.UserAgent
ClientPayload.UserAgent = {};
ClientPayload.UserAgent.Platform = { ANDROID: 0, IOS: 1, WINDOWS_PHONE: 2, BLACKBERRY: 3, BLACKBERRYX: 4, S40: 5, S60: 6, PYTHON_CLIENT: 7, TIZEN: 8, ENTERPRISE: 9, SMB_ANDROID: 10, KAIOS: 11, SMB_IOS: 12, WINDOWS: 13, WEB: 14, PORTAL: 15, GREEN_ANDROID: 16, GREEN_IPHONE: 17, BLUE_ANDROID: 18, BLUE_IPHONE: 19, FBLITE_ANDROID: 20, MLITE_ANDROID: 21, IGLITE_ANDROID: 22, PAGE: 23, MACOS: 24, OCULUS_MSG: 25, OCULUS_CALL: 26, MILAN: 27, CAPI: 28, WEAROS: 29, ARDEVICE: 30, VRDEVICE: 31, BLUE_WEB: 32, IPAD: 33, TEST: 34, SMART_GLASSES: 35, BLUE_VR: 36, AR_WRIST: 37 };
ClientPayload.UserAgent.ReleaseChannel = { RELEASE: 0, BETA: 1, ALPHA: 2, DEBUG: 3 };
ClientPayload.UserAgent.DeviceType = { PHONE: 0, TABLET: 1, DESKTOP: 2, WEARABLE: 3, VR: 4 };

// ClientPayload.WebInfo
ClientPayload.WebInfo = {};
ClientPayload.WebInfo.WebSubPlatform = { WEB_BROWSER: 0, APP_STORE: 1, WIN_STORE: 2, DARWIN: 3, WIN32: 4, WIN_HYBRID: 5 };

// ClientPayload.DNSSource
ClientPayload.DNSSource = {};
ClientPayload.DNSSource.DNSResolutionMethod = { SYSTEM: 0, GOOGLE: 1, HARDCODED: 2, OVERRIDE: 3, FALLBACK: 4, MNS: 5 };

// DeviceProps enums
DeviceProps.PlatformType = { UNKNOWN: 0, CHROME: 1, FIREFOX: 2, IE: 3, OPERA: 4, SAFARI: 5, EDGE: 6, DESKTOP: 7, IPAD: 8, ANDROID_TABLET: 9, OHANA: 10, ALOHA: 11, CATALINA: 12, TCL_TV: 13, IOS_PHONE: 14, IOS_CATALYST: 15, ANDROID_PHONE: 16, ANDROID_AMBIGUOUS: 17, WEAR_OS: 18, AR_WRIST: 19, AR_DEVICE: 20, UWP: 21, VR: 22, CLOUD_API: 23, SMARTGLASSES: 24 };

// HistorySync enums
HistorySync.HistorySyncType = { INITIAL_BOOTSTRAP: 0, INITIAL_STATUS_V3: 1, FULL: 2, RECENT: 3, PUSH_NAME: 4, NON_BLOCKING_DATA: 5, ON_DEMAND: 6 };
HistorySync.BotAIWaitListState = { IN_WAITLIST: 0, AI_AVAILABLE: 1 };

// MediaRetryNotification enums
MediaRetryNotification.ResultType = { GENERAL_ERROR: 0, SUCCESS: 1, NOT_FOUND: 2, DECRYPTION_ERROR: 3 };

// Message nested enums
Message.ButtonsResponseMessage = Message.ButtonsResponseMessage || {};
Message.ButtonsResponseMessage.Type = { UNKNOWN: 0, DISPLAY_TEXT: 1 };

Message.PeerDataOperationRequestType = { UPLOAD_STICKER: 0, SEND_RECENT_STICKER_BOOTSTRAP: 1, GENERATE_LINK_PREVIEW: 2, HISTORY_SYNC_ON_DEMAND: 3, PLACEHOLDER_MESSAGE_RESEND: 4, WAFFLE_LINKING_NONCE_FETCH: 5, FULL_HISTORY_SYNC_ON_DEMAND: 6, COMPANION_META_NONCE_FETCH: 7, COMPANION_SYNCD_SNAPSHOT_FATAL_RECOVERY: 8, COMPANION_CANONICAL_USER_NONCE_FETCH: 9, HISTORY_SYNC_CHUNK_RETRY: 10, GALAXY_FLOW_ACTION: 11 };

Message.ProtocolMessage = Message.ProtocolMessage || {};
Message.ProtocolMessage.Type = { REVOKE: 0, EPHEMERAL_SETTING: 3, EPHEMERAL_SYNC_RESPONSE: 4, HISTORY_SYNC_NOTIFICATION: 5, APP_STATE_SYNC_KEY_SHARE: 6, APP_STATE_SYNC_KEY_REQUEST: 7, MSG_FANOUT_BACKFILL_REQUEST: 8, INITIAL_SECURITY_NOTIFICATION_SETTING_SYNC: 9, APP_STATE_FATAL_EXCEPTION_NOTIFICATION: 10, SHARE_PHONE_NUMBER: 11, MESSAGE_EDIT: 14, PEER_DATA_OPERATION_REQUEST_MESSAGE: 16, PEER_DATA_OPERATION_REQUEST_RESPONSE_MESSAGE: 17, REQUEST_WELCOME_MESSAGE: 18, BOT_FEEDBACK_MESSAGE: 19, MEDIA_NOTIFY_MESSAGE: 20, CLOUD_API_THREAD_CONTROL_NOTIFICATION: 21, LID_MIGRATION_MAPPING_SYNC: 22, REMINDER_MESSAGE: 23, BOT_MEMU_ONBOARDING_MESSAGE: 24, STATUS_MENTION_MESSAGE: 25, STOP_GENERATION_MESSAGE: 26, LIMIT_SHARING: 27, AI_PSI_METADATA: 28, AI_QUERY_FANOUT: 29, GROUP_MEMBER_LABEL_CHANGE: 30 };

Message.HistorySyncType = { INITIAL_BOOTSTRAP: 0, INITIAL_STATUS_V3: 1, FULL: 2, RECENT: 3, PUSH_NAME: 4, NON_BLOCKING_DATA: 5, ON_DEMAND: 6, NO_HISTORY: 7, MESSAGE_ACCESS_STATUS: 8 };

Message.EventResponseMessage.EventResponseType = { UNKNOWN: 0, GOING: 1, NOT_GOING: 2, MAYBE: 3 };

Message.PinInChatMessage = Message.PinInChatMessage || {};
Message.PinInChatMessage.Type = { UNKNOWN_TYPE: 0, PIN_FOR_ALL: 1, UNPIN_FOR_ALL: 2 };

Message.MediaKeyDomain = { UNSET: 0, E2EE_CHAT: 1, STATUS: 2, CAPI: 3, BOT: 4 };

Message.PollContentType = { UNKNOWN: 0, TEXT: 1, IMAGE: 2 };
Message.PollType = { POLL: 0, QUIZ: 1 };

// SyncdMutation enums
SyncdMutation.SyncdOperation = { SET: 0, REMOVE: 1 };

// WebMessageInfo enums
WebMessageInfo.Status = { ERROR: 0, PENDING: 1, SERVER_ACK: 2, DELIVERY_ACK: 3, READ: 4, PLAYED: 5 };
WebMessageInfo.BizPrivacyStatus = { E2EE: 0, FB: 2, BSP: 1, BSP_AND_FB: 3 };
WebMessageInfo.StubType = { UNKNOWN: 0, REVOKE: 1, CIPHERTEXT: 2, FUTUREPROOF: 3, NON_VERIFIED_TRANSITION: 4, UNVERIFIED_TRANSITION: 5, VERIFIED_TRANSITION: 6, VERIFIED_LOW_UNKNOWN: 7, VERIFIED_HIGH: 8, VERIFIED_INITIAL_UNKNOWN: 9, VERIFIED_INITIAL_LOW: 10, VERIFIED_INITIAL_HIGH: 11, VERIFIED_TRANSITION_ANY_TO_NONE: 12, VERIFIED_TRANSITION_ANY_TO_HIGH: 13, VERIFIED_TRANSITION_HIGH_TO_LOW: 14, VERIFIED_TRANSITION_HIGH_TO_UNKNOWN: 15, VERIFIED_TRANSITION_UNKNOWN_TO_LOW: 16, VERIFIED_TRANSITION_LOW_TO_UNKNOWN: 17, VERIFIED_TRANSITION_NONE_TO_LOW: 18, VERIFIED_TRANSITION_NONE_TO_UNKNOWN: 19, GROUP_CREATE: 20, GROUP_CHANGE_SUBJECT: 21, GROUP_CHANGE_ICON: 22, GROUP_CHANGE_INVITE_LINK: 23, GROUP_CHANGE_DESCRIPTION: 24, GROUP_CHANGE_RESTRICT: 25, GROUP_CHANGE_ANNOUNCE: 26, GROUP_PARTICIPANT_ADD: 27, GROUP_PARTICIPANT_REMOVE: 28, GROUP_PARTICIPANT_PROMOTE: 29, GROUP_PARTICIPANT_DEMOTE: 30, GROUP_PARTICIPANT_INVITE: 31, GROUP_PARTICIPANT_LEAVE: 32, GROUP_PARTICIPANT_CHANGE_NUMBER: 33, BROADCAST_CREATE: 34, BROADCAST_ADD: 35, BROADCAST_REMOVE: 36, GENERIC_NOTIFICATION: 37, E2E_IDENTITY_CHANGED: 38, E2E_ENCRYPTED: 39, CALL_MISSED_VOICE: 40, CALL_MISSED_VIDEO: 41, INDIVIDUAL_CHANGE_NUMBER: 42, GROUP_DELETE: 43, GROUP_ANNOUNCE_MODE_MESSAGE_BOUNCE: 44, CALL_MISSED_GROUP_VOICE: 45, CALL_MISSED_GROUP_VIDEO: 46, PAYMENT_CIPHERTEXT: 47, PAYMENT_FUTUREPROOF: 48, PAYMENT_TRANSACTION_STATUS_UPDATE_FAILED: 49, PAYMENT_TRANSACTION_STATUS_UPDATE_REFUNDED: 50, PAYMENT_TRANSACTION_STATUS_UPDATE_REFUND_FAILED: 51, PAYMENT_TRANSACTION_STATUS_RECEIVER_PENDING_SETUP: 52, PAYMENT_TRANSACTION_STATUS_RECEIVER_SUCCESS_AFTER_HICCUP: 53, PAYMENT_ACTION_ACCOUNT_SETUP_REMINDER: 54, PAYMENT_ACTION_SEND_PAYMENT_REMINDER: 55, PAYMENT_ACTION_SEND_PAYMENT_INVITATION: 56, PAYMENT_ACTION_REQUEST_DECLINED: 57, PAYMENT_ACTION_REQUEST_EXPIRED: 58, PAYMENT_ACTION_REQUEST_CANCELLED: 59, BIZ_VERIFIED_TRANSITION_TOP_TO_BOTTOM: 60, BIZ_VERIFIED_TRANSITION_BOTTOM_TO_TOP: 61, BIZ_INTRO_TOP: 62, BIZ_INTRO_BOTTOM: 63, BIZ_NAME_CHANGE: 64, BIZ_MOVE_TO_CONSUMER_APP: 65, BIZ_TWO_TIER_MIGRATION_TOP: 66, BIZ_TWO_TIER_MIGRATION_BOTTOM: 67, OVERSIZED: 68, GROUP_CHANGE_NO_FREQUENTLY_FORWARDED: 69, GROUP_V4_ADD_INVITE_SENT: 70, GROUP_PARTICIPANT_ADD_REQUEST_JOIN: 71, CHANGE_EPHEMERAL_SETTING: 72, E2E_DEVICE_CHANGED: 73, VIEWED_ONCE: 74, E2E_ENCRYPTED_NOW: 75, BLUE_MSG_BSP_FB_TO_BSP_PREMISE: 76, BLUE_MSG_BSP_FB_TO_SELF_FB: 77, BLUE_MSG_BSP_FB_TO_SELF_PREMISE: 78, BLUE_MSG_BSP_FB_UNVERIFIED: 79, BLUE_MSG_BSP_FB_UNVERIFIED_TO_SELF_PREMISE_VERIFIED: 80, BLUE_MSG_BSP_FB_VERIFIED: 81, BLUE_MSG_BSP_FB_VERIFIED_TO_SELF_PREMISE_UNVERIFIED: 82, BLUE_MSG_BSP_PREMISE_TO_SELF_PREMISE: 83, BLUE_MSG_BSP_PREMISE_UNVERIFIED: 84, BLUE_MSG_BSP_PREMISE_UNVERIFIED_TO_SELF_PREMISE_VERIFIED: 85, BLUE_MSG_BSP_PREMISE_VERIFIED: 86, BLUE_MSG_BSP_PREMISE_VERIFIED_TO_SELF_PREMISE_UNVERIFIED: 87, BLUE_MSG_CONSUMER_TO_BSP_FB_UNVERIFIED: 88, BLUE_MSG_CONSUMER_TO_BSP_PREMISE_UNVERIFIED: 89, BLUE_MSG_CONSUMER_TO_SELF_FB_UNVERIFIED: 90, BLUE_MSG_CONSUMER_TO_SELF_PREMISE_UNVERIFIED: 91, BLUE_MSG_SELF_FB_TO_BSP_PREMISE: 92, BLUE_MSG_SELF_FB_TO_SELF_PREMISE: 93, BLUE_MSG_SELF_FB_UNVERIFIED: 94, BLUE_MSG_SELF_FB_UNVERIFIED_TO_SELF_PREMISE_VERIFIED: 95, BLUE_MSG_SELF_FB_VERIFIED: 96, BLUE_MSG_SELF_FB_VERIFIED_TO_SELF_PREMISE_UNVERIFIED: 97, BLUE_MSG_SELF_PREMISE_TO_BSP_PREMISE: 98, BLUE_MSG_SELF_PREMISE_UNVERIFIED: 99, BLUE_MSG_SELF_PREMISE_VERIFIED: 100, BLUE_MSG_TO_BSP_FB: 101, BLUE_MSG_TO_CONSUMER: 102, BLUE_MSG_TO_SELF_FB: 103, BLUE_MSG_UNVERIFIED_TO_BSP_FB_VERIFIED: 104, BLUE_MSG_UNVERIFIED_TO_BSP_PREMISE_VERIFIED: 105, BLUE_MSG_UNVERIFIED_TO_SELF_FB_VERIFIED: 106, BLUE_MSG_UNVERIFIED_TO_VERIFIED: 107, BLUE_MSG_VERIFIED_TO_BSP_FB_UNVERIFIED: 108, BLUE_MSG_VERIFIED_TO_BSP_PREMISE_UNVERIFIED: 109, BLUE_MSG_VERIFIED_TO_SELF_FB_UNVERIFIED: 110, BLUE_MSG_VERIFIED_TO_UNVERIFIED: 111, BLUE_MSG_BSP_FB_UNVERIFIED_TO_BSP_PREMISE_VERIFIED: 112, BLUE_MSG_BSP_FB_UNVERIFIED_TO_SELF_FB_VERIFIED: 113, BLUE_MSG_BSP_FB_VERIFIED_TO_BSP_PREMISE_UNVERIFIED: 114, BLUE_MSG_BSP_FB_VERIFIED_TO_SELF_FB_UNVERIFIED: 115, BLUE_MSG_SELF_FB_UNVERIFIED_TO_BSP_PREMISE_VERIFIED: 116, BLUE_MSG_SELF_FB_VERIFIED_TO_BSP_PREMISE_UNVERIFIED: 117, E2E_IDENTITY_UNAVAILABLE: 118, GROUP_CREATING: 119, GROUP_CREATE_FAILED: 120, GROUP_BOUNCED: 121, BLOCK_CONTACT: 122, EPHEMERAL_SETTING_NOT_APPLIED: 123, SYNC_FAILED: 124, SYNCING: 125, BIZ_PRIVACY_MODE_INIT_FB: 126, BIZ_PRIVACY_MODE_INIT_BSP: 127, BIZ_PRIVACY_MODE_TO_FB: 128, BIZ_PRIVACY_MODE_TO_BSP: 129, DISAPPEARING_MODE: 130, E2E_DEVICE_FETCH_FAILED: 131, ADMIN_REVOKE: 132, GROUP_INVITE_LINK_GROWTH_LOCKED: 133, COMMUNITY_LINK_PARENT_GROUP: 134, COMMUNITY_LINK_SIBLING_GROUP: 135, COMMUNITY_LINK_SUB_GROUP: 136, COMMUNITY_UNLINK_PARENT_GROUP: 137, COMMUNITY_UNLINK_SIBLING_GROUP: 138, COMMUNITY_UNLINK_SUB_GROUP: 139, GROUP_PARTICIPANT_ACCEPT: 140, GROUP_PARTICIPANT_LINKED_GROUP_JOIN: 141, COMMUNITY_CREATE: 142, EPHEMERAL_KEEP_IN_CHAT: 143, GROUP_MEMBERSHIP_JOIN_APPROVAL_REQUEST: 144, GROUP_MEMBERSHIP_JOIN_APPROVAL_MODE: 145, INTEGRITY_UNLINK_PARENT_GROUP: 146, COMMUNITY_PARTICIPANT_PROMOTE: 147, COMMUNITY_PARTICIPANT_DEMOTE: 148, COMMUNITY_PARENT_GROUP_DELETED: 149, COMMUNITY_LINK_PARENT_GROUP_MEMBERSHIP_APPROVAL: 150, GROUP_PARTICIPANT_JOINED_GROUP_AND_PARENT_GROUP: 151, MASKED_THREAD_CREATED: 152, MASKED_THREAD_UNMASKED: 153, BIZ_CHAT_ASSIGNMENT: 154, CHAT_PSA: 155, CHAT_POLL_CREATION_MESSAGE: 156, CAG_MASKED_THREAD_CREATED: 157, COMMUNITY_PARENT_GROUP_SUBJECT_CHANGED: 158, CAG_INVITE_AUTO_ADD: 159, BIZ_CHAT_ASSIGNMENT_UNASSIGN: 160, CAG_INVITE_AUTO_JOINED: 161, SCHEDULED_CALL_START_MESSAGE: 162, COMMUNITY_INVITE_RICH: 163, COMMUNITY_INVITE_AUTO_ADD_RICH: 164, SUB_GROUP_INVITE_RICH: 165, SUB_GROUP_PARTICIPANT_ADD_RICH: 166, COMMUNITY_LINK_PARENT_GROUP_RICH: 167, COMMUNITY_PARTICIPANT_ADD_RICH: 168, SILENCED_UNKNOWN_CALLER_AUDIO: 169, SILENCED_UNKNOWN_CALLER_VIDEO: 170, GROUP_MEMBER_ADD_MODE: 171, GROUP_MEMBERSHIP_JOIN_APPROVAL_REQUEST_NON_ADMIN_ADD: 172, COMMUNITY_CHANGE_DESCRIPTION: 173, SENDER_INVITE: 174, RECEIVER_INVITE: 175, COMMUNITY_ALLOW_MEMBER_ADDED_GROUPS: 176, PINNED_MESSAGE_IN_CHAT: 177, PAYMENT_INVITE_SETUP_INVITER: 178, PAYMENT_INVITE_SETUP_INVITEE_RECEIVE_ONLY: 179, PAYMENT_INVITE_SETUP_INVITEE_SEND_AND_RECEIVE: 180, LINKED_GROUP_CALL_START: 181, REPORT_TO_ADMIN_ENABLED_STATUS: 182, EMPTY_SUBGROUP_CREATE: 183, SCHEDULED_CALL_CANCEL: 184, SUBGROUP_ADMIN_TRIGGERED_AUTO_ADD_RICH: 185, GROUP_CHANGE_RECENT_HISTORY_SHARING: 186, PAID_MESSAGE_SERVER_CAMPAIGN_ID: 187, GENERAL_CHAT_CREATE: 188, GENERAL_CHAT_ADD: 189, GENERAL_CHAT_AUTO_ADD_DISABLED: 190, SUGGESTED_SUBGROUP_ANNOUNCE: 191, BIZ_BOT_1P_MESSAGING_ENABLED: 192, CHANGE_USERNAME: 193, BIZ_COEX_PRIVACY_INIT_SELF: 194, BIZ_COEX_PRIVACY_TRANSITION_SELF: 195, SUPPORT_AI_EDUCATION: 196, BIZ_BOT_3P_MESSAGING_ENABLED: 197, REMINDER_SETUP_MESSAGE: 198, REMINDER_SENT_MESSAGE: 199, REMINDER_CANCEL_MESSAGE: 200, BIZ_COEX_PRIVACY_INIT: 201, BIZ_COEX_PRIVACY_TRANSITION: 202, GROUP_DEACTIVATED: 203, COMMUNITY_DEACTIVATE_SIBLING_GROUP: 204, EVENT_UPDATED: 205, EVENT_CANCELED: 206, COMMUNITY_OWNER_UPDATED: 207, COMMUNITY_SUB_GROUP_VISIBILITY_HIDDEN: 208, CAPI_GROUP_NE2EE_SYSTEM_MESSAGE: 209, STATUS_MENTION: 210, USER_CONTROLS_SYSTEM_MESSAGE: 211, SUPPORT_SYSTEM_MESSAGE: 212, CHANGE_LID: 213, BIZ_CUSTOMER_3PD_DATA_SHARING_OPT_IN_MESSAGE: 214, BIZ_CUSTOMER_3PD_DATA_SHARING_OPT_OUT_MESSAGE: 215, CHANGE_LIMIT_SHARING: 216, GROUP_MEMBER_LINK_MODE: 217, BIZ_AUTOMATICALLY_LABELED_CHAT_SYSTEM_MESSAGE: 218, PHONE_NUMBER_HIDING_CHAT_DEPRECATED_MESSAGE: 219, QUARANTINED_MESSAGE: 220, GROUP_MEMBER_SHARE_GROUP_HISTORY_MODE: 221 };

// PinInChat (top-level, referenced as proto.PinInChat.Type)
const PinInChat = {};
PinInChat.Type = { UNKNOWN_TYPE: 0, PIN_FOR_ALL: 1, UNPIN_FOR_ALL: 2 };

// SyncActionValue nested enums
SyncActionValue.NotificationActivitySettingAction = {};
SyncActionValue.NotificationActivitySettingAction.NotificationActivitySetting = { DEFAULT_ALL_MESSAGES: 0, ALL_MESSAGES: 1, HIGHLIGHTS: 2, DEFAULT_HIGHLIGHTS: 3 };

// DisappearingMode enums (sometimes referenced)
const DisappearingMode = {};
DisappearingMode.Initiator = { CHANGED_IN_CHAT: 0, INITIATED_BY_ME: 1, INITIATED_BY_OTHER: 2, BIZ_UPGRADE_FB_HOSTING: 3 };
DisappearingMode.Trigger = { UNKNOWN: 0, CHAT_SETTING: 1, ACCOUNT_SETTING: 2, BULK_CHANGE: 3, BIZ_SUPPORTS_FB_HOSTING: 4, UNKNOWN_GROUPS: 5 };

// GroupParticipant enums
const GroupParticipant = {};
GroupParticipant.Rank = { REGULAR: 0, ADMIN: 1, SUPERADMIN: 2 };

// Conversation enums
const Conversation = {};
Conversation.EndOfHistoryTransferType = { COMPLETE_BUT_MORE_MESSAGES_REMAIN_ON_PRIMARY: 0, COMPLETE_AND_NO_MORE_MESSAGE_REMAIN_ON_PRIMARY: 1, COMPLETE_ON_DEMAND_SYNC_BUT_MORE_MSG_REMAIN_ON_PRIMARY: 2 };

// KeepType enum
const KeepType = { UNKNOWN: 0, KEEP_FOR_ALL: 1, UNDO_KEEP_FOR_ALL: 2 };

// MediaVisibility enum
const MediaVisibility = { DEFAULT: 0, OFF: 1, ON: 2 };

// HandshakeMessage nested types
HandshakeMessage.ClientHello = createProtoClass('HandshakeMessage');
HandshakeMessage.ServerHello = createProtoClass('HandshakeMessage');
HandshakeMessage.ClientFinish = createProtoClass('HandshakeMessage');

// DeviceProps nested types
DeviceProps.AppVersion = createProtoClass('DeviceProps');
DeviceProps.HistorySyncConfig = createProtoClass('DeviceProps');

// Message additional nested type stubs (for interface references)
Message.ProductMessage = Message.ProductMessage || {};
Message.TemplateMessage = Message.TemplateMessage || {};

// ContextInfo enums (sometimes referenced)
const ContextInfo = {};
ContextInfo.AdReplyInfo = {};
ContextInfo.AdReplyInfo.MediaType = { NONE: 0, IMAGE: 1, VIDEO: 2 };
ContextInfo.ExternalAdReplyInfo = {};
ContextInfo.ExternalAdReplyInfo.MediaType = { NONE: 0, IMAGE: 1, VIDEO: 2 };
ContextInfo.ExternalAdReplyInfo.AdType = { CTWA: 0, CAWC: 1 };
ContextInfo.ForwardedNewsletterMessageInfo = {};
ContextInfo.ForwardedNewsletterMessageInfo.ContentType = { UPDATE: 1, UPDATE_CARD: 2, LINK_CARD: 3 };
ContextInfo.ForwardOrigin = { UNKNOWN: 0, CHAT: 1, STATUS: 2, CHANNELS: 3, META_AI: 4, UGC: 5 };
ContextInfo.QuotedType = { EXPLICIT: 0, AUTO: 1 };
ContextInfo.StatusAttributionType = { NONE: 0, RESHARED_FROM_MENTION: 1, RESHARED_FROM_POST: 2, RESHARED_FROM_POST_MANY_TIMES: 3, FORWARDED_FROM_STATUS: 4 };
ContextInfo.StatusSourceType = { IMAGE: 0, VIDEO: 1, GIF: 2, AUDIO: 3, TEXT: 4, MUSIC_STANDALONE: 5 };
ContextInfo.PairedMediaType = { NOT_PAIRED_MEDIA: 0, SD_VIDEO_PARENT: 1, HD_VIDEO_CHILD: 2, SD_IMAGE_PARENT: 3, HD_IMAGE_CHILD: 4, MOTION_PHOTO_PARENT: 5, MOTION_PHOTO_CHILD: 6, HEVC_VIDEO_PARENT: 7, HEVC_VIDEO_CHILD: 8 };

// BizIdentityInfo enums
const BizIdentityInfo = {};
BizIdentityInfo.ActualActorsType = { SELF: 0, BSP: 1 };
BizIdentityInfo.HostStorageType = { ON_PREMISE: 0, FACEBOOK: 1 };
BizIdentityInfo.VerifiedLevelValue = { UNKNOWN: 0, LOW: 1, HIGH: 2 };

// BizAccountLinkInfo enums
const BizAccountLinkInfo = {};
BizAccountLinkInfo.AccountType = { ENTERPRISE: 0 };
BizAccountLinkInfo.HostStorageType = { ON_PREMISE: 0, FACEBOOK: 1 };

// Message.ButtonsMessage enums
Message.ButtonsMessage = Message.ButtonsMessage || {};
Message.ButtonsMessage.HeaderType = { UNKNOWN: 0, EMPTY: 1, TEXT: 2, DOCUMENT: 3, IMAGE: 4, VIDEO: 5, LOCATION: 6 };
Message.ButtonsMessage.Button = Message.ButtonsMessage.Button || {};
Message.ButtonsMessage.Button.Type = { UNKNOWN: 0, RESPONSE: 1, NATIVE_FLOW: 2 };

// Message.ListMessage / ListResponseMessage enums
Message.ListMessage = Message.ListMessage || {};
Message.ListMessage.ListType = { UNKNOWN: 0, SINGLE_SELECT: 1, PRODUCT_LIST: 2 };
Message.ListResponseMessage = Message.ListResponseMessage || {};
Message.ListResponseMessage.ListType = { UNKNOWN: 0, SINGLE_SELECT: 1 };

// Message.ExtendedTextMessage enums
Message.ExtendedTextMessage = Message.ExtendedTextMessage || {};
Message.ExtendedTextMessage.FontType = { SYSTEM: 0, SYSTEM_TEXT: 1, FB_SCRIPT: 2, SYSTEM_BOLD: 6, MORNINGBREEZE_REGULAR: 7, CALISTOGA_REGULAR: 8, EXO2_EXTRABOLD: 9, COURIERPRIME_BOLD: 10 };
Message.ExtendedTextMessage.InviteLinkGroupType = { DEFAULT: 0, PARENT: 1, SUB: 2, DEFAULT_SUB: 3 };
Message.ExtendedTextMessage.PreviewType = { NONE: 0, VIDEO: 1, PLACEHOLDER: 4, IMAGE: 5, PAYMENT_LINKS: 6, PROFILE: 7 };

// Message.GroupInviteMessage enums
Message.GroupInviteMessage.GroupType = { DEFAULT: 0, PARENT: 1 };

// Message.VideoMessage enums
Message.VideoMessage = Message.VideoMessage || {};
Message.VideoMessage.Attribution = { NONE: 0, GIPHY: 1, TENOR: 2, KLIPY: 3 };
Message.VideoMessage.VideoSourceType = { USER_VIDEO: 0, AI_GENERATED: 1 };

// Message.ImageMessage enums
Message.ImageMessage = Message.ImageMessage || {};
Message.ImageMessage.ImageSourceType = { USER_IMAGE: 0, AI_GENERATED: 1, AI_MODIFIED: 2, RASTERIZED_TEXT_STATUS: 3 };

// Message.InvoiceMessage enums
Message.InvoiceMessage = Message.InvoiceMessage || {};
Message.InvoiceMessage.AttachmentType = { IMAGE: 0, PDF: 1 };

// Message.OrderMessage enums
Message.OrderMessage = Message.OrderMessage || {};
Message.OrderMessage.OrderStatus = { INQUIRY: 1, ACCEPTED: 2, DECLINED: 3 };
Message.OrderMessage.OrderSurface = { CATALOG: 1 };

// Message.PaymentInviteMessage enums
Message.PaymentInviteMessage = Message.PaymentInviteMessage || {};
Message.PaymentInviteMessage.ServiceType = { UNKNOWN: 0, FBPAY: 1, NOVI: 2, UPI: 3 };

// Message.InteractiveMessage enums
Message.InteractiveMessage = Message.InteractiveMessage || {};
Message.InteractiveMessage.ShopMessage = Message.InteractiveMessage.ShopMessage || {};
Message.InteractiveMessage.ShopMessage.Surface = { UNKNOWN_SURFACE: 0, FB: 1, IG: 2, WA: 3 };
Message.InteractiveResponseMessage = Message.InteractiveResponseMessage || {};
Message.InteractiveResponseMessage.Body = Message.InteractiveResponseMessage.Body || {};
Message.InteractiveResponseMessage.Body.Format = { DEFAULT: 0, EXTENSIONS_1: 1 };

// Message.CallLogMessage enums
Message.CallLogMessage = Message.CallLogMessage || {};
Message.CallLogMessage.CallOutcome = { CONNECTED: 0, MISSED: 1, FAILED: 2, REJECTED: 3, ACCEPTED_ELSEWHERE: 4, ONGOING: 5, SILENCED_BY_DND: 6, SILENCED_UNKNOWN_CALLER: 7 };
Message.CallLogMessage.CallType = { REGULAR: 0, SCHEDULED_CALL: 1, VOICE_CHAT: 2 };

// Message.ScheduledCallCreationMessage enums
Message.ScheduledCallCreationMessage = Message.ScheduledCallCreationMessage || {};
Message.ScheduledCallCreationMessage.CallType = { UNKNOWN: 0, VOICE: 1, VIDEO: 2 };

// Message.ScheduledCallEditMessage enums
Message.ScheduledCallEditMessage = Message.ScheduledCallEditMessage || {};
Message.ScheduledCallEditMessage.EditType = { UNKNOWN: 0, CANCEL: 1 };

// Message.SecretEncryptedMessage enums
Message.SecretEncryptedMessage = Message.SecretEncryptedMessage || {};
Message.SecretEncryptedMessage.SecretEncType = { UNKNOWN: 0, EVENT_EDIT: 1, MESSAGE_EDIT: 2 };

// Message.StickerPackMessage enums
Message.StickerPackMessage = Message.StickerPackMessage || {};
Message.StickerPackMessage.StickerPackOrigin = { FIRST_PARTY: 0, THIRD_PARTY: 1, USER_CREATED: 2 };

// Message.BCallMessage enums
Message.BCallMessage = Message.BCallMessage || {};
Message.BCallMessage.MediaType = { UNKNOWN: 0, AUDIO: 1, VIDEO: 2 };

// Message.PlaceholderMessage enums
Message.PlaceholderMessage = Message.PlaceholderMessage || {};
Message.PlaceholderMessage.PlaceholderType = { MASK_LINKED_DEVICES: 0 };

// Message.StatusNotificationMessage enums
Message.StatusNotificationMessage = Message.StatusNotificationMessage || {};
Message.StatusNotificationMessage.StatusNotificationType = { UNKNOWN: 0, STATUS_ADD_YOURS: 1, STATUS_RESHARE: 2, STATUS_QUESTION_ANSWER_RESHARE: 3 };

// Message.StatusStickerInteractionMessage enums
Message.StatusStickerInteractionMessage = Message.StatusStickerInteractionMessage || {};
Message.StatusStickerInteractionMessage.StatusStickerType = { UNKNOWN: 0, REACTION: 1 };

// Message.StatusQuotedMessage enums
Message.StatusQuotedMessage = Message.StatusQuotedMessage || {};
Message.StatusQuotedMessage.StatusQuotedMessageType = { QUESTION_ANSWER: 1 };

// Message.HighlyStructuredMessage enums
Message.HighlyStructuredMessage = Message.HighlyStructuredMessage || {};
Message.HighlyStructuredMessage.HSMLocalizableParameter = Message.HighlyStructuredMessage.HSMLocalizableParameter || {};
Message.HighlyStructuredMessage.HSMLocalizableParameter.HSMDateTime = Message.HighlyStructuredMessage.HSMLocalizableParameter.HSMDateTime || {};
Message.HighlyStructuredMessage.HSMLocalizableParameter.HSMDateTime.HSMDateTimeComponent = Message.HighlyStructuredMessage.HSMLocalizableParameter.HSMDateTime.HSMDateTimeComponent || {};
Message.HighlyStructuredMessage.HSMLocalizableParameter.HSMDateTime.HSMDateTimeComponent.CalendarType = { GREGORIAN: 1, SOLAR_HIJRI: 2 };
Message.HighlyStructuredMessage.HSMLocalizableParameter.HSMDateTime.HSMDateTimeComponent.DayOfWeekType = { MONDAY: 1, TUESDAY: 2, WEDNESDAY: 3, THURSDAY: 4, FRIDAY: 5, SATURDAY: 6, SUNDAY: 7 };

// Message.InteractiveMessage.CarouselMessage enums
Message.InteractiveMessage.CarouselMessage = Message.InteractiveMessage.CarouselMessage || {};
Message.InteractiveMessage.CarouselMessage.CarouselCardType = { UNKNOWN: 0, HSCROLL_CARDS: 1, ALBUM_IMAGE: 2 };

// Message.LinkPreviewMetadata enums
Message.LinkPreviewMetadata = Message.LinkPreviewMetadata || {};
Message.LinkPreviewMetadata.SocialMediaPostType = { NONE: 0, REEL: 1, LIVE_VIDEO: 2, LONG_VIDEO: 3, SINGLE_IMAGE: 4, CAROUSEL: 5 };

// Message.CloudAPIThreadControlNotification enums
Message.CloudAPIThreadControlNotification = Message.CloudAPIThreadControlNotification || {};
Message.CloudAPIThreadControlNotification.CloudAPIThreadControl = { UNKNOWN: 0, CONTROL_PASSED: 1, CONTROL_TAKEN: 2 };

// Message.RequestWelcomeMessageMetadata enums
Message.RequestWelcomeMessageMetadata = Message.RequestWelcomeMessageMetadata || {};
Message.RequestWelcomeMessageMetadata.LocalChatState = { EMPTY: 0, NON_EMPTY: 1 };

// Message.PaymentLinkMetadata enums
Message.PaymentLinkMetadata = Message.PaymentLinkMetadata || {};
Message.PaymentLinkMetadata.PaymentLinkHeader = Message.PaymentLinkMetadata.PaymentLinkHeader || {};
Message.PaymentLinkMetadata.PaymentLinkHeader.PaymentLinkHeaderType = { LINK_PREVIEW: 0, ORDER: 1 };

// Message.PeerDataOperationRequestMessage enums
Message.PeerDataOperationRequestMessage = Message.PeerDataOperationRequestMessage || {};
Message.PeerDataOperationRequestMessage.GalaxyFlowAction = Message.PeerDataOperationRequestMessage.GalaxyFlowAction || {};
Message.PeerDataOperationRequestMessage.GalaxyFlowAction.GalaxyFlowActionType = { NOTIFY_LAUNCH: 1 };

// Message.PeerDataOperationRequestResponseMessage enums
Message.PeerDataOperationRequestResponseMessage = Message.PeerDataOperationRequestResponseMessage || {};
Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult = Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult || {};
Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.FullHistorySyncOnDemandResponseCode = { REQUEST_SUCCESS: 0, REQUEST_TIME_EXPIRED: 1, DECLINED_SHARING_HISTORY: 2, GENERIC_ERROR: 3, ERROR_REQUEST_ON_NON_SMB_PRIMARY: 4, ERROR_HOSTED_DEVICE_NOT_CONNECTED: 5, ERROR_HOSTED_DEVICE_LOGIN_TIME_NOT_SET: 6 };
Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.HistorySyncChunkRetryResponseCode = { GENERATION_ERROR: 1, CHUNK_CONSUMED: 2, TIMEOUT: 3, SESSION_EXHAUSTED: 4, CHUNK_EXHAUSTED: 5, DUPLICATED_REQUEST: 6 };

// CallLogRecord enums
const CallLogRecord = {};
CallLogRecord.CallResult = { CONNECTED: 0, REJECTED: 1, CANCELLED: 2, ACCEPTEDELSEWHERE: 3, MISSED: 4, INVALID: 5, UNAVAILABLE: 6, UPCOMING: 7, FAILED: 8, ABANDONED: 9, ONGOING: 10 };
CallLogRecord.CallType = { REGULAR: 0, SCHEDULED_CALL: 1, VOICE_CHAT: 2 };
CallLogRecord.SilenceReason = { NONE: 0, SCHEDULED: 1, PRIVACY: 2, LIGHTWEIGHT: 3 };

// PaymentInfo enums
const PaymentInfo = {};
PaymentInfo.Currency = { UNKNOWN_CURRENCY: 0, INR: 1 };
PaymentInfo.Status = { UNKNOWN_STATUS: 0, PROCESSING: 1, SENT: 2, NEED_TO_ACCEPT: 3, COMPLETE: 4, COULD_NOT_COMPLETE: 5, REFUNDED: 6, EXPIRED: 7, REJECTED: 8, CANCELLED: 9, WAITING_FOR_PAYER: 10, WAITING: 11 };
PaymentInfo.TxnStatus = { UNKNOWN: 0, PENDING_SETUP: 1, PENDING_RECEIVER_SETUP: 2, INIT: 3, SUCCESS: 4, COMPLETED: 5, FAILED: 6, FAILED_RISK: 7, FAILED_PROCESSING: 8, FAILED_RECEIVER_PROCESSING: 9, FAILED_DA: 10, FAILED_DA_FINAL: 11, REFUNDED_TXN: 12, REFUND_FAILED: 13, REFUND_FAILED_PROCESSING: 14, REFUND_FAILED_DA: 15, EXPIRED_TXN: 16, AUTH_CANCELED: 17, AUTH_CANCEL_FAILED_PROCESSING: 18, AUTH_CANCEL_FAILED: 19, COLLECT_INIT: 20, COLLECT_SUCCESS: 21, COLLECT_FAILED: 22, COLLECT_FAILED_RISK: 23, COLLECT_REJECTED: 24, COLLECT_EXPIRED: 25, COLLECT_CANCELED: 26, COLLECT_CANCELLING: 27, IN_REVIEW: 28, REVERSAL_SUCCESS: 29, REVERSAL_PENDING: 30, REFUND_PENDING: 31 };

// WebFeatures enums
const WebFeatures = {};
WebFeatures.Flag = { NOT_STARTED: 0, FORCE_UPGRADE: 1, DEVELOPMENT: 2, PRODUCTION: 3 };

// MutationProps enum
const MutationProps = { STAR_ACTION: 2, CONTACT_ACTION: 3, MUTE_ACTION: 4, PIN_ACTION: 5, SECURITY_NOTIFICATION_SETTING: 6, PUSH_NAME_SETTING: 7, QUICK_REPLY_ACTION: 8, RECENT_EMOJI_WEIGHTS_ACTION: 11, LABEL_MESSAGE_ACTION: 13, LABEL_EDIT_ACTION: 14, LABEL_ASSOCIATION_ACTION: 15, LOCALE_SETTING: 16, ARCHIVE_CHAT_ACTION: 17, DELETE_MESSAGE_FOR_ME_ACTION: 18, KEY_EXPIRATION: 19, MARK_CHAT_AS_READ_ACTION: 20, CLEAR_CHAT_ACTION: 21, DELETE_CHAT_ACTION: 22, UNARCHIVE_CHATS_SETTING: 23, PRIMARY_FEATURE: 24, ANDROID_UNSUPPORTED_ACTIONS: 26, AGENT_ACTION: 27, SUBSCRIPTION_ACTION: 28, USER_STATUS_MUTE_ACTION: 29, TIME_FORMAT_ACTION: 30, NUX_ACTION: 31, PRIMARY_VERSION_ACTION: 32, STICKER_ACTION: 33, REMOVE_RECENT_STICKER_ACTION: 34, CHAT_ASSIGNMENT: 35, CHAT_ASSIGNMENT_OPENED_STATUS: 36, PN_FOR_LID_CHAT_ACTION: 37, MARKETING_MESSAGE_ACTION: 38, MARKETING_MESSAGE_BROADCAST_ACTION: 39, EXTERNAL_WEB_BETA_ACTION: 40, PRIVACY_SETTING_RELAY_ALL_CALLS: 41, CALL_LOG_ACTION: 42, UGC_BOT: 43, STATUS_PRIVACY: 44, BOT_WELCOME_REQUEST_ACTION: 45, DELETE_INDIVIDUAL_CALL_LOG: 46, LABEL_REORDERING_ACTION: 47, PAYMENT_INFO_ACTION: 48, CUSTOM_PAYMENT_METHODS_ACTION: 49, LOCK_CHAT_ACTION: 50, CHAT_LOCK_SETTINGS: 51, WAMO_USER_IDENTIFIER_ACTION: 52, PRIVACY_SETTING_DISABLE_LINK_PREVIEWS_ACTION: 53, DEVICE_CAPABILITIES: 54, NOTE_EDIT_ACTION: 55, FAVORITES_ACTION: 56, MERCHANT_PAYMENT_PARTNER_ACTION: 57, WAFFLE_ACCOUNT_LINK_STATE_ACTION: 58, USERNAME_CHAT_START_MODE: 59, NOTIFICATION_ACTIVITY_SETTING_ACTION: 60, LID_CONTACT_ACTION: 61, CTWA_PER_CUSTOMER_DATA_SHARING_ACTION: 62, PAYMENT_TOS_ACTION: 63, PRIVACY_SETTING_CHANNELS_PERSONALISED_RECOMMENDATION_ACTION: 64, BUSINESS_BROADCAST_ASSOCIATION_ACTION: 65, DETECTED_OUTCOMES_STATUS_ACTION: 66, MAIBA_AI_FEATURES_CONTROL_ACTION: 68, BUSINESS_BROADCAST_LIST_ACTION: 69, MUSIC_USER_ID_ACTION: 70, STATUS_POST_OPT_IN_NOTIFICATION_PREFERENCES_ACTION: 71, AVATAR_UPDATED_ACTION: 72, GALAXY_FLOW_ACTION: 73, PRIVATE_PROCESSING_SETTING_ACTION: 74, NEWSLETTER_SAVED_INTERESTS_ACTION: 75, AI_THREAD_RENAME_ACTION: 76, INTERACTIVE_MESSAGE_ACTION: 77, SHARE_OWN_PN: 10001, BUSINESS_BROADCAST_ACTION: 10002 };

// MessageAddOn enums
const MessageAddOn = {};
MessageAddOn.MessageAddOnType = { UNDEFINED: 0, REACTION: 1, EVENT_RESPONSE: 2, POLL_UPDATE: 3, PIN_IN_CHAT: 4 };

// MessageAssociation enums
const MessageAssociation = {};
MessageAssociation.AssociationType = { UNKNOWN: 0, MEDIA_ALBUM: 1, BOT_PLUGIN: 2, EVENT_COVER_IMAGE: 3, STATUS_POLL: 4, HD_VIDEO_DUAL_UPLOAD: 5, STATUS_EXTERNAL_RESHARE: 6, MEDIA_POLL: 7, STATUS_ADD_YOURS: 8, STATUS_NOTIFICATION: 9, HD_IMAGE_DUAL_UPLOAD: 10, STICKER_ANNOTATION: 11, MOTION_PHOTO: 12, STATUS_LINK_ACTION: 13, VIEW_ALL_REPLIES: 14, STATUS_ADD_YOURS_AI_IMAGINE: 15, STATUS_QUESTION: 16, STATUS_ADD_YOURS_DIWALI: 17, STATUS_REACTION: 18, HEVC_VIDEO_DUAL_UPLOAD: 19 };

// SyncActionValue enums
SyncActionValue.StatusPrivacyAction = {};
SyncActionValue.StatusPrivacyAction.StatusDistributionMode = { ALLOW_LIST: 0, DENY_LIST: 1, CONTACTS: 2, CLOSE_FRIENDS: 3 };
SyncActionValue.LabelEditAction = {};
SyncActionValue.LabelEditAction.ListType = { NONE: 0, UNREAD: 1, GROUPS: 2, FAVORITES: 3, PREDEFINED: 4, CUSTOM: 5, COMMUNITY: 6, SERVER_ASSIGNED: 7, DRAFTED: 8, AI_HANDOFF: 9 };
SyncActionValue.MarketingMessageAction = {};
SyncActionValue.MarketingMessageAction.MarketingMessagePrototypeType = { PERSONALIZED: 0 };
SyncActionValue.MerchantPaymentPartnerAction = {};
SyncActionValue.MerchantPaymentPartnerAction.Status = { ACTIVE: 0, INACTIVE: 1 };
SyncActionValue.NoteEditAction = {};
SyncActionValue.NoteEditAction.NoteType = { UNSTRUCTURED: 1, STRUCTURED: 2 };
SyncActionValue.UsernameChatStartModeAction = {};
SyncActionValue.UsernameChatStartModeAction.ChatStartMode = { LID: 1, PN: 2 };
SyncActionValue.WaffleAccountLinkStateAction = {};
SyncActionValue.WaffleAccountLinkStateAction.AccountLinkState = { ACTIVE: 0, PAUSED: 1, UNLINKED: 2 };
SyncActionValue.InteractiveMessageAction = {};
SyncActionValue.InteractiveMessageAction.InteractiveMessageActionMode = { DISABLE_CTA: 1 };
SyncActionValue.AvatarUpdatedAction = {};
SyncActionValue.AvatarUpdatedAction.AvatarEventType = { UPDATED: 0, CREATED: 1, DELETED: 2 };
SyncActionValue.MaibaAIFeaturesControlAction = {};
SyncActionValue.MaibaAIFeaturesControlAction.MaibaAIFeatureStatus = { ENABLED: 0, ENABLED_HAS_LEARNING: 1, DISABLED: 2 };
SyncActionValue.PrivateProcessingSettingAction = {};
SyncActionValue.PrivateProcessingSettingAction.PrivateProcessingStatus = { UNDEFINED: 0, ENABLED: 1, DISABLED: 2 };
SyncActionValue.PaymentTosAction = {};
SyncActionValue.PaymentTosAction.PaymentNotice = { BR_PAY_PRIVACY_POLICY: 0 };
SyncActionValue.BotModeSelectionMetadata = {};
SyncActionValue.BotModeSelectionMetadata.BotUserSelectionMode = { UNKNOWN_MODE: 0, REASONING_MODE: 1 };

// DeviceCapabilities enums
const DeviceCapabilities = {};
DeviceCapabilities.ChatLockSupportLevel = { NONE: 0, MINIMAL: 1, FULL: 2 };
DeviceCapabilities.MemberNameTagPrimarySupport = { DISABLED: 0, RECEIVER_ENABLED: 1, SENDER_ENABLED: 2 };

// HydratedTemplateButton enums
const HydratedTemplateButton = {};
HydratedTemplateButton.HydratedURLButton = {};
HydratedTemplateButton.HydratedURLButton.WebviewPresentationType = { FULL: 1, TALL: 2, COMPACT: 3 };

// InteractiveAnnotation enums
const InteractiveAnnotation = {};
InteractiveAnnotation.StatusLinkType = { RASTERIZED_LINK_PREVIEW: 1, RASTERIZED_LINK_TRUNCATED: 2, RASTERIZED_LINK_FULL_URL: 3 };

// MessageContextInfo enums
const MessageContextInfo = {};
MessageContextInfo.MessageAddonExpiryType = { STATIC: 1, DEPENDENT_ON_PARENT: 2 };

// PastParticipant enums
const PastParticipant = {};
PastParticipant.LeaveReason = { LEFT: 0, REMOVED: 1 };

// ---------------------------------------------------------------------------
// proto namespace: assemble all types
// ---------------------------------------------------------------------------
export const proto = {
  // Proto classes (encode/decode)
  ADVDeviceIdentity,
  ADVEncryptionType,
  ADVKeyIndexList,
  ADVSignedDeviceIdentity,
  ADVSignedDeviceIdentityHMAC,
  ADVSignedKeyIndexList,
  BizAccountLinkInfo,
  BizIdentityInfo,
  CallLogRecord,
  CertChain,
  ClientPayload,
  ContextInfo,
  Conversation,
  DeviceCapabilities,
  DeviceProps,
  DisappearingMode,
  ExitCode,
  ExternalBlobReference,
  GroupParticipant,
  HandshakeMessage,
  HistorySync,
  HydratedTemplateButton,
  InteractiveAnnotation,
  KeepType,
  LIDMigrationMappingSyncPayload,
  MediaRetryNotification,
  MediaVisibility,
  Message,
  MessageAddOn,
  MessageAssociation,
  MessageContextInfo,
  MutationProps,
  PastParticipant,
  PaymentInfo,
  PinInChat,
  SenderKeyDistributionMessage,
  SenderKeyMessage,
  ServerErrorReceipt,
  SyncActionData,
  SyncActionValue,
  SyncdMutation,
  SyncdMutations,
  SyncdPatch,
  SyncdRecord,
  SyncdSnapshot,
  VerifiedNameCertificate,
  WebFeatures,
  WebMessageInfo,
};

export default proto;
