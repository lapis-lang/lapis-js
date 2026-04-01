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

const TempList = data(family => ({
    Nil: {},
    Cons: { head: Number, tail: family }
})).ops(({ fold, map, merge, family }) => ({
    toFahrenheit: map({ out: family })({
        head: (c: number) => c * 9 / 5 + 32
    }),
    toCelsius: map({ out: family, inverse: 'toFahrenheit' })({
        head: (f: number) => (f - 32) * 5 / 9
    }),
    double: map({ out: family })({
        head: (x: number) => x * 2
    }),
    halve: map({ out: family, inverse: 'double' })({
        head: (x: number) => x / 2
    }),
    increment: map({ out: family })({
        head: (x: number) => x + 1
    }),
    toArray: fold({ out: Array })({
        Nil() { return []; },
        Cons({ head, tail }: any) { return [head, ...tail]; }
    }),
    sum: fold({ out: Number })({
        Nil() { return 0; },
        Cons({ head, tail }: any) { return (head as number) + tail; }
    }),
    convertAndScale: merge('toFahrenheit', 'toCelsius', 'double'),
    roundTrip: merge('double', 'halve'),
    doubleThenInc: merge('double', 'increment'),
    doubledSum: merge('double', 'sum'),
    combined: merge('double', 'halve', 'increment', 'double', 'sum')
}));

const Temps = TempList;
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
