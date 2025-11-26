#!/usr/bin/env node

import { data } from '@lapis-lang/lapis-js';

// Pair ADT for Zip operation
const Pair = data(({ T, U }) => ({
    MakePair: { first: T, second: U }
}));

// Parameterized recursive list ADT
const List = data(({ Family, T }) => ({
    Nil: {},
    Cons: { head: T, tail: Family(T) }
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

// Instantiate for numbers and add operations
const NumList = List(Number)
.fold('sum', { out: Number }, {
    Nil() { return 0; },
    Cons({ head, tail }) { return head + tail; }
})
.fold('length', { out: Number }, {
    Nil() { return 0; },
    Cons({ tail }) { return 1 + tail; }
})
.fold('product', { out: Number }, {
    Nil() { return 1; },
    Cons({ head, tail }) { return head * tail; }
})
.fold('show', { out: String }, {
    Nil() { return '[]'; },
    Cons({ head, tail }) {
        if (tail === '[]') return `[${head}]`;
        return `[${head}, ${tail.slice(1, -1)}]`;
    }
})
.map('increment', {}, { T: (x) => x + 1 })
.map('double', {}, { T: (x) => x * 2 })
.map('square', {}, { T: (x) => x * x })
.unfold('Range', (List) => ({ in: Number, out: List }), {
    Nil: (n) => (n <= 0 ? {} : null),
    Cons: (n) => (n > 0 ? { head: n, tail: n - 1 } : null)
})
.merge('Factorial', ['Range', 'product'])
.merge('sumOfSquares', ['square', 'sum']);

console.log('=== List ADT Example ===\n');

// Manual construction
console.log('Manual construction:');
const { Cons, Nil } = NumList;
const list1 = Cons({ head: 1, tail: Cons({ head: 2, tail: Cons({ head: 3, tail: Nil }) }) });
const list2 = Cons({ head: 5, tail: Cons({ head: 10, tail: Cons({ head: 15, tail: Nil }) }) });

console.log(`list1 = ${list1.show()}`);
console.log(`list2 = ${list2.show()}`);

// Operations
console.log('\nFold operations:');
console.log(`list1.sum() = ${list1.sum()}`);
console.log(`list1.length() = ${list1.length()}`);
console.log(`list1.product() = ${list1.product()}`);
console.log(`list2.sum() = ${list2.sum()}`);
console.log(`list2.length() = ${list2.length()}`);

// Map operations
console.log('\nMap operations:');
const incremented = list1.increment();
const doubled = list1.double();
const squared = list1.square();

console.log(`list1.increment() = ${incremented.show()}`);
console.log(`list1.double() = ${doubled.show()}`);
console.log(`list1.square() = ${squared.show()}`);

// Unfold operations
console.log('\nUnfold operations:');
const range5 = NumList.Range(5);
const range10 = NumList.Range(10);

console.log(`Range(5) = ${range5.show()}`);
console.log(`Range(10) = ${range10.show()}`);

// Merged operations (deforestation)
console.log('\nMerged operations (deforestation):');
console.log(`Factorial(5) = ${NumList.Factorial(5)}`);
console.log(`Factorial(10) = ${NumList.Factorial(10)}`);
console.log(`list1.sumOfSquares() = ${list1.sumOfSquares()}`);
console.log(`list2.sumOfSquares() = ${list2.sumOfSquares()}`);

// Zip operation
console.log('\nZip operation:');

// Create a Pair ADT instance for use in Zip
const NumPair = Pair(Number, Number);

// Create a list of objects (pairs) - use Object as type parameter since pairs are objects
const PairListWithZip = List(Object)
.unfold('Zip', (PairList) => ({ in: Object, out: PairList }), {
    Nil: ({ xs, ys }) => (listIsEmpty(xs) || listIsEmpty(ys) ? {} : null),
    Cons: ({ xs, ys }) => {
        if (!listIsEmpty(xs) && !listIsEmpty(ys)) {
            const xHead = listHead(xs);
            const yHead = listHead(ys);
            const xTail = listTail(xs);
            const yTail = listTail(ys);
            return {
                head: NumPair.MakePair({ first: xHead, second: yHead }),
                tail: { xs: xTail, ys: yTail }
            };
        }
        return null;
    }
})
.fold('show', { out: String }, {
    Nil() { return '[]'; },
    Cons({ head, tail }) {
        const pairStr = `(${head.first}, ${head.second})`;
        if (tail === '[]') return `[${pairStr}]`;
        return `[${pairStr}, ${tail.slice(1, -1)}]`;
    }
});

const zipped = PairListWithZip.Zip({ xs: list1, ys: list2 });
console.log(`Zip(${list1.show()}, ${list2.show()}) = ${zipped.show()}`);

const list3 = Cons({ head: 100, tail: Cons({ head: 200, tail: Nil }) });
const zippedShort = PairListWithZip.Zip({ xs: list1, ys: list3 });
console.log(`Zip(${list1.show()}, ${list3.show()}) = ${zippedShort.show()} (stops at shorter list)`);

// Type checking
console.log('\nType checking:');
console.log(`list1 instanceof List(Number): ${list1 instanceof NumList}`);
console.log(`Nil instanceof List(Number): ${Nil instanceof NumList}`);

// Field access
console.log('\nField access:');
console.log(`list1.head = ${list1.head}`);
console.log(`list1.tail = ${list1.tail.show()}`);
console.log(`list1.tail.head = ${list1.tail.head}`);

// Stack safety
console.log('\nStack safety (large list):');
const largeRange = NumList.Range(1000);
console.log(`Range(1000).length() = ${largeRange.length()}`);
console.log(`Range(1000).sum() = ${largeRange.sum()}`);

// Using with strings
console.log('\n=== String List ===');
const StrList = List(String)
    .fold('length', { out: Number }, {
        Nil() { return 0; },
        Cons({ tail }) { return 1 + tail; }
    })
    .fold('show', { out: String }, {
        Nil() { return '[]'; },
        Cons({ head, tail }) {
            if (tail === '[]') return `["${head}"]`;
            const rest = tail.slice(1, -1);
            return rest ? `["${head}", ${rest}]` : `["${head}"]`;
        }
    });
const { Cons: SCons, Nil: SNil } = StrList;
const words = SCons({ head: 'hello', tail: SCons({ head: 'world', tail: SNil }) });
console.log(`words = ${words.show()}`);
console.log(`words.length() = ${words.length()}`);
