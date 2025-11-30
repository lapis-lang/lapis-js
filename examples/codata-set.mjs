/**
 * Codata Examples - Infinite Sets
 *
 * This file demonstrates infinite sets represented as codata interfaces.
 * Sets are defined by their membership function rather than their elements,
 * making it natural to represent infinite sets like "all even numbers".
 */

import { codata } from '../src/index.mjs';

// =============================================================================
// Example 1: Basic Infinite Sets
// =============================================================================

const CodataSet = codata(({ Self }) => ({
    isEmpty: Boolean,
    lookup: { in: Number, out: Boolean },
    insert: { in: Number, out: Self },
    remove: { in: Number, out: Self }
}));

const NumSet = CodataSet
    .unfold('Evens', (CodataSet) => ({ out: CodataSet }), {
        isEmpty: () => false,  // Infinite set is never empty
        lookup: () => (n) => n % 2 === 0,
        insert: () => () => undefined,  // Can't modify infinite sets
        remove: () => () => undefined
    })
    .unfold('Odds', (CodataSet) => ({ out: CodataSet }), {
        isEmpty: () => false,
        lookup: () => (n) => n % 2 !== 0,
        insert: () => () => undefined,
        remove: () => () => undefined
    })
    .unfold('Multiples', (CodataSet) => ({ in: Number, out: CodataSet }), {
        isEmpty: () => false,
        lookup: (divisor) => (n) => n % divisor === 0,
        insert: () => () => undefined,
        remove: () => () => undefined
    });

console.log('\n=== Basic Infinite Sets ===');

const evens = NumSet.Evens();
console.log('evens.isEmpty:', evens.isEmpty);        // false
console.log('evens.lookup(4):', evens.lookup(4));    // true
console.log('evens.lookup(5):', evens.lookup(5));    // false
console.log('evens.lookup(0):', evens.lookup(0));    // true
console.log('evens.lookup(100):', evens.lookup(100)); // true

const odds = NumSet.Odds();
console.log('\nodds.lookup(4):', odds.lookup(4));    // false
console.log('odds.lookup(5):', odds.lookup(5));      // true
console.log('odds.lookup(99):', odds.lookup(99));    // true

const multiplesOf3 = NumSet.Multiples(3);
console.log('\nmultiplesOf3.lookup(9):', multiplesOf3.lookup(9));   // true
console.log('multiplesOf3.lookup(10):', multiplesOf3.lookup(10));   // false
console.log('multiplesOf3.lookup(15):', multiplesOf3.lookup(15));   // true

// =============================================================================
// Example 2: Prime Numbers Set
// =============================================================================

const PrimeSet = codata(() => ({
    isEmpty: Boolean,
    contains: { in: Number, out: Boolean },
    nthPrime: { in: Number, out: Number }
}))
    .unfold('Create', (PrimeSet) => ({ out: PrimeSet }), {
        isEmpty: () => false,
        contains: () => (n) => {
            if (n < 2) return false;
            if (n === 2) return true;
            if (n % 2 === 0) return false;
            for (let i = 3; i <= Math.sqrt(n); i += 2) {
                if (n % i === 0) return false;
            }
            return true;
        },
        nthPrime: () => (index) => {
            // Simple prime generator (not efficient, just for demo)
            let count = 0;
            let candidate = 2;
            while (count <= index) {
                if (isPrime(candidate)) {
                    if (count === index) return candidate;
                    count++;
                }
                candidate++;
            }
            return -1;
        }
    });

function isPrime(n) {
    if (n < 2) return false;
    if (n === 2) return true;
    if (n % 2 === 0) return false;
    for (let i = 3; i <= Math.sqrt(n); i += 2) {
        if (n % i === 0) return false;
    }
    return true;
}

console.log('\n=== Prime Numbers Set ===');

const primes = PrimeSet.Create();
console.log('primes.contains(2):', primes.contains(2));     // true
console.log('primes.contains(3):', primes.contains(3));     // true
console.log('primes.contains(4):', primes.contains(4));     // false
console.log('primes.contains(17):', primes.contains(17));   // true
console.log('primes.contains(100):', primes.contains(100)); // false

console.log('\nFirst 10 primes:');
for (let i = 0; i < 10; i++) {
    console.log(`  prime[${i}] = ${primes.nthPrime(i)}`);
}

// =============================================================================
// Example 3: Range Set (Intervals)
// =============================================================================

const RangeSet = codata(() => ({
    contains: { in: Number, out: Boolean },
    min: Number,
    max: Number,
    isEmpty: Boolean
}))
    .unfold('Create', (RangeSet) => ({ in: { min: Number, max: Number }, out: RangeSet }), {
        contains: ({ min, max }) => (n) => n >= min && n <= max,
        min: ({ min }) => min,
        max: ({ max }) => max,
        isEmpty: ({ min, max }) => min > max
    })
    .unfold('Infinite', (RangeSet) => ({ out: RangeSet }), {
        contains: () => () => true,
        min: () => -Infinity,
        max: () => Infinity,
        isEmpty: () => false
    });

console.log('\n=== Range Sets ===');

const range = RangeSet.Create({ min: 1, max: 10 });
console.log('range[1,10].contains(5):', range.contains(5));   // true
console.log('range[1,10].contains(11):', range.contains(11)); // false
console.log('range[1,10].min:', range.min);                   // 1
console.log('range[1,10].max:', range.max);                   // 10

const all = RangeSet.Infinite();
console.log('\nall.contains(999999):', all.contains(999999)); // true
console.log('all.contains(-999999):', all.contains(-999999)); // true
console.log('all.isEmpty:', all.isEmpty);                     // false

// =============================================================================
// Example 4: Characteristic Functions
// =============================================================================

const CharSet = codata(() => ({
    member: { in: Number, out: Boolean },
    cardinality: String  // "finite", "countably infinite", etc.
}))
    .unfold('Squares', (CharSet) => ({ out: CharSet }), {
        member: () => (n) => {
            const sqrt = Math.sqrt(n);
            return sqrt === Math.floor(sqrt);
        },
        cardinality: () => 'countably infinite'
    })
    .unfold('Positive', (CharSet) => ({ out: CharSet }), {
        member: () => (n) => n > 0,
        cardinality: () => 'countably infinite'
    })
    .unfold('Fibonacci', (CharSet) => ({ out: CharSet }), {
        member: () => (n) => {
            // Check if n is a Fibonacci number
            // A number is Fibonacci if one of (5*n^2 + 4) or (5*n^2 - 4) is a perfect square
            if (n < 0) return false;
            const test1 = 5 * n * n + 4;
            const test2 = 5 * n * n - 4;
            const isPerfectSquare = (x) => {
                const sqrt = Math.sqrt(x);
                return sqrt === Math.floor(sqrt);
            };
            return isPerfectSquare(test1) || isPerfectSquare(test2);
        },
        cardinality: () => 'countably infinite'
    });

console.log('\n=== Characteristic Functions ===');

const squares = CharSet.Squares();
console.log('squares.member(4):', squares.member(4));     // true
console.log('squares.member(5):', squares.member(5));     // false
console.log('squares.member(16):', squares.member(16));   // true
console.log('squares.member(100):', squares.member(100)); // true

const positive = CharSet.Positive();
console.log('\npositive.member(5):', positive.member(5));   // true
console.log('positive.member(-5):', positive.member(-5));   // false
console.log('positive.member(0):', positive.member(0));     // false

const fibonacci = CharSet.Fibonacci();
console.log('\nfibonacci.member(0):', fibonacci.member(0));   // true
console.log('fibonacci.member(1):', fibonacci.member(1));     // true
console.log('fibonacci.member(2):', fibonacci.member(2));     // true
console.log('fibonacci.member(3):', fibonacci.member(3));     // true
console.log('fibonacci.member(4):', fibonacci.member(4));     // false
console.log('fibonacci.member(5):', fibonacci.member(5));     // true
console.log('fibonacci.member(8):', fibonacci.member(8));     // true
console.log('fibonacci.member(13):', fibonacci.member(13));   // true
console.log('fibonacci.member(21):', fibonacci.member(21));   // true

console.log('\n=== All examples completed ===\n');
