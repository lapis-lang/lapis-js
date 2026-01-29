#!/usr/bin/env node

import { data } from '@lapis-lang/lapis-js';

// Recursive ADT for Peano natural numbers
const Peano = data(({ Family }) => ({
    Zero: {},
    Succ: { pred: Family },
    toValue: {
        op: 'fold',
        out: Number,
        Zero() { return 0; },
        Succ({ pred }) { return 1 + pred; }
    },
    add: {
        op: 'fold',
        out: Number,
        Zero() { return 0; },
        Succ({ pred }) { return 1 + pred; }
    },
    show: {
        op: 'fold',
        out: String,
        Zero() { return '0'; },
        Succ({ pred }) { return `S(${pred})`; }
    },
    FromValue: {
        op: 'unfold',
        spec: { in: Number },
        Zero: (n) => (n <= 0 ? {} : null),
        Succ: (n) => (n > 0 ? { pred: n - 1 } : null)
    }
}));

console.log('=== Peano ADT Example ===\n');

// Manual construction
console.log('Manual construction:');
const zero = Peano.Zero;
const one = Peano.Succ({ pred: zero });
const two = Peano.Succ({ pred: one });
const three = Peano.Succ({ pred: two });

console.log(`zero = ${zero.show} = ${zero.toValue}`);
console.log(`one = ${one.show} = ${one.toValue}`);
console.log(`two = ${two.show} = ${two.toValue}`);
console.log(`three = ${three.show} = ${three.toValue}`);

// Construction via unfold
console.log('\nConstruction via unfold:');
const five = Peano.FromValue(5);
const ten = Peano.FromValue(10);

console.log(`FromValue(5) = ${five.show} = ${five.toValue}`);
console.log(`FromValue(10) = ${ten.show} = ${ten.toValue}`);

// Arithmetic using add operation
console.log('\nAddition examples:');
console.log(`three.add = ${three.add}`);
console.log(`five.add = ${five.add}`);

console.log('\nType checking:');
console.log(`zero instanceof Peano: ${zero instanceof Peano}`);
console.log(`zero instanceof Peano.Zero: ${zero instanceof Peano.Zero.constructor}`);
console.log(`one instanceof Peano.Succ: ${one instanceof Peano.Succ}`);

console.log('\nRecursive structure:');
console.log(`three.pred = ${three.pred.show}`);
console.log(`three.pred.pred = ${three.pred.pred.show}`);
console.log(`three.pred.pred.pred = ${three.pred.pred.pred.show}`);
console.log(`three.pred.pred.pred === zero: ${three.pred.pred.pred === zero}`);

// Large number for stack safety demonstration
console.log('\nStack safety (large numbers):');
const large = Peano.FromValue(1000);
console.log(`FromValue(1000).toValue() = ${large.toValue}`);
