import type { JsHttpClientConfig, JsTransportCallbacks, JsTransportHandle } from 'whatsapp-rust-bridge'
import WebSocket from 'ws'
import type { ILogger } from '../Utils/logger'

interface TransportConfig {
	waWebSocketUrl: string | URL
	agent?: unknown
	fetchAgent?: unknown
	logger: ILogger
	/** RequestInit options passed to fetch() — use `dispatcher` for proxy/TLS config */
	options?: RequestInit
}

export const makeTransport = (config: TransportConfig): JsTransportCallbacks => {
	const { waWebSocketUrl, agent, logger } = config
	let ws: WebSocket | undefined
	let handle: JsTransportHandle | undefined
	let disconnectTarget: WebSocket | undefined

	return {
		connect(h: JsTransportHandle) {
			handle = h
			const url = typeof waWebSocketUrl === 'string' ? waWebSocketUrl : waWebSocketUrl.toString()
			const wsOpts: WebSocket.ClientOptions = {}
			if (agent) {
				wsOpts.agent = agent as unknown as WebSocket.ClientOptions['agent']
			}

			disconnectTarget = ws
			if (ws) ws.removeAllListeners()

			const newWs = new WebSocket(url, wsOpts)
			newWs.binaryType = 'arraybuffer'
			ws = newWs

			return new Promise<void>((resolve, reject) => {
				newWs.on('open', () => {
					if (ws !== newWs) return
					handle?.onConnected()
					resolve()
				})
				newWs.on('message', (data: ArrayBuffer | Buffer) => {
					if (ws !== newWs) return
					const arr =
						data instanceof ArrayBuffer
							? new Uint8Array(data)
							: new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
					handle?.onData(arr)
				})
				newWs.on('close', () => {
					if (ws !== newWs) return
					handle?.onDisconnected()
				})
				newWs.on('error', (err: Error) => {
					if (ws !== newWs) return
					logger.error({ err }, 'WebSocket error')
					reject(err)
				})
			})
		},
		send(data: Uint8Array) {
			if (ws?.readyState === WebSocket.OPEN) {
				ws.send(data)
			}
		},
		disconnect() {
			const toClose = disconnectTarget ?? ws
			if (toClose) {
				toClose.removeAllListeners()
				toClose.on('error', () => {})
				try {
					toClose.close()
				} catch {
					toClose.terminate()
				}
			}

			if (toClose === ws) ws = undefined
			disconnectTarget = undefined
		}
	}
}

export const makeHttpClient = (config: TransportConfig): JsHttpClientConfig => ({
	async execute(url, method, headers, body) {
		const fetchOpts: RequestInit = { method, headers }
		if (body) fetchOpts.body = body as unknown as BodyInit
		// Pass dispatcher from config.options for proxy/TLS support.
		// Users should set `options: { dispatcher: new undici.Agent(...) }` in SocketConfig.
		// Note: Node.js fetch() only accepts undici.Agent as dispatcher, NOT https.Agent.
		if (config.options?.dispatcher) fetchOpts.dispatcher = config.options.dispatcher

		const resp = await fetch(url, fetchOpts)
		const buf = new Uint8Array(await resp.arrayBuffer())
		return { statusCode: resp.status, body: buf }
	}
})
