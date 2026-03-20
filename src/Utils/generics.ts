import { Boom } from '@hapi/boom'
import { createHash, randomBytes } from 'crypto'
import { DEFAULT_CONNECTION_CONFIG } from '../Defaults'
const baileysVersion = DEFAULT_CONNECTION_CONFIG.version
import type { WAMessageKey, WAVersion } from '../Types'
import { DisconnectReason } from '../Types'
import { jidDecode } from '../WABinary'

export const BufferJSON = {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	replacer: (k: any, value: any) => {
		if (Buffer.isBuffer(value) || value instanceof Uint8Array || value?.type === 'Buffer') {
			return { type: 'Buffer', data: Buffer.from(value?.data || value).toString('base64') }
		}

		return value
	},

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	reviver: (_: any, value: any) => {
		if (typeof value === 'object' && value !== null && value.type === 'Buffer' && typeof value.data === 'string') {
			return Buffer.from(value.data, 'base64')
		}

		if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
			const keys = Object.keys(value)
			if (keys.length > 0 && keys.every(k => !isNaN(parseInt(k, 10)))) {
				const values = Object.values(value)
				if (values.every(v => typeof v === 'number')) {
					return Buffer.from(values)
				}
			}
		}

		return value
	}
}

export const getKeyAuthor = (key: WAMessageKey | undefined | null, meId = 'me') =>
	(key?.fromMe ? meId : key?.participantAlt || key?.remoteJidAlt || key?.participant || key?.remoteJid) || ''

export const generateRegistrationId = (): number => {
	return Uint16Array.from(randomBytes(2))[0]! & 16383
}

/** unix timestamp of a date in seconds */
export const unixTimestampSeconds = (date: Date = new Date()) => Math.floor(date.getTime() / 1000)

// inspired from whatsmeow code
export const generateMessageIDV2 = (userId?: string): string => {
	const data = Buffer.alloc(8 + 20 + 16)
	data.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 1000)))

	if (userId) {
		const id = jidDecode(userId)
		if (id?.user) {
			data.write(id.user, 8)
			data.write('@c.us', 8 + id.user.length)
		}
	}

	const random = randomBytes(16)
	random.copy(data, 28)

	const hash = createHash('sha256').update(data).digest()
	return '3EB0' + hash.toString('hex').toUpperCase().substring(0, 18)
}

const delayCancellable = (ms: number) => {
	const stack = new Error().stack
	let timeout: NodeJS.Timeout
	let reject: (error: Error) => void
	const delay: Promise<void> = new Promise((resolve, _reject) => {
		timeout = setTimeout(resolve, ms)
		reject = _reject
	})
	const cancel = () => {
		clearTimeout(timeout)
		reject(new Boom('Cancelled', { statusCode: 500, data: { stack } }))
	}

	return { delay, cancel }
}

async function promiseTimeout<T>(
	ms: number | undefined,
	promise: (resolve: (v: T) => void, reject: (error: Error) => void) => void
) {
	if (!ms) {
		return new Promise(promise)
	}

	const stack = new Error().stack
	const { delay, cancel } = delayCancellable(ms)
	const p = new Promise((resolve, reject) => {
		delay
			.then(() =>
				reject(new Boom('Timed Out', { statusCode: DisconnectReason.timedOut, data: { stack } }))
			)
			.catch(err => reject(err))

		promise(resolve, reject)
	}).finally(cancel)
	return p as Promise<T>
}

export const fetchLatestBaileysVersion = async (options: RequestInit = {}) => {
	const URL = 'https://raw.githubusercontent.com/WhiskeySockets/Baileys/master/src/Defaults/index.ts'
	try {
		const response = await fetch(URL, {
			dispatcher: options.dispatcher,
			method: 'GET',
			headers: options.headers
		})
		if (!response.ok) {
			throw new Boom(`Failed to fetch latest Baileys version: ${response.statusText}`, { statusCode: response.status })
		}

		const text = await response.text()
		const lines = text.split('\n')
		const versionLine = lines[6]
		const versionMatch = versionLine!.match(/const version = \[(\d+),\s*(\d+),\s*(\d+)\]/)

		if (versionMatch) {
			const version = [parseInt(versionMatch[1]!), parseInt(versionMatch[2]!), parseInt(versionMatch[3]!)] as WAVersion
			return { version, isLatest: true }
		} else {
			throw new Error('Could not parse version from Defaults/index.ts')
		}
	} catch (error) {
		return { version: baileysVersion as WAVersion, isLatest: false, error }
	}
}

export const fetchLatestWaWebVersion = async (options: RequestInit = {}) => {
	try {
		const defaultHeaders = {
			'sec-fetch-site': 'none',
			'user-agent':
				'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
		}

		const headers = { ...defaultHeaders, ...options.headers }

		const response = await fetch('https://web.whatsapp.com/sw.js', {
			...options,
			method: 'GET',
			headers
		})

		if (!response.ok) {
			throw new Boom(`Failed to fetch sw.js: ${response.statusText}`, { statusCode: response.status })
		}

		const data = await response.text()
		const regex = /\\?"client_revision\\?":\s*(\d+)/
		const match = data.match(regex)

		if (!match?.[1]) {
			return {
				version: baileysVersion as WAVersion,
				isLatest: false,
				error: { message: 'Could not find client revision in the fetched content' }
			}
		}

		return {
			version: [2, 3000, +match[1]] as WAVersion,
			isLatest: true
		}
	} catch (error) {
		return { version: baileysVersion as WAVersion, isLatest: false, error }
	}
}
