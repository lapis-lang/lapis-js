/**
 * Behavior Examples - Parametric Observers
 *
 * This file demonstrates parametric observers - observers that take input parameters.
 * These are powerful for creating flexible, reusable behavior interfaces.
 */

import { behavior, unfold } from '../src/index.mjs';

// =============================================================================
// Example 1: Stream with Random Access (nth)
// =============================================================================

const Stream = behavior(({ Self, T }) => ({
        head: T,
        tail: Self(T),
        nth: { in: Number, out: T },           // Random access
        take: { in: Number, out: Array },       // Take first n elements
        drop: { in: Number, out: Self(T) },      // Skip first n elements
        From: unfold({ in: Number, out: Self })({
            head: (n) => n,
            tail: (n) => n + 1,
            nth: (n) => (index) => n + index,
            take: (n) => (count) => Array.from({ length: count }, (_, i) => n + i),
            drop: (n) => (count) => n + count
        })
    })),

    StreamNum = Stream({ T: Number });

console.log('\n=== Stream with Parametric Observers ===');

const nums = StreamNum.From(0);

// nth - random access
console.log('nums.nth(0):', nums.nth(0));      // 0
console.log('nums.nth(5):', nums.nth(5));      // 5
console.log('nums.nth(100):', nums.nth(100));  // 100

// take - get first n elements
console.log('nums.take(5):', nums.take(5));    // [0, 1, 2, 3, 4]
console.log('nums.tail.take(3):', nums.tail.take(3)); // [1, 2, 3]

// drop - skip n elements (returns new stream)
const dropped = nums.drop(10);
console.log('nums.drop(10).head:', dropped.head);           // 10
console.log('nums.drop(10).take(3):', dropped.take(3));     // [10, 11, 12]

// =============================================================================
// Example 2: Infinite Grid/Matrix
// =============================================================================

const Grid = behavior(({ Self }) => ({
    at: { in: { x: Number, y: Number }, out: Number },
    row: { in: Number, out: Array },
    col: { in: Number, out: Array },
    Create: unfold({ in: Function, out: Self })({
        at: (fn) => ({ x, y }) => fn(x, y),
        row: (fn) => (y) => Array.from({ length: 10 }, (_, x) => fn(x, y)),
        col: (fn) => (x) => Array.from({ length: 10 }, (_, y) => fn(x, y))
    })
}));

console.log('\n=== Infinite Grid ===');

// Multiplication table
const multTable = Grid.Create((x, y) => x * y);
console.log('multTable.at({x:3, y:4}):', multTable.at({ x: 3, y: 4 })); // 12
console.log('multTable.at({x:7, y:8}):', multTable.at({ x: 7, y: 8 })); // 56
console.log('multTable.row(5):', multTable.row(5));  // Row of 5s table
console.log('multTable.col(3):', multTable.col(3));  // Column of 3s table

// Addition table
const addTable = Grid.Create((x, y) => x + y);
console.log('\naddTable.at({x:10, y:20}):', addTable.at({ x: 10, y: 20 })); // 30

// =============================================================================
// Example 3: Lazy Sequence with Window/Sliding Operations
// =============================================================================

const Sequence = behavior(({ Self }) => ({
    current: Number,
    next: Self,
    window: { in: Number, out: Array },
    skip: { in: Number, out: Self },
    From: unfold({ in: Number, out: Self })({
        current: (n) => n,
        next: (n) => n + 1,
        window: (n) => (size) => Array.from({ length: size }, (_, i) => n + i),
        skip: (n) => (count) => n + count
    })
}));

console.log('\n=== Sequence with Window Operations ===');

const seq = Sequence.From(1);
console.log('seq.current:', seq.current);                  // 1
console.log('seq.window(3):', seq.window(3));              // [1, 2, 3]
console.log('seq.window(5):', seq.window(5));              // [1, 2, 3, 4, 5]
console.log('seq.next.window(4):', seq.next.window(4));    // [2, 3, 4, 5]
console.log('seq.skip(10).current:', seq.skip(10).current); // 11

// =============================================================================
// Example 4: Dictionary/Map as Behavior
// =============================================================================

const Dictionary = behavior(({ Self }) => ({
    get: { in: String, out: String },
    has: { in: String, out: Boolean },
    keys: Array,
    size: Number,
    Create: unfold({ in: Object, out: Self })({
        get: (obj) => (key) => obj[key] || 'undefined',
        has: (obj) => (key) => key in obj,
        keys: (obj) => Object.keys(obj),
        size: (obj) => Object.keys(obj).length
    })
}));

console.log('\n=== Dictionary as Behavior ===');

const dict = Dictionary.Create({
    name: 'Alice',
    age: '30',
    city: 'New York'
});

console.log('dict.get("name"):', dict.get('name'));        // 'Alice'
console.log('dict.get("age"):', dict.get('age'));          // '30'
console.log('dict.has("city"):', dict.has('city'));        // true
console.log('dict.has("country"):', dict.has('country'));  // false
console.log('dict.keys:', dict.keys);                      // ['name', 'age', 'city']
console.log('dict.size:', dict.size);                      // 3

// =============================================================================
// Example 5: Time Series with Interpolation
// =============================================================================

const TimeSeries = behavior(({ Self }) => ({
    valueAt: { in: Number, out: Number },
    range: { in: { from: Number, to: Number, step: Number }, out: Array },
    derivative: Self,
    Linear: unfold({ in: { slope: Number, intercept: Number }, out: Self })({
        valueAt: ({ slope, intercept }) => (t) => slope * t + intercept,
        range: ({ slope, intercept }) => ({ from, to, step }) =>
            Array.from({ length: Math.ceil((to - from) / step) + 1 }, (_, i) => slope * (from + i * step) + intercept),
        derivative: ({ slope }) => ({ slope: 0, intercept: slope })
    }),
    Quadratic: unfold({ in: { a: Number, b: Number, c: Number }, out: Self })({
        valueAt: ({ a, b, c }) => (t) => a * t * t + b * t + c,
        range: ({ a, b, c }) => ({ from, to, step }) =>
            Array.from({ length: Math.ceil((to - from) / step) + 1 }, (_, i) => { const t = from + i * step; return a * t * t + b * t + c; }),
        derivative: ({ a, b }) => ({ slope: 2 * a, intercept: b })
    })
}));

console.log('\n=== Time Series with Interpolation ===');

// f(t) = 2t + 3
const linear = TimeSeries.Linear({ slope: 2, intercept: 3 });
console.log('linear.valueAt(0):', linear.valueAt(0));      // 3
console.log('linear.valueAt(5):', linear.valueAt(5));      // 13
console.log('linear.range({from:0, to:4, step:1}):',
    linear.range({ from: 0, to: 4, step: 1 }));            // [3, 5, 7, 9, 11]

// f(t) = t^2 + 2t + 1 = (t+1)^2
const quadratic = TimeSeries.Quadratic({ a: 1, b: 2, c: 1 });
console.log('\nquadratic.valueAt(0):', quadratic.valueAt(0));  // 1
console.log('quadratic.valueAt(2):', quadratic.valueAt(2));    // 9
console.log('quadratic.range({from:0, to:3, step:1}):',
    quadratic.range({ from: 0, to: 3, step: 1 }));             // [1, 4, 9, 16]

// =============================================================================
// Example 6: Graph as Behavior
// =============================================================================

const Graph = behavior(({ Self }) => ({
    neighbors: { in: Number, out: Array },
    hasEdge: { in: { from: Number, to: Number }, out: Boolean },
    degree: { in: Number, out: Number },
    FromAdjacencyList: unfold({ in: Object, out: Self })({
        neighbors: (adj) => (node) => adj[node] || [],
        hasEdge: (adj) => ({ from, to }) => {
            const nodeNeighbors = adj[from] || [];
            return nodeNeighbors.includes(to);
        },
        degree: (adj) => (node) => (adj[node] || []).length
    })
}));

console.log('\n=== Graph as Behavior ===');

const graph = Graph.FromAdjacencyList({
    1: [2, 3],
    2: [1, 3, 4],
    3: [1, 2],
    4: [2]
});

console.log('graph.neighbors(1):', graph.neighbors(1));    // [2, 3]
console.log('graph.neighbors(2):', graph.neighbors(2));    // [1, 3, 4]
console.log('graph.degree(2):', graph.degree(2));          // 3
console.log('graph.hasEdge({from:1, to:2}):', graph.hasEdge({ from: 1, to: 2 })); // true
console.log('graph.hasEdge({from:1, to:4}):', graph.hasEdge({ from: 1, to: 4 })); // false

// =============================================================================
// Example 7: Memoization Behavior
// =============================================================================

console.log('\n=== Parametric Observer Memoization ===');

let nthCallCount = 0;

const MemoStream = behavior(({ Self }) => ({
        head: Number,
        tail: Self,
        nth: { in: Number, out: Number },
        From: unfold({ in: Number, out: Self })({
            head: (n) => n,
            tail: (n) => n + 1,
            nth: (n) => {
                nthCallCount++;
                console.log(`  Creating nth function for seed ${n}`);
                return (index) => n + index;
            }
        })
    })),

    memoNums = MemoStream.From(0);

console.log('First access to nth:');
const nth1 = memoNums.nth;
console.log('Second access to nth (should be memoized):');
const nth2 = memoNums.nth;
console.log('nth1 === nth2:', nth1 === nth2);  // true (function is memoized)
console.log('nthCallCount:', nthCallCount);     // 1 (called only once)

console.log('\nCalling the memoized function with different args:');
console.log('nth1(5):', nth1(5));               // 5 (computes result)
console.log('nth1(10):', nth1(10));             // 10 (computes new result)
console.log('nth2(3):', nth2(3));               // 3 (uses same memoized function)

console.log('\n=== All examples completed ===\n');
