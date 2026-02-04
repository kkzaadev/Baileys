import { performance } from 'perf_hooks';

const SIZE = 10 * 1024 * 1024;
const buffer: number[] = [];
const bytes = Buffer.alloc(SIZE);
const numbers = new Array(SIZE).fill(1);

// Warmup
buffer.length = 0;
for (let i=0; i<100; i++) buffer.push(1);

console.log('Benchmarking Apply...');

// 1. Apply Buffer 65k
buffer.length = 0;
let start = performance.now();
let step = 65536;
for (let i = 0; i < bytes.length; i += step) {
    // @ts-ignore
    Array.prototype.push.apply(buffer, bytes.subarray(i, i + step));
}
let end = performance.now();
console.log(`Apply Buffer 65k: ${end - start}ms`);

// 2. Apply Numbers 65k
buffer.length = 0;
start = performance.now();
step = 65536;
for (let i = 0; i < numbers.length; i += step) {
    // @ts-ignore
    Array.prototype.push.apply(buffer, numbers.slice(i, i + step));
}
end = performance.now();
console.log(`Apply Numbers 65k: ${end - start}ms`);

// 3. For index Buffer
buffer.length = 0;
start = performance.now();
for (let i = 0; i < bytes.length; i++) {
    buffer.push(bytes[i]);
}
end = performance.now();
console.log(`For index Buffer: ${end - start}ms`);

// 4. For index Numbers
buffer.length = 0;
start = performance.now();
for (let i = 0; i < numbers.length; i++) {
    buffer.push(numbers[i]);
}
end = performance.now();
console.log(`For index Numbers: ${end - start}ms`);
