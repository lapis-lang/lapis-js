/**
 * Shared prime-number utilities built entirely from BMF fold/unfold.
 * Imported by examples and tests.
 */

import { data, op, spec } from '../index.mjs';

// Odd trial-divisor list:
//   OddRange unfold  → generates [start, start+2, …, limit]
//   hasFactor fold   → true if any element divides n
//   firstFactor fold → smallest divisor found, or 0 if none
const Divisors = data(({ Family }) => ({
        Nil: {},
        Cons: { head: Number, tail: Family },
        hasFactor: {
            [op]: 'fold',
            [spec]: { in: Number, out: Boolean },
            Nil() { return false; },
            Cons({ head, tail }: { head: number; tail: (n: number) => boolean }, n: number) {
                return n % head === 0 || tail(n);
            }
        },
        firstFactor: {
            [op]: 'fold',
            [spec]: { in: Number, out: Number },
            Nil() { return 0; },
            Cons({ head, tail }: { head: number; tail: (n: number) => number }, n: number) {
                return n % head === 0 ? head : tail(n);
            }
        },
        OddRange: {
            [op]: 'unfold',
            [spec]: { in: { start: Number, limit: Number }, out: Family },
            Nil: ({ start, limit }: { start: number; limit: number }) =>
                start > limit ? {} : null,
            Cons: ({ start, limit }: { start: number; limit: number }) =>
                start <= limit ? { head: start, tail: { start: start + 2, limit } } : null
        }
    })),

    // Primality: fold over odd trial divisors
    isPrime = (n: number): boolean => {
        if (n < 2) return false;
        if (n % 2 === 0) return n === 2;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return !(Divisors as any).OddRange({ start: 3, limit: Math.floor(Math.sqrt(n)) }).hasFactor(n);
    },

    // Smallest factor ≥ 2 of n (returns 0 for primes / n < 2)
    smallestFactor = (n: number): number => {
        if (n < 2) return 0;
        if (n % 2 === 0) return 2;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (Divisors as any).OddRange({ start: 3, limit: Math.floor(Math.sqrt(n)) }).firstFactor(n);
    },

    // nthPrime search: anamorphism over { candidate, count }
    // Done fires when candidate is prime and the countdown reaches 0
    NthPrimeFinder = data(({ Family }) => ({
        Done: { value: Number },
        Step: { next: Family },
        result: {
            [op]: 'fold',
            out: Number,
            Done({ value }: { value: number }) { return value; },
            Step({ next }: { next: number }) { return next; }
        },
        Search: {
            [op]: 'unfold',
            [spec]: { in: { candidate: Number, count: Number }, out: Family },
            Done: ({ candidate, count }: { candidate: number; count: number }) =>
                isPrime(candidate) && count === 0 ? { value: candidate } : null,
            Step: ({ candidate, count }: { candidate: number; count: number }) => {
                const prime = isPrime(candidate),
                    next = candidate === 2 ? 3 : candidate + 2;
                if (!prime || count > 0)
                    return { next: { candidate: next, count: prime ? count - 1 : count } };
                return null;
            }
        }
    })),

    // Smallest prime strictly greater than n
    nextPrimeAfter = (n: number): number => {
        if (n < 2) return 2;
        if (n === 2) return 3;
        // Advance to next odd number > n before starting the search
        const start = n % 2 === 0 ? n + 1 : n + 2;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (NthPrimeFinder as any).Search({ candidate: start, count: 0 }).result;
    };

export { Divisors, isPrime, smallestFactor, NthPrimeFinder, nextPrimeAfter };
