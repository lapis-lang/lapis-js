/**
 * Behavior Stream with Design by Contract
 *
 * Demonstrates contracts on behavior (codata) types:
 * - demands on unfold (seed validation)
 * - demands + ensures on fold (operation contracts)
 * - rescue on fold (recovery from observation failures)
 */
import { behavior, fold, unfold, checkedMode, DemandsError } from '@lapis-lang/lapis-js';

checkedMode(true);

// Stream behavior with contracts on operations
const Stream = behavior(({ Self, T }) => ({
    head: T,
    tail: Self(T),

    // From: unfold with demands — seed must be a non-negative number
    From: unfold({
        in: Number,
        out: Self,
        demands: (_self: unknown, seed: number) => typeof seed === 'number' && seed >= 0
    })({
        head: (n: number) => n,
        tail: (n: number) => n + 1
    }),

    // Countdown: unfold with demands — must start from positive number
    Countdown: unfold({
        in: Number,
        out: Self,
        demands: (_self: unknown, n: number) => n > 0
    })({
        head: (n: number) => n,
        tail: (n: number) => Math.max(0, n - 1)
    }),

    // take: fold with demands + ensures + rescue
    take: fold({
        in: Number,
        out: Array,
        demands: (_self: unknown, n: number) => typeof n === 'number' && n >= 0,
        ensures: (_self: unknown, _old: unknown, result: unknown[], n: number) =>
            Array.isArray(result) && result.length <= n,
        rescue: (_self: unknown, error: Error, _args: unknown[]) => {
            console.log(`  [rescue] take failed: ${error.message} → returning []`);
            return [];
        }
    })({
        _: ({ head, tail }: { head: unknown; tail: (n: number) => unknown[] }, n: number) =>
            n > 0 ? [head, ...tail(n - 1)] : []
    }),

    // sum: fold first N elements with contracts
    sum: fold({
        in: Number,
        out: Number,
        demands: (_self: unknown, n: number) => n >= 0,
        ensures: (_self: unknown, _old: unknown, result: number) => typeof result === 'number'
    })({
        _: ({ head, tail }: { head: number; tail: (n: number) => number }, n: number) =>
            n > 0 ? head + tail(n - 1) : 0
    })
}));

const NumStream = Stream(Number);

console.log('=== Contracts: Stream Example ===\n');

// --- Unfold demands ---
console.log('1. Unfold demands:');
const nats = NumStream.From(0);
console.log(`   From(0).head = ${nats.head}`);
console.log(`   From(0).tail.head = ${nats.tail.head}`);

try {
    console.log('   Attempting From(-1)...');
    NumStream.From(-1);
} catch (e) {
    console.log(`   Caught: ${(e as Error).name}: ${(e as Error).message}`);
}

// --- Fold demands ---
console.log('\n2. Fold demands on take:');
const first5 = nats.take(5);
console.log(`   nats.take(5) = [${first5}]`);

try {
    console.log('   Attempting nats.take(-1)...');
    nats.take(-1);
} catch (e) {
    console.log(`   Caught: ${(e as Error).name}: ${(e as Error).message}`);
}

// --- Ensures ---
console.log('\n3. Ensures on take (result.length <= n):');
const first3 = nats.take(3);
console.log(`   nats.take(3) = [${first3}] (length ${first3.length} <= 3? ${first3.length <= 3})`);

// --- Sum with contracts ---
console.log('\n4. Sum with demands + ensures:');
const s = nats.sum(10);
console.log(`   nats.sum(10) = ${s} (sum of 0..9 = 45)`);

// --- Countdown stream ---
console.log('\n5. Countdown stream with demands:');
const countdown = NumStream.Countdown(5);
console.log(`   Countdown(5).take(7) = [${countdown.take(7)}]`);

try {
    console.log('   Attempting Countdown(0)...');
    NumStream.Countdown(0);
} catch (e) {
    console.log(`   Caught: ${(e as Error).name}: ${(e as Error).message}`);
}

// --- Checked mode ---
console.log('\n6. Checked mode toggle:');
checkedMode(false);
console.log(`   checkedMode(false) → ${checkedMode()}`);
try {
    // Negative take should work with checked mode off (demands skipped)
    const result = nats.take(3);
    console.log(`   nats.take(3) with checked=false: [${result}]`);
} catch (e) {
    console.log(`   Caught: ${(e as Error).message}`);
}
checkedMode(true);
console.log(`   checkedMode(true) → ${checkedMode()}`);

console.log('\n=== Done ===');
