#!/usr/bin/env node

import { data } from '@lapis-lang/lapis-js';

// Pair ADT for Zip operation - commented out as not currently used
// const Pair = data(({ T, U }) => ({
//     MakePair: { first: T, second: U }
// }));

// Parameterized recursive list ADT with operations defined inline
const List = data(({ Family, T }) => ({
    Nil: {},
    Cons: { head: T, tail: Family(T) },
    sum: {
        op: 'fold',
        spec: { out: Number },
        Nil() { return 0; },
        Cons({ head, tail }) { return head + tail; }
    },
    length: {
        op: 'fold',
        spec: { out: Number },
        Nil() { return 0; },
        Cons({ tail }) { return 1 + tail; }
    },
    product: {
        op: 'fold',
        spec: { out: Number },
        Nil() { return 1; },
        Cons({ head, tail }) { return head * tail; }
    },
    show: {
        op: 'fold',
        spec: { out: String },
        Nil() { return '[]'; },
        Cons({ head, tail }) {
            if (tail === '[]') return `[${head}]`;
            return `[${head}, ${tail.slice(1, -1)}]`;
        }
    },
    increment: {
        op: 'map',
        spec: { out: Family },
        T: (x) => x + 1
    },
    double: {
        op: 'map',
        spec: { out: Family },
        T: (x) => x * 2
    },
    square: {
        op: 'map',
        spec: { out: Family },
        T: (x) => x * x
    },
    Range: {
        op: 'unfold',
        spec: { in: Number, out: Family },
        Nil: (n) => (n <= 0 ? {} : null),
        Cons: (n) => (n > 0 ? { head: n, tail: n - 1 } : null)
    },
    Factorial: {
        op: 'merge',
        operations: ['Range', 'product']
    },
    sumOfSquares: {
        op: 'merge',
        operations: ['square', 'sum']
    },
    Zip: {
        op: 'unfold',
        spec: { in: Object, out: Family },
        Nil: ({ xs, ys }) => (listIsEmpty(xs) || listIsEmpty(ys) ? {} : null),
        Cons: ({ xs, ys }) => {
            if (!listIsEmpty(xs) && !listIsEmpty(ys)) {
                const xHead = listHead(xs);
                const yHead = listHead(ys);
                const xTail = listTail(xs);
                const yTail = listTail(ys);
                // Note: This creates a generic pair object since Pair ADT is defined separately
                return {
                    head: { first: xHead, second: yHead },
                    tail: { xs: xTail, ys: yTail }
                };
            }
            return null;
        }
    }
}));

// Helper to get head of a list (needed for Zip)
const listHead = (list) => {
    if (list && typeof list.peek === 'function') {
        return list.peek();
    }
    // Direct field access for lists without peek
    return list && 'head' in list ? list.head : null;
};

// Helper to get tail of a list (needed for Zip)
const listTail = (list) => {
    if (list && typeof list.rest === 'function') {
        return list.rest();
    }
    // Direct field access for lists without rest
    return list && 'tail' in list ? list.tail : null;
};

// Helper to check if list is empty (needed for Zip)
const listIsEmpty = (list) => {
    if (list && typeof list.length === 'function') {
        return list.length() === 0;
    }
    // Check if it's Nil by checking for absence of head
    return !list || !('head' in list);
};

// Instantiate for numbers
const NumList = List(Number);

console.log('=== List ADT Example ===\n');

// Manual construction
console.log('Manual construction:');
const { Cons, Nil } = NumList;
const list1 = Cons({ head: 1, tail: Cons({ head: 2, tail: Cons({ head: 3, tail: Nil }) }) });
const list2 = Cons({ head: 5, tail: Cons({ head: 10, tail: Cons({ head: 15, tail: Nil }) }) });

console.log(`list1 = ${list1.show}`);
console.log(`list2 = ${list2.show}`);

// Operations
console.log('\nFold operations:');
console.log(`list1.sum = ${list1.sum}`);
console.log(`list1.length = ${list1.length}`);
console.log(`list1.product = ${list1.product}`);
console.log(`list2.sum = ${list2.sum}`);
console.log(`list2.length = ${list2.length}`);

// Map operations
console.log('\nMap operations:');
const incremented = list1.increment;
const doubled = list1.double;
const squared = list1.square;

console.log(`list1.increment = ${incremented.show}`);
console.log(`list1.double = ${doubled.show}`);
console.log(`list1.square = ${squared.show}`);

// Unfold operations
console.log('\nUnfold operations:');
const range5 = NumList.Range(5);
const range10 = NumList.Range(10);

console.log(`Range(5) = ${range5.show}`);
console.log(`Range(10) = ${range10.show}`);

// Merged operations (deforestation)
console.log('\nMerged operations (deforestation):');
console.log(`Factorial(5) = ${NumList.Factorial(5)}`);
console.log(`Factorial(10) = ${NumList.Factorial(10)}`);
console.log(`list1.sumOfSquares = ${list1.sumOfSquares}`);
console.log(`list2.sumOfSquares = ${list2.sumOfSquares}`);

// Zip operation
console.log('\nZip operation:');

// Create a Pair ADT instance for use in Zip
// const NumPair = Pair(Number, Number); // Commented out - not used in this example

// Create a list of objects (pairs) - Zip operation already defined in List base
// Note: In declarative form, we use the Zip operation that's already defined
// The show operation will need to handle pair objects appropriately
const PairListWithZip = List(Object);

const zipped = PairListWithZip.Zip({ xs: list1, ys: list2 });
// Note: show() for object lists will show the default representation
console.log(`Zip(${list1.show}, ${list2.show}) created (objects)`);
console.log('Zipped result:', zipped);

const list3 = Cons({ head: 100, tail: Cons({ head: 200, tail: Nil }) });
const zippedShort = PairListWithZip.Zip({ xs: list1, ys: list3 });
console.log(`Zip(${list1.show}, ${list3.show}) = shorter list`);
console.log('Zipped short result:', zippedShort);

// Type checking
console.log('\nType checking:');
console.log(`list1 instanceof List(Number): ${list1 instanceof NumList}`);
console.log(`Nil instanceof List(Number): ${Nil instanceof NumList}`);

// Field access
console.log('\nField access:');
console.log(`list1.head = ${list1.head}`);
console.log(`list1.tail = ${list1.tail.show}`);
console.log(`list1.tail.head = ${list1.tail.head}`);

// Stack safety
console.log('\nStack safety (large list):');
const largeRange = NumList.Range(1000);
console.log(`Range(1000).length = ${largeRange.length}`);
console.log(`Range(1000).sum = ${largeRange.sum}`);

// Using with strings
console.log('\n=== String List ===');
// Note: length and show operations already defined in base List
const StrList = List(String);
const { Cons: SCons, Nil: SNil } = StrList;
const words = SCons({ head: 'hello', tail: SCons({ head: 'world', tail: SNil }) });
console.log(`words = ${words.show}`);
console.log(`words.length = ${words.length}`);
