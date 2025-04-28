export function bytesToBase64(bytes: Uint8Array): string {
	return btoa(String.fromCharCode(...bytes))
}

export function base64ToBytes(base64: string): Uint8Array {
	return new Uint8Array(
		atob(base64)
			.split('')
			.map((c) => c.charCodeAt(0))
	)
}

export function isEqualBytes(bytes1: Uint8Array, bytes2: Uint8Array): boolean {
	if(bytes1.length !== bytes2.length) {
		return false
	}

	for(let i = 0; i < bytes1.length; i++) {
		if(bytes1[i] !== bytes2[i]) {
			return false
		}
	}

	return true
}