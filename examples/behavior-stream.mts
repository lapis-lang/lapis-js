/**
 * Behavior Examples - Streams and Infinite Structures
 *
 * This file demonstrates the use of behavior (final coalgebras) in Lapis JS,
 * showcasing lazy evaluation, infinite structures, and observer-based programming.
 */

import { behavior , unfold } from '../src/index.mjs';

// =============================================================================
// Example 1: Basic Stream with Simple Observers and Continuations
// =============================================================================

const Stream = behavior(({ Self, T }) => ({
        head: T,           // Simple observer: returns current value
        tail: Self(T),     // Continuation: returns next stream
        From: unfold({ in: Number, out: Self })({
            head: (n) => n,
            tail: (n) => n + 1
        }),
        Constant: unfold({ in: Number, out: Self })({
            head: (n) => n,
            tail: (n) => n
        }),
        Range: unfold({ in: { start: Number, end: Number }, out: Self })({
            head: ({ start }) => start,
            tail: ({ start, end }) => start < end ? { start: start + 1, end } : { start: end, end }
        })
    })),

    // Instantiate for numbers
    StreamNum = Stream({ T: Number });

console.log('\n=== Basic Stream Examples ===');

// Natural numbers starting from 0
const nums = StreamNum.From(0);
console.log('nums.head:', nums.head);              // 0
console.log('nums.tail.head:', nums.tail.head);    // 1
console.log('nums.tail.tail.head:', nums.tail.tail.head); // 2

// Constant stream of ones
const ones = StreamNum.Constant(1);
console.log('ones.head:', ones.head);              // 1
console.log('ones.tail.head:', ones.tail.head);    // 1
console.log('ones.tail.tail.head:', ones.tail.tail.head); // 1

// Range stream
const range = StreamNum.Range({ start: 5, end: 10 });
console.log('range.head:', range.head);            // 5
console.log('range.tail.head:', range.tail.head);  // 6

// =============================================================================
// Example 2: Stream with Parametric Observers
// =============================================================================

const StreamWithNth = behavior(({ Self, T }) => ({
        head: T,
        tail: Self(T),
        nth: { in: Number, out: T },  // Parametric observer
        From: unfold({ in: Number, out: Self })({
            head: (n) => n,
            tail: (n) => n + 1,
            nth: (n) => (index) => n + index
        })
    })),

    StreamNumNth = StreamWithNth({ T: Number });

console.log('\n=== Parametric Observer Example ===');

const numsWithNth = StreamNumNth.From(0);
console.log('numsWithNth.nth(5):', numsWithNth.nth(5));    // 5
console.log('numsWithNth.nth(10):', numsWithNth.nth(10));  // 10
console.log('numsWithNth.nth(100):', numsWithNth.nth(100)); // 100

// =============================================================================
// Example 3: Fibonacci Stream
// =============================================================================

const FibStream = behavior(({ Self }) => ({
    head: Number,
    tail: Self,
    Create: unfold({ in: { a: Number, b: Number }, out: Self })({
        head: ({ a }) => a,
        tail: ({ a, b }) => ({ a: b, b: a + b })
    })
}));

console.log('\n=== Fibonacci Stream ===');

const fib = FibStream.Create({ a: 0, b: 1 });
console.log('fib[0]:', fib.head);                    // 0
console.log('fib[1]:', fib.tail.head);               // 1
console.log('fib[2]:', fib.tail.tail.head);          // 1
console.log('fib[3]:', fib.tail.tail.tail.head);     // 2
console.log('fib[4]:', fib.tail.tail.tail.tail.head); // 3

// =============================================================================
// Example 4: Infinite Binary Tree
// =============================================================================

const Tree = behavior(({ Self }) => ({
    value: Number,
    left: Self,
    right: Self,
    Create: unfold({ in: Number, out: Self })({
        value: (n) => n,
        left: (n) => n * 2,
        right: (n) => n * 2 + 1
    })
}));

console.log('\n=== Infinite Binary Tree ===');

const tree = Tree.Create(1);
console.log('tree.value:', tree.value);                    // 1
console.log('tree.left.value:', tree.left.value);          // 2
console.log('tree.right.value:', tree.right.value);        // 3
console.log('tree.left.left.value:', tree.left.left.value); // 4
console.log('tree.left.right.value:', tree.left.right.value); // 5
console.log('tree.right.left.value:', tree.right.left.value); // 6
console.log('tree.right.right.value:', tree.right.right.value); // 7

// =============================================================================
// Example 5: Lazy Evaluation and Memoization
// =============================================================================

console.log('\n=== Lazy Evaluation and Memoization ===');

const LazyStream = behavior(({ Self }) => ({
        head: Number,
        tail: Self,
        Create: unfold({ in: Number, out: Self })({
            head: (n) => {
                console.log(`  Computing head for seed ${n}`);
                return n;
            },
            tail: (n) => {
                console.log(`  Computing tail for seed ${n}`);
                return n + 1;
            }
        })
    })),

    lazy = LazyStream.Create(0);

// Simple observers are recomputed on each access — log line appears twice:
console.log('First access to head:');
console.log('  lazy.head =', lazy.head);
console.log('Second access to head (recomputed):');
console.log('  lazy.head =', lazy.head);

// Continuations are memoized — log line appears only once despite two accesses:
console.log('\nFirst access to tail:');
const tail1 = lazy.tail;
console.log('  lazy.tail.head =', tail1.head);

console.log('Second access to tail (memoized — no log line above):');
const tail2 = lazy.tail;
console.log('  tail1 === tail2:', tail1 === tail2);  // true (memoized)

// =============================================================================
// Example 6: Effect-like Behavior (Console IO)
// =============================================================================

const Console = behavior(() => ({
    log: { in: String, out: undefined },
    read: { out: String },
    Create: unfold({})({
        log: () => (msg) => { console.log(`  [Console.log] ${msg}`); },
        read: () => () => 'simulated input'
    })
}));

console.log('\n=== Effect-like Behavior (Console) ===');

const io = Console.Create;
io.log('Hello, world!');
io.log('This demonstrates effect-like behavior');
// @ts-expect-error -- intentional type violation for test
const input = io.read();
console.log(`  [Console.read] Got: "${input}"`);

// =============================================================================
// Example 7: Multiple Seed Transformations
// =============================================================================

const PowerStream = behavior(({ Self }) => ({
    head: Number,
    tail: Self,
    Create: unfold({ in: { base: Number, exp: Number }, out: Self })({
        head: ({ base, exp }) => Math.pow(base, exp),
        tail: ({ base, exp }) => ({ base, exp: exp + 1 })
    })
}));

console.log('\n=== Power Stream (2^n) ===');

const powers = PowerStream.Create({ base: 2, exp: 0 });
console.log('2^0:', powers.head);                      // 1
console.log('2^1:', powers.tail.head);                 // 2
console.log('2^2:', powers.tail.tail.head);            // 4
console.log('2^3:', powers.tail.tail.tail.head);       // 8
console.log('2^4:', powers.tail.tail.tail.tail.head);  // 16

console.log('\n=== All examples completed ===\n');
