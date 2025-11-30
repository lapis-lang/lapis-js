/**
 * Codata Examples - Parametric Observers
 *
 * This file demonstrates parametric observers - observers that take input parameters.
 * These are powerful for creating flexible, reusable codata interfaces.
 */

import { codata } from '../src/index.mjs';

// =============================================================================
// Example 1: Stream with Random Access (nth)
// =============================================================================

const Stream = codata(({ Self, T }) => ({
    head: T,
    tail: Self(T),
    nth: { in: Number, out: T },           // Random access
    take: { in: Number, out: Array },       // Take first n elements
    drop: { in: Number, out: Self(T) }      // Skip first n elements
}));

const StreamNum = Stream(Number)
    .unfold('From', (Stream) => ({ in: Number, out: Stream }), {
        head: (n) => n,
        tail: (n) => n + 1,
        nth: (n) => (index) => n + index,
        take: (n) => (count) => {
            const result = [];
            for (let i = 0; i < count; i++) {
                result.push(n + i);
            }
            return result;
        },
        drop: (n) => (count) => n + count
    });

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

const Grid = codata(() => ({
    at: { in: { x: Number, y: Number }, out: Number },
    row: { in: Number, out: Array },
    col: { in: Number, out: Array }
}))
    .unfold('Create', (Grid) => ({ in: Function, out: Grid }), {
        at: (fn) => ({ x, y }) => fn(x, y),
        row: (fn) => (y) => {
            const result = [];
            for (let x = 0; x < 10; x++) {
                result.push(fn(x, y));
            }
            return result;
        },
        col: (fn) => (x) => {
            const result = [];
            for (let y = 0; y < 10; y++) {
                result.push(fn(x, y));
            }
            return result;
        }
    });

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

const Sequence = codata(({ Self }) => ({
    current: Number,
    next: Self,
    window: { in: Number, out: Array },
    skip: { in: Number, out: Self }
}))
    .unfold('From', (Sequence) => ({ in: Number, out: Sequence }), {
        current: (n) => n,
        next: (n) => n + 1,
        window: (n) => (size) => {
            const result = [];
            for (let i = 0; i < size; i++) {
                result.push(n + i);
            }
            return result;
        },
        skip: (n) => (count) => n + count
    });

console.log('\n=== Sequence with Window Operations ===');

const seq = Sequence.From(1);
console.log('seq.current:', seq.current);                  // 1
console.log('seq.window(3):', seq.window(3));              // [1, 2, 3]
console.log('seq.window(5):', seq.window(5));              // [1, 2, 3, 4, 5]
console.log('seq.next.window(4):', seq.next.window(4));    // [2, 3, 4, 5]
console.log('seq.skip(10).current:', seq.skip(10).current); // 11

// =============================================================================
// Example 4: Dictionary/Map as Codata
// =============================================================================

const Dictionary = codata(() => ({
    get: { in: String, out: String },
    has: { in: String, out: Boolean },
    keys: Array,
    size: Number
}))
    .unfold('Create', (Dictionary) => ({ in: Object, out: Dictionary }), {
        get: (obj) => (key) => obj[key] || 'undefined',
        has: (obj) => (key) => key in obj,
        keys: (obj) => Object.keys(obj),
        size: (obj) => Object.keys(obj).length
    });

console.log('\n=== Dictionary as Codata ===');

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

const TimeSeries = codata(({ Self }) => ({
    valueAt: { in: Number, out: Number },
    range: { in: { from: Number, to: Number, step: Number }, out: Array },
    derivative: Self
}))
    .unfold('Linear', (TimeSeries) => ({ in: { slope: Number, intercept: Number }, out: TimeSeries }), {
        valueAt: ({ slope, intercept }) => (t) => slope * t + intercept,
        range: ({ slope, intercept }) => ({ from, to, step }) => {
            const result = [];
            for (let t = from; t <= to; t += step) {
                result.push(slope * t + intercept);
            }
            return result;
        },
        derivative: ({ slope }) => ({ slope: 0, intercept: slope })
    })
    .unfold('Quadratic', (TimeSeries) => ({ in: { a: Number, b: Number, c: Number }, out: TimeSeries }), {
        valueAt: ({ a, b, c }) => (t) => a * t * t + b * t + c,
        range: ({ a, b, c }) => ({ from, to, step }) => {
            const result = [];
            for (let t = from; t <= to; t += step) {
                result.push(a * t * t + b * t + c);
            }
            return result;
        },
        derivative: ({ a, b }) => ({ slope: b, intercept: 2 * a })
    });

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
// Example 6: Graph as Codata
// =============================================================================

const Graph = codata(() => ({
    neighbors: { in: Number, out: Array },
    hasEdge: { in: { from: Number, to: Number }, out: Boolean },
    degree: { in: Number, out: Number }
}))
    .unfold('FromAdjacencyList', (Graph) => ({ in: Object, out: Graph }), {
        neighbors: (adj) => (node) => adj[node] || [],
        hasEdge: (adj) => ({ from, to }) => {
            const nodeNeighbors = adj[from] || [];
            return nodeNeighbors.includes(to);
        },
        degree: (adj) => (node) => (adj[node] || []).length
    });

console.log('\n=== Graph as Codata ===');

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

const MemoStream = codata(({ Self }) => ({
    head: Number,
    tail: Self,
    nth: { in: Number, out: Number }
}))
    .unfold('From', (MemoStream) => ({ in: Number, out: MemoStream }), {
        head: (n) => n,
        tail: (n) => n + 1,
        nth: (n) => {
            nthCallCount++;
            console.log(`  Creating nth function for seed ${n}`);
            return (index) => n + index;
        }
    });

const memoNums = MemoStream.From(0);

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
