import { exec } from 'child_process'
import { createReadStream, createWriteStream, promises as fs } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { generateMessageID } from './generics'
import { FileSystemAdapter, MediaProcessingAdapter, PlatformAdapters, TmpFileAdapter } from './platform-adapters'

const nodeFileSystemAdapter: FileSystemAdapter = {
	createReadStream: (path: string) => createReadStream(path),
	createWriteStream: (path: string) => createWriteStream(path),
	readFile: (path: string) => fs.readFile(path),
	unlink: (path: string) => fs.unlink(path)
}

const nodeTmpFileAdapter: TmpFileAdapter = {
	getTmpFilesDirectory: () => tmpdir(),
	createTempFilePath: (prefix: string) => join(tmpdir(), prefix + generateMessageID())
}

const nodeMediaProcessingAdapter: MediaProcessingAdapter = {
	extractVideoThumb: (path, destPath, time, size) => {
		return new Promise<void>((resolve, reject) => {
			const cmd = `ffmpeg -ss ${time} -i ${path} -y -vf scale=${size.width}:-1 -vframes 1 -f image2 ${destPath}`
			exec(cmd, (err) => {
				if(err) {
					reject(err)
				} else {
					resolve()
				}
			})
		})
	}
}

export const getNodeAdapters = (): PlatformAdapters => ({
	fileSystem: nodeFileSystemAdapter,
	tmpFile: nodeTmpFileAdapter,
	mediaProcessing: nodeMediaProcessingAdapter
})
