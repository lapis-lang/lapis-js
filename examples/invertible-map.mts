#!/usr/bin/env node

/**
 * Invertible Maps and Constructor-Time Fusion
 *
 * Demonstrates:
 * 1. Bijective map pairs (inverse) with identity elimination
 * 2. Map-map fusion: consecutive maps → single traversal with g ∘ f
 * 3. Map-fold fusion: map + fold → single fold with f pre-applied
 * 4. Combined: inverse elimination + map-map + map-fold all compose
 */

import { data } from '@lapis-lang/lapis-js';

const TempList = data(({ Family, T }) => ({
    Nil: {},
    Cons: { head: T, tail: Family(T) }
})).ops(({ fold, map, merge, Family, T }) => ({
    toFahrenheit: map({ out: Family(Number) })({
        T: (c: number) => c * 9 / 5 + 32
    }),
    toCelsius: map({ out: Family(Number), inverse: 'toFahrenheit' })({
        T: (f: number) => (f - 32) * 5 / 9
    }),
    double: map({ out: Family(Number) })({
        T: (x: number) => x * 2
    }),
    halve: map({ out: Family(Number), inverse: 'double' })({
        T: (x: number) => x / 2
    }),
    increment: map({ out: Family(Number) })({
        T: (x: number) => x + 1
    }),
    toArray: fold({ out: Array })({
        Nil() { return []; },
        Cons({ head, tail }) { return [head, ...tail]; }
    }),
    sum: fold({ out: Number })({
        Nil() { return 0; },
        Cons({ head, tail }) { return (head as number) + tail; }
    }),
    convertAndScale: merge('toFahrenheit', 'toCelsius', 'double'),
    roundTrip: merge('double', 'halve'),
    doubleThenInc: merge('double', 'increment'),
    doubledSum: merge('double', 'sum'),
    combined: merge('double', 'halve', 'increment', 'double', 'sum')
}));

const Temps = TempList({ T: Number });
const readings = Temps.Cons(0, Temps.Cons(20, Temps.Cons(37, Temps.Cons(100, Temps.Nil))));

console.log('=== Constructor-Time Fusion ===\n');
console.log('Original readings (°C):', readings.toArray);

console.log('\n--- Inverse Elimination (f° ∘ f = id) ---');
console.log('roundTrip (double → halve = id):', readings.roundTrip.toArray);
console.log('convertAndScale (toF → toC → double = double):', readings.convertAndScale.toArray);

console.log('\n--- Map-Map Fusion (g ∘ f in single pass) ---');
console.log('doubleThenInc (2x + 1):', readings.doubleThenInc.toArray);
console.log('  manual chain:        ', readings.double.increment.toArray);

console.log('\n--- Map-Fold Fusion (fold with f pre-applied) ---');
console.log('doubledSum (sum of 2x):', readings.doubledSum);
console.log('  manual chain:        ', readings.double.sum);

console.log('\n--- Combined (inverse + map-map + map-fold) ---');
console.log('combined (double → halve → increment → double → sum):');
console.log('  result:              ', readings.combined);
console.log('  manual chain:        ', readings.increment.double.sum);
