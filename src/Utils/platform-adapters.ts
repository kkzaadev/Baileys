import { Readable, Writable } from 'stream'

export interface FileSystemAdapter {
  createReadStream(path: string): Readable
  createWriteStream(path: string): Writable
  readFile(path: string): Promise<Buffer>
  unlink(path: string): Promise<void>
}

export interface TmpFileAdapter {
  getTmpFilesDirectory(): string
  createTempFilePath(prefix: string): string
}

export interface MediaProcessingAdapter {
  extractVideoThumb(
    path: string,
    destPath: string,
    time: string,
    size: { width: number, height: number }
  ): Promise<void>
}

export interface PlatformAdapters {
  fileSystem: FileSystemAdapter
  tmpFile: TmpFileAdapter
  mediaProcessing: MediaProcessingAdapter
}

// Default adapters will be set to throw errors when used without proper initialization
let platformAdapters: PlatformAdapters | null = null

export const setPlatformAdapters = (adapters: PlatformAdapters) => {
	platformAdapters = adapters
}

export const getPlatformAdapters = (): PlatformAdapters => {
	if(!platformAdapters) {
		throw new Error('Platform adapters not initialized. Call setPlatformAdapters first.')
	}

	return platformAdapters
}

// Helper function to dynamically load Node.js adapters if in Node environment
export const initNodePlatformAdapters = async() => {
	if(typeof window === 'undefined') {
		// We're in Node.js environment
		const { getNodeAdapters } = await import('./node-platform-adapters')
		setPlatformAdapters(getNodeAdapters())
	} else {
		console.warn('Attempted to load Node.js adapters in browser environment')
	}
}
