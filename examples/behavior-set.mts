/**
 * Behavior Examples - Infinite Sets (using [extend] for behavior inheritance)
 *
 * Demonstrates a base Set behavior extended by specialised subtypes.
 * Sets are defined by their membership function rather than their elements,
 * making it natural to represent infinite collections.
 *
 * Hierarchy:
 *   Set  ←  NumericSet   (isEmpty, member; Evens / Odds / Multiples)
 *        ←  PrimeSet     (+ nthPrime)
 *        ←  RangeSet     (+ min, max)
 *        ←  CharSet      (+ cardinality)
 */

import { behavior, extend , unfold } from '../src/index.mjs';
import { isPrime, NthPrimeFinder } from '../src/lib/primes.mjs';

// =============================================================================
// Base Set interface
// =============================================================================

const Set = behavior(() => ({
        isEmpty: Boolean,
        member: { in: Number, out: Boolean }
    })),

    // =============================================================================
    // Example 1: Numeric Sets (extends Set — no new observers)
    // The parent unfold Empty is inherited automatically.
    // =============================================================================

    NumericSet = behavior(({ Self }) => ({
        [extend]: Set,
        Empty: unfold({})({
            isEmpty: () => true,
            member: () => () => false
        }),
        Evens: unfold({})({
            isEmpty: () => false,
            member: () => (n) => n % 2 === 0
        }),
        Odds: unfold({})({
            isEmpty: () => false,
            member: () => (n) => n % 2 !== 0
        }),
        Multiples: unfold({ in: Number, out: Self })({
            isEmpty: () => false,
            member: (divisor) => (n) => n % divisor === 0
        })
    }));

console.log('\n=== Numeric Sets ===');
console.log('NumericSet.Evens instanceof Set:', NumericSet.Evens instanceof Set);             // true
console.log('NumericSet.Evens instanceof NumericSet:', NumericSet.Evens instanceof NumericSet); // true

const evens = NumericSet.Evens;
console.log('evens.isEmpty:', evens.isEmpty);         // false
console.log('evens.member(4):', evens.member(4));     // true
console.log('evens.member(5):', evens.member(5));     // false
console.log('evens.member(0):', evens.member(0));     // true
console.log('evens.member(100):', evens.member(100)); // true

const odds = NumericSet.Odds;
console.log('\nodds.member(4):', odds.member(4));     // false
console.log('odds.member(5):', odds.member(5));       // true
console.log('odds.member(99):', odds.member(99));     // true

const multiplesOf3 = NumericSet.Multiples(3);
console.log('\nmultiplesOf3.member(9):', multiplesOf3.member(9));    // true
console.log('multiplesOf3.member(10):', multiplesOf3.member(10));   // false
console.log('multiplesOf3.member(15):', multiplesOf3.member(15));   // true

const empty = NumericSet.Empty;
console.log('\nempty.isEmpty:', empty.isEmpty);        // true
console.log('empty.member(0):', empty.member(0));     // false

// =============================================================================
// Example 2: Prime Numbers Set (extends Set, adds nthPrime observer)
// =============================================================================

const PrimeSet = behavior(() => ({
    [extend]: Set,
    nthPrime: { in: Number, out: Number },
    Create: unfold({})({
        isEmpty: () => false,
        member: () => (n) => isPrime(n),
        nthPrime: () => (index) => NthPrimeFinder.Search({ candidate: 2, count: index }).result
    })
}));

console.log('\n=== Prime Numbers Set ===');
console.log('primes instanceof Set:', PrimeSet.Create instanceof Set);   // true

const primes = PrimeSet.Create;
console.log('primes.isEmpty:', primes.isEmpty);              // false
console.log('primes.member(2):', primes.member(2));          // true
console.log('primes.member(3):', primes.member(3));          // true
console.log('primes.member(4):', primes.member(4));          // false
console.log('primes.member(17):', primes.member(17));        // true
console.log('primes.member(100):', primes.member(100));      // false

console.log('\nFirst 10 primes:');
for (let i = 0; i < 10; i++)
    console.log(`  prime[${i}] = ${primes.nthPrime(i)}`);


// =============================================================================
// Example 3: Range Set (extends Set, adds min and max observers)
// =============================================================================

const RangeSet = behavior(({ Self }) => ({
    [extend]: Set,
    min: Number,
    max: Number,
    Create: unfold({ in: { min: Number, max: Number }, out: Self })({
        member: ({ min, max }) => (n) => n >= min && n <= max,
        min: ({ min }) => min,
        max: ({ max }) => max,
        isEmpty: ({ min, max }) => min > max
    }),
    Infinite: unfold({})({
        member: () => () => true,
        min: () => -Infinity,
        max: () => Infinity,
        isEmpty: () => false
    })
}));

console.log('\n=== Range Sets ===');
console.log('range instanceof Set:', RangeSet.Create({ min: 1, max: 10 }) instanceof Set); // true

const range = RangeSet.Create({ min: 1, max: 10 });
console.log('range[1,10].member(5):', range.member(5));    // true
console.log('range[1,10].member(11):', range.member(11));  // false
console.log('range[1,10].min:', range.min);                // 1
console.log('range[1,10].max:', range.max);                // 10
console.log('range[1,10].isEmpty:', range.isEmpty);        // false

const all = RangeSet.Infinite;
console.log('\nall.member(999999):', all.member(999999));    // true
console.log('all.member(-999999):', all.member(-999999));   // true
console.log('all.isEmpty:', all.isEmpty);                   // false

// =============================================================================
// Example 4: Characteristic Functions (extends Set, adds cardinality observer)
// =============================================================================

const CharSet = behavior(() => ({
    [extend]: Set,
    cardinality: String,
    Squares: unfold({})({
        isEmpty: () => false,
        member: () => (n) => {
            const sqrt = Math.sqrt(n);
            return sqrt === Math.floor(sqrt);
        },
        cardinality: () => 'countably infinite'
    }),
    Positive: unfold({})({
        isEmpty: () => false,
        member: () => (n) => n > 0,
        cardinality: () => 'countably infinite'
    }),
    Fibonacci: unfold({})({
        isEmpty: () => false,
        member: () => (n) => {
            if (n < 0) return false;
            const isPerfectSquare = (x) => {
                const sqrt = Math.sqrt(x);
                return sqrt === Math.floor(sqrt);
            };
            return isPerfectSquare(5 * n * n + 4) || isPerfectSquare(5 * n * n - 4);
        },
        cardinality: () => 'countably infinite'
    }),
    Digits: unfold({})({
        isEmpty: () => false,
        member: () => (n) => Number.isInteger(n) && n >= 0 && n <= 9,
        cardinality: () => 'finite'
    })
}));

console.log('\n=== Characteristic Functions ===');
console.log('squares instanceof Set:', CharSet.Squares instanceof Set);  // true

const squares = CharSet.Squares;
console.log('squares.member(4):', squares.member(4));      // true
console.log('squares.member(5):', squares.member(5));      // false
console.log('squares.member(16):', squares.member(16));    // true
console.log('squares.member(100):', squares.member(100));  // true
console.log('squares.cardinality:', squares.cardinality);  // countably infinite

const positive = CharSet.Positive;
console.log('\npositive.member(5):', positive.member(5));   // true
console.log('positive.member(-5):', positive.member(-5));   // false
console.log('positive.member(0):', positive.member(0));     // false

const fibonacci = CharSet.Fibonacci;
console.log('\nfibonacci.member(0):', fibonacci.member(0));    // true
console.log('fibonacci.member(1):', fibonacci.member(1));      // true
console.log('fibonacci.member(2):', fibonacci.member(2));      // true
console.log('fibonacci.member(3):', fibonacci.member(3));      // true
console.log('fibonacci.member(4):', fibonacci.member(4));      // false
console.log('fibonacci.member(5):', fibonacci.member(5));      // true
console.log('fibonacci.member(8):', fibonacci.member(8));      // true
console.log('fibonacci.member(13):', fibonacci.member(13));    // true
console.log('fibonacci.member(21):', fibonacci.member(21));    // true

const digits = CharSet.Digits;
console.log('\ndigits.member(5):', digits.member(5));       // true
console.log('digits.member(10):', digits.member(10));      // false
console.log('digits.cardinality:', digits.cardinality);    // finite

console.log('\n=== All examples completed ===\n');
