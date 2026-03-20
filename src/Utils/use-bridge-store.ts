import { mkdir, readFile, unlink, writeFile } from 'fs/promises'
import { join } from 'path'
import type { JsStoreCallbacks } from 'whatsapp-rust-bridge'

/**
 * Creates a file-based JsStoreCallbacks implementation for the WASM bridge.
 *
 * Each (store, key) pair maps to a file: `<folder>/<store>-<key>.bin`
 *
 * This keeps bridge state (Signal sessions, device data, sync keys, etc.)
 * persistent across restarts. Place it in a subdirectory of the auth folder
 * for co-located storage.
 *
 * @param folder Directory to store bridge state files
 * @returns JsStoreCallbacks implementation
 *
 * @example
 * ```ts
 * const bridgeStore = await useBridgeStore('baileys_auth_info/bridge')
 * const client = await createWhatsAppClient(transport, http, handleEvent, bridgeStore)
 * ```
 */
export async function useBridgeStore(folder: string): Promise<JsStoreCallbacks> {
	await mkdir(folder, { recursive: true })

	return {
		async get(store: string, key: string): Promise<Uint8Array | null> {
			try {
				const data = await readFile(join(folder, `${store}-${encodeURIComponent(key)}.bin`))
				return new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
			} catch {
				return null
			}
		},
		async set(store: string, key: string, value: Uint8Array): Promise<void> {
			await writeFile(join(folder, `${store}-${encodeURIComponent(key)}.bin`), value)
		},
		async delete(store: string, key: string): Promise<void> {
			try {
				await unlink(join(folder, `${store}-${encodeURIComponent(key)}.bin`))
			} catch {
				// ignore if file doesn't exist
			}
		}
	}
}
