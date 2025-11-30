# Codata Design Document

**Project:** Lapis JS
**Feature:** Codata Support (Final Coalgebras)
**Status:** Design Phase
**Date:** November 27, 2025
**Authors:** mlhaufe, GitHub Copilot

---

## Table of Contents

1. [Overview](#overview)
2. [Theoretical Background](#theoretical-background)
3. [Current State: Data in Lapis JS](#current-state-data-in-lapis-js)
4. [Proposed Codata Syntax](#proposed-codata-syntax)
5. [Internal Representation](#internal-representation)
6. [Operations](#operations)
7. [Key Design Decisions](#key-design-decisions)
8. [Open Questions](#open-questions)
9. [Implementation Roadmap](#implementation-roadmap)
10. [References](#references)

---

## Overview

This document outlines the design for adding **codata** (final coalgebras) to Lapis JS. Codata is the categorical dual of data (initial algebras), enabling:

- **Observation-based programming** via destructors instead of constructors
- **Potentially infinite structures** (streams, event sources)
- **Lazy evaluation** and coinductive reasoning
- **Effect management** (IO, async operations, continuations)
- **Dual recursion schemes** (corecursion, fold/unfold)

### Goals

1. Maintain symmetry with existing `data()` API and semantics
2. Support both finite and infinite codata structures
3. Enable composition and deforestation (fusion) of observations
4. Provide foundation for explicit continuation management
5. Potentially subsume async/await, generators, and RxJS-style reactive programming

---

## Theoretical Background

### Data vs Codata

| Aspect | Data (Initial Algebras) | Codata (Final Coalgebras) |
|--------|------------------------|---------------------------|
| **Definition** | Defined by constructors | Defined by destructors (observers) |
| **Construction** | Builders (unfold/anamorphism) | Builders (unfold/anamorphism) |
| **Destruction** | Eliminators (fold/catamorphism) | Eliminators (fold/catamorphism) |
| **Recursion** | Recursion (structural, terminates) | Corecursion (productive, potentially infinite) |
| **Structure** | Finite, inductive | Potentially infinite, coinductive |
| **Evaluation** | Eager (constructed fully) | Lazy (observed on-demand) |
| **Example** | Lists, trees, Peano numbers | Streams, infinite sequences, IO actions |

### Duality Table

| Data Operation | Codata Operation | Description |
|---------------|------------------|-------------|
| Constructor | Observer/Destructor | Build vs. Observe |
| `unfold` (anamorphism) | `unfold` (anamorphism) | Construct structure from seed |
| `fold` (catamorphism) | `fold` (catamorphism) | Destruct/consume structure |
| `map` | `map` | Transform type parameters |
| `merge` (deforestation) | `merge` | Compose operations |
| `Family` | `Self` | Recursive self-reference |

---

## Current State: Data in Lapis JS

### Data Declaration

```javascript
const Peano = data(({ Family }) => ({
  Zero: {},
  Succ: { pred: Family }
}))
.fold('isEven', { out: Boolean }, {
  Zero() { return true; },
  Succ({ pred }) { return !pred; }
})
.unfold('FromValue', (Peano) => ({ in: Number, out: Peano }), {
  Zero: (n) => (n <= 0 ? {} : null),
  Succ: (n) => (n > 0 ? { pred: n - 1 } : null)
});
```

### Internal Architecture

**Key Components:**

- `Transformer` class: Abstract representation of operations (fold/unfold/map/merge)
- WeakMap registry: Stores transformers per ADT, supports inheritance
- Prototype-based operations: Instance methods (fold/map) and static methods (unfold)
- Stack-safe fold: Iterative post-order traversal with memoization
- Fluent API: Chainable `.fold().unfold().map().merge()`

**Type System:**

- `Family`: Recursive self-reference marker (e.g., `tail: Family`)
- Type parameters: `T`, `U` extracted from callback destructuring
- Runtime validation: Guards checked at construction time

---

## Proposed Codata Syntax

### Simple Stream Example

```javascript
const Stream = codata(({ Self, T }) => ({
  head: T,           // Observer: returns current value
  tail: Self(T)      // Continuation: returns next stream
}))
.unfold('From', (Stream) => ({ in: Number, out: Stream(Number) }), {
  head: (n) => n,
  tail: (n) => n + 1  // Seed for next stream
})
.fold('take', { in: Number, out: Array }, {
  Done: (self, n) => n <= 0,
  Step: (self, n) => ({
    emit: self.head,
    nextState: n - 1,
    nextSelf: self.tail
  })
})
.map('double', {}, { T: (x) => x * 2 });

// Usage
const nums = Stream.From(0);  // 0, 1, 2, 3, ...
console.log(nums.head);        // 0
console.log(nums.tail.head);   // 1
console.log(nums.take(5));     // [0, 1, 2, 3, 4]
```

### Event Source Example

```javascript
const Events = codata(({ Self }) => ({
  on: { in: Function, out: CancelToken },     // Observer with input
  off: { in: CancelToken, out: Unit }         // Cleanup observer
}))
.unfold('Create', (Events) => ({ out: Events }), {
  on: () => (callback) => {
    const listeners = [];
    listeners.push(callback);
    return { id: Symbol(), cancel: () => { /* remove listener */ } };
  },
  off: () => (token) => { /* cleanup */ }
});
```

### Console/IO Example

```javascript
const Console = codata({
  log: { in: String, out: Unit },
  read: { out: Promise(String) }   // Async observer
})
.unfold('Create', (Console) => ({ out: Console }), {
  log: () => (msg) => { console.log(msg); },
  read: () => () => new Promise((resolve) => { /* ... */ })
});

// Usage
const io = Console.Create();
io.log("Hello");
const input = await io.read();
```

### Finite Codata Example

```javascript
const Point = codata({
  x: Number,
  y: Number,
  distanceFrom: { in: Point, out: Number }
})
.unfold('Create', (Point) => ({ in: { x: Number, y: Number }, out: Point }),
  {
    x: ({ x, y }) => x,
    y: ({ x, y }) => y,
    distanceFrom: ({ x, y }) => (other) => Math.sqrt((x - other.x)**2 + (y - other.y)**2)
  }
);
```

---

## Internal Representation

### Observer Abstraction

Analogous to the existing `Transformer` abstraction for data operations, observers are created using factory functions rather than classes:

```javascript
// Observer objects created by factory function
const observer = createObserver({
  name: 'take',                              // Observer name
  type: 'fold',                              // 'unfold' | 'fold' | 'map' | 'merge'
  inSpec: Number,                            // Input type (for parametric observers)
  outSpec: Array,                            // Output type
  cases: {                                   // For fold: { Done, Step } cases
    Done: (self, n) => n <= 0,
    Step: (self, n) => ({ emit: self.head, nextState: n - 1, nextSelf: self.tail })
  }
});

// Composition functions for fusion
composeObservers(observer1, observer2);           // Compose two observers
composeMultipleObservers([obs1, obs2, obs3], 'merged');  // Compose multiple observers
```

### Codata Registry

Similar to data's transformer registry:

```javascript
// WeakMap: Codata -> Map<string, Observer>
const codataObservers = new WeakMap();

// Store observers per codata type
codataObservers.set(StreamCodata, new Map([
  ['head', headObserver],
  ['tail', tailObserver],
  ['take', takeObserver]
]));
```

### Codata Instance Structure

```javascript
// Internal representation of a codata instance
{
  [CodataSymbol]: true,              // Marker for instanceof checks
  [StateSymbol]: {                   // Internal state (WeakMap or closure)
    seed: any,                       // Original seed value
    memo: Map<string, any>           // Cached observations
  },
  [ObserverMapSymbol]: Map           // Reference to observer definitions
}
```

**Key differences from data:**

- Data instances are **frozen** (immutable)
- Codata instances may need **mutable state** for lazy evaluation and memoization
- Data constructors are **called once** to create structure
- Codata observers may be **called multiple times** with different inputs

---

## Operations

### 1. Unfold (Anamorphism/Constructor)

**Purpose:** Construct codata instances from seed values by defining how each observer behaves given the seed.

**Signature:**

```javascript
.unfold(name, spec, observers)
```

**Parameters:**

- `name`: PascalCase static method name
- `spec`: `(Codata) => ({ in?: InputType, out: Codata })`
- `observers`: Object mapping observer names to functions `(seed) => value` or `(seed) => (param) => value`
  - For simple observers (`head: T`): `(seed) => value`
  - For parametric observers (`nth: { in: Number, out: T }`): `(seed) => (param) => value`
  - For continuations (`tail: Self(T)`): `(seed) => nextSeed`

**Example:**

```javascript
const Stream = codata(({ Self, T }) => ({
  head: T,
  tail: Self(T)
}))
.unfold('From', (Stream) => ({ in: Number, out: Stream(Number) }), {
  head: (n) => n,           // Simple observer
  tail: (n) => n + 1        // Continuation seed
});
```

**Implementation Notes:**

- Should be **stack-safe** for infinite structures
- Use lazy evaluation with Proxy for `Self` references
- `Self` references store seeds and create instances on-demand
- Memoize continuation instances to avoid redundant computation

### 2. Fold (Catamorphism/Destructor)

**Purpose:** Consume/observe codata instances to build finite data structures using case-based pattern matching.

**Signature:**

```javascript
.fold(name, spec, cases)
```

**Parameters:**

- `name`: camelCase instance method name
- `spec`: `{ in?: InputType, out: OutputType }`
- `cases`: Object with two cases:
  - `Done: (self, ...params) => Boolean` - Termination condition
  - `Step: (self, ...params) => { emit, nextState, nextSelf }` - Observation step
    - `emit`: Value to emit for this step
    - `nextState`: Updated state parameter(s) for next iteration
    - `nextSelf`: Next codata instance to observe

**Example (Array):**

```javascript
Stream.fold('take', { in: Number, out: Array }, {
  Done: (self, n) => n <= 0,
  Step: (self, n) => ({
    emit: self.head,
    nextState: n - 1,
    nextSelf: self.tail
  })
});
```

**Example (Data List):**

```javascript
// Assuming List data type with .append() operation:
const List = data(({ Family, T }) => ({
  Nil: {},
  Cons: { head: T, tail: Family(T) }
}))
.fold('append', { in: T, out: List(T) }, ({ Cons, Nil }) => ({
  Nil: (val) => Cons({ head: val, tail: Nil }),
  Cons: ({ head, tail }, val) => Cons({ head, tail: tail.append(val) })
}))

Stream.fold('toList', { in: Number, out: List }, {
  Done: (self, n) => n <= 0,
  Step: (self, n) => ({
    emit: self.head,
    nextState: n - 1,
    nextSelf: self.tail
  })
});

// Usage:
console.log(nums.toList(5));  // Cons(0, Cons(1, Cons(2, Cons(3, Cons(4, Nil)))))
```

**Example (Binary Tree):**

```javascript
Stream.fold('toTree', { in: Number, out: Tree }, {
  Done: (self, depth) => depth <= 0,
  Step: (self, depth) => ({
    emit: self.head,
    nextState: depth - 1,
    nextSelf: self.tail
  })
});

// Note: For complex accumulation like tree building,
// use composition with a separate builder operation or
// collect to array first then transform
```

**Implementation Notes:**

- Installed as **instance methods** on codata prototype
- Cases use pattern matching on observation state:
  - `Done`: Predicate determining when to stop (termination condition)
  - `Step`: Produces emission value, next state, and next codata instance
- Framework internally handles accumulation based on `spec.out`:
  - `Array`: collects emitted values into array
  - `Number`: sums emitted values (or other reduction based on type)
  - Data types: constructs using emitted values
- Implementation uses trampolining/iteration for stack safety
- Declarative case-based pattern mirrors data fold's pattern matching
- For complex transformations, compose with separate operations
- This is **not corecursion** - it's bounded iteration consuming codata to produce finite data
- This is a true coalgebraic catamorphism: `fold α x = α(F(fold α)(out x))`

### 3. Map (Type Parameter Transformation)

**Purpose:** Transform type parameters while preserving codata structure (same as data `map`, but lazy).

**Signature:**

```javascript
.map(name, spec, transforms)
```

**Parameters:**

- `name`: camelCase instance method name
- `spec`: `{ out: (T) => Codata }` or `(Self) => ({ out: Self })`
- `transforms`: `{ T: (value) => transformedValue }`

**Example:**

```javascript
const Stream = codata(({ Self, T }) => ({
  head: T,
  tail: Self(T)
}))
.unfold('From', (Stream) => ({ in: Number, out: Stream(Number) }), {
  head: (n) => n,
  tail: (n) => n + 1
})
.map('map', {}, { T: (x, f) => f(x) });

// Usage
const nums = Stream.From(0);
const doubled = nums.map(x => x * 2);
console.log(doubled.take(5));  // [0, 2, 4, 6, 8]
```

**Implementation Notes:**

- Creates new codata instance with transformed observers
- Lazy: transformations applied on-demand during observation
- Preserves structure and continuation relationships

### 4. Merge (Deforestation/Fusion)

**Purpose:** Compose fold+map+unfold operations without intermediate allocations (same as data `merge`).

**Signature:**

```javascript
.merge(name, operationNames)
```

**Parameters:**

- `name`: Operation name (PascalCase if includes unfold, camelCase otherwise)
- `operationNames`: Array of operation names to compose (left-to-right)

**Composition Rules:**

- Maximum 1 unfold operation (constructor)
- Maximum 1 fold operation (destructor)
- Any number of map operations
- Order: `unfold` → `map`* → `fold`

**Example:**

```javascript
const Stream = codata(({ Self }) => ({
  head: Number,
  tail: Self
}))
.unfold('From', (Stream) => ({ in: Number, out: Stream(Number) }), {
  head: (n) => n,
  tail: (n) => n + 1
})
.map('double', {}, { T: (x) => x * 2 })
.fold('sum', { in: Number, out: Number }, {
  Done: (self, count) => count <= 0,
  Step: (self, count) => ({
    emit: self.head,
    nextState: count - 1,
    nextSelf: self.tail
  })
})
.merge('SumOfDoubles', ['From', 'double', 'sum']);

// Usage - no intermediate stream created
console.log(Stream.SumOfDoubles(0)(10));  // Sum of 0,2,4,6,...,18 = 90
```

---

## Key Design Decisions

### 1. Laziness Strategy

**Options:**

**A. Thunks (function closures):**

```javascript
{
  head: () => computeHead(),
  tail: () => computeTail()
}
```

- ✅ Simple, composable
- ✅ Works with existing JS
- ❌ Requires explicit `()` calls
- ❌ No built-in memoization

**B. Proxy-based lazy evaluation**

```javascript
new Proxy(seed, {
  get(target, prop) {
    if (!memo.has(prop)) {
      memo.set(prop, computeObserver(prop, target));
    }
    return memo.get(prop);
  }
})
```

- ✅ Transparent (no `()` needed)
- ✅ Automatic memoization
- ✅ Clean syntax: `stream.head` not `stream.head()`
- ❌ More complex implementation
- ❌ Proxy overhead

**C. Generator-based (for continuations only)**

```javascript
function* streamGen(n) {
  while (true) {
    yield n++;
  }
}
```

- ✅ Natural for infinite sequences
- ✅ Built-in iteration protocol
- ❌ Limited to linear continuations
- ❌ Doesn't fit all codata patterns (e.g., events, IO)

**Recommendation:** **Proxy-based (Option B)** for transparent lazy evaluation with automatic memoization. This provides the cleanest user experience while maintaining performance.

### 2. State Management

**Options:**

**A. WeakMap per instance**

```javascript
const codataStates = new WeakMap();
codataStates.set(instance, { seed, memo: new Map() });
```

- ✅ No memory leaks (GC-friendly)
- ✅ Private state (not accessible from outside)
- ✅ Consistent with fold memoization pattern
- ❌ Additional lookups

**B. Closure-captured state**

```javascript
const instance = ((seed) => {
  const memo = new Map();
  return { /* observers access memo via closure */ };
})(initialSeed);
```

- ✅ Fast access (no WeakMap lookup)
- ✅ Natural scoping
- ❌ Memory not released until instance GC'd
- ❌ Harder to introspect/debug

**C. Explicit state parameter**

```javascript
codata({ state: State }) => ({
  observer: { in: Input, state: State, out: Output }
})
```

- ✅ Explicit, functional
- ✅ Easier to reason about
- ❌ Breaks symmetry with data
- ❌ User-facing complexity

**Recommendation:** **WeakMap (Option A)** for consistency with existing fold memoization, GC-friendliness, and encapsulation. State is an implementation detail users shouldn't manage.

### 3. Self Reference Semantics

**Question:** How should `Self(T)` continuations be evaluated?

**Options:**

**A. Lazy by default (seed-based)**

```javascript
// tail: Self(T) stores seed, evaluated on access
const stream = Stream.From(0);
stream.tail;  // Creates new stream with seed=1 on access
```

- ✅ Infinite structures work naturally
- ✅ Memory efficient (don't force entire structure)
- ✅ Consistent with codata philosophy
- ❌ May re-evaluate on each access (need memoization)

**B. Eager evaluation (create instance)**

```javascript
// tail: Self(T) immediately creates next instance
const stream = Stream.From(0);
// stream.tail is already a full instance
```

- ✅ Simple semantics
- ❌ Breaks for infinite structures
- ❌ Memory explosion
- ❌ Not suitable for effects

**Recommendation:** **Lazy (Option A)** with memoization. On first access to a `Self` field, compute and cache the instance. Subsequent accesses return cached instance.

### 4. Observer Definition Syntax

**Question:** How to distinguish simple observers from parametric observers?

**Current proposal:**

```javascript
codata({
  head: T,                          // Simple observer: () => T
  tail: Self(T),                    // Continuation: () => Self(T)
  nth: { in: Number, out: T },      // Parametric: (n: Number) => T
  distanceFrom: { in: Point, out: Number }
})
```

**Alternative:**

```javascript
codata({
  head: () => T,                    // Explicit function syntax
  tail: () => Self(T),
  nth: (n: Number) => T,
  distanceFrom: (p: Point) => Number
})
```

**Recommendation:** **Current proposal** - mirrors data field syntax (`field: Type` vs `field: { properties }`). Maintains consistency with existing API.

### 5. Async Observations

**Question:** How to represent async/effectful observers?

**Options:**

**A. Promise-based (built-in)**

```javascript
codata({
  read: Promise(String)  // Implicitly async
})
```

- ✅ Clean syntax
- ✅ Native JavaScript async
- ❌ `Promise` name collision with native
- ❌ Mixes sync/async semantics

**B. Explicit Effect type**

```javascript
codata({
  read: Effect(String)  // Generic effect wrapper
})
```

- ✅ No name collision
- ✅ Can subsume different effect types
- ❌ Need to define Effect abstraction
- ❌ More complex

**C. Just use function return type**

```javascript
codata({
  read: { out: Function }  // Returns () => Promise<String>
})
```

- ✅ Simple, no special handling
- ✅ Maximum flexibility
- ❌ Less type safety
- ❌ Unclear semantics

**Recommendation:** **Defer to later iteration**. Start with synchronous observers only. Add `Effect` or `Promise` wrapper in future iteration once core codata mechanics are proven.

### 6. Codata Extension

**Question:** Should codata support `.extend()` like data?

**Proposal:**

```javascript
const BasicStream = codata(({ Self, T }) => ({
  head: T,
  tail: Self(T)
}));

const ExtendedStream = BasicStream.extend(({ Self, T }) => ({
  peek: { in: Number, out: Array }  // New observer
}))
.unfold('peek', { in: Number, out: Array }, function(self, n) {
  // Implementation
});
```

**Considerations:**

- Should extended codata inherit fold operations from parent?
- Can observers be overridden (with access to parent observer)?
- How do `Self` references work in extended codata?

**Recommendation:** **Yes, support extension** mirroring data's `.extend()`. Inherited observers work on extended codata instances. New observers can be added. Override mechanism similar to fold parent access.

### 7. Case-Based Fold Syntax

**Question:** Should `fold` (catamorphism) use imperative loops or declarative case-based pattern matching?

**Decision:** **Case-based pattern matching** to maintain symmetry with data fold operations.

**Rationale:**

- Data fold uses case-based destructuring (one case per constructor)
- Codata fold should mirror this with case-based observation (Done/Step cases)
- Declarative approach: describe **what** to observe, not **how** to iterate
- Framework handles iteration and stack safety
- Enables elegant composition and fusion

**Structure:**

```javascript
.fold(name, spec, {
  Done: (self, ...params) => Boolean,     // When to stop
  Step: (self, ...params) => { emit, nextState, nextSelf }  // What to observe and next state
})
```

- `Done`: Termination predicate (when to stop consuming)
- `Step`: Observation step producing:
  - `emit`: Value emitted for this step
  - `nextState`: Updated state parameter(s) for next iteration
  - `nextSelf`: Next codata instance to observe
- Framework handles accumulation internally based on output type
- This matches the coalgebraic catamorphism: `fold α x = α(F(fold α)(out x))`

---

## Open Questions

### 1. **Naming Conventions**

- Should we use `codata()` or `codata()` to distinguish from `data()`?
  - Current: `codata()`
  - Alternative: `Codata()` (capitalized)
  - Rationale: Lowercase maintains symmetry with `data()`

- Operation names: `unfold`/`fold`/`map`/`merge`
  - `unfold` ↔ anamorphism (constructs codata from seed, same as data unfold) ✓
  - `fold` ↔ catamorphism (destructs/observes codata to produce data, same as data fold) ✓
  - `map` ↔ transforms type parameters (same as data map, but lazy evaluation) ✓
  - `merge` ↔ operation composition/deforestation (same as data merge) ✓

### 2. **Infinite Structure Limits**

How to prevent accidental infinite loops when working with codata?

```javascript
// Dangerous: infinite loop if not careful
const ones = Stream.Constant(1);
const allOnes = ones.toArray();  // 💥 Never terminates!
```

**Decision:** Provide safe iteration primitives that require explicit bounds.

**Rationale:**

- Codata structures are potentially infinite by design
- Framework cannot know termination conditions in general
- User must provide termination logic (e.g., `take(n)`, `takeWhile(predicate)`)
- Runtime limits/timeouts would be arbitrary and hide the real issue

**Safe iteration primitives:**

- `take(n)`: Consume at most n elements
- `takeWhile(predicate)`: Consume while predicate holds
- `zipWith(other)`: Terminate when either stream ends
- `scan(fn, init)`: Accumulate with explicit state
- All fold operations require termination condition (`Done` case)

**Documentation requirements:**

- Clear examples showing bounded consumption
- Warnings about infinite structures in API docs
- Best practices guide for codata consumption
- Type signatures that make bounds explicit (e.g., `{ in: Number, out: Array }` for `take`)

### 3. **Memoization Granularity**

Should observations be memoized?

```javascript
const stream = Stream.From(0);
stream.head;  // Compute
stream.head;  // Return cached? Or recompute?
```

**Decision:** Memoize continuations (`Self` references) only. Simple field observers should be pure and cheap to recompute.

**Rationale:**

- **Continuations (`Self` refs)**: Memoize to avoid recreating codata instances
  - Accessing `stream.tail` multiple times should return same instance
  - Prevents redundant computation and maintains referential transparency
  - Essential for performance with deep continuation chains
- **Simple observers**: Do not memoize (recompute on each access)
  - Pure field observers (e.g., `head: T`) should be cheap to recompute
  - Avoids memory overhead for values that are inexpensive to calculate
  - Maintains simplicity: no cache invalidation concerns
- **Parametric observers**: Do not memoize
  - Functions like `nth: { in: Number, out: T }` may be called with different arguments
  - Memoizing would require argument-based cache keys (added complexity)
  - Should be implemented efficiently by users if needed

**Implementation:**

- WeakMap stores memoized `Self` references per instance
- Simple field access triggers recomputation each time
- Proxy `get` handler checks if property is a continuation before memoizing

### 4. **Relationship to Existing JavaScript Abstractions**

Can/should codata subsume:

- **Iterators/Generators**: Codata with `next: { out: { value: T, done: Boolean } }` as a natural representation of iteration protocol?
- **Async iterators**: Codata with async observers for asynchronous iteration?
- **RxJS Observables**: Event streams as codata with subscription/observation patterns?
- **Promises**: Single-value async codata for future computations?
- **Continuations**: First-class control flow via codata observers?
- **Thunks**: Lazy computation via codata lazy evaluation?

**Analysis:**

#### Iterators/Generators

Generators in JavaScript provide:

```javascript
function* counter(start) {
  let n = start;
  while (true) yield n++;
}

const gen = counter(0);
gen.next(); // { value: 0, done: false }
gen.next(); // { value: 1, done: false }
```

This is isomorphic to codata streams:

```javascript
const Stream = codata(({ Self, T }) => ({
  head: T,
  tail: Self(T)
}))
.unfold('From', (Stream) => ({ in: Number, out: Stream(Number) }), {
  head: (n) => n,
  tail: (n) => n + 1
});

const stream = Stream.From(0);
stream.head;      // 0
stream.tail.head; // 1
```

**Codata advantages:**

- Composition: map/unfold/merge compose elegantly
- Multiple observations: Can define many observers, not just `next()`
- Type safety: Runtime validation of observer signatures
- Deforestation: Fusion eliminates intermediate allocations
- Bidirectional: Can both construct (fold) and destruct (unfold) uniformly

**Relationship:** Isomorphic - generators are a special case of codata with single observer `next`

#### Async Iterators

Async iterators provide asynchronous iteration:

```javascript
async function* asyncCounter(start) {
  let n = start;
  while (true) {
    await delay(100);
    yield n++;
  }
}

const asyncGen = asyncCounter(0);
await asyncGen.next(); // { value: 0, done: false }
```

Codata representation (deferred to Phase 6):

```javascript
const AsyncStream = codata(({ Self, T }) => ({
  head: Promise(T),           // Async observer
  tail: Promise(Self(T))      // Async continuation
}))
.unfold('From', (AsyncStream) => ({ in: Number, out: AsyncStream(Number) }), {
  head: (n) => Promise.resolve(n),
  tail: (n) => Promise.resolve(n + 1)
});

const stream = AsyncStream.From(0);
await stream.head;       // 0
await stream.tail.head;  // 1
```

**Codata advantages:**

- Same compositional benefits as sync streams
- Can mix sync and async observers in same codata type
- More flexible than async iterator protocol (multiple async observers)

**Relationship:** Subsumes - async iterators are codata with async observers

**Challenge:** Requires Effect/Promise support (Phase 6)

#### RxJS Observables

Observables provide push-based reactive streams:

```javascript
const observable = new Observable(subscriber => {
  let n = 0;
  const interval = setInterval(() => {
    subscriber.next(n++);
  }, 100);
  return () => clearInterval(interval);
});

const subscription = observable.subscribe(x => console.log(x));
subscription.unsubscribe();
```

Codata representation:

```javascript
const EventStream = codata(({ Self, T }) => ({
  subscribe: { in: Function, out: Subscription },  // Observer with callback
  unsubscribe: { in: Subscription, out: Unit }
}))
.unfold('Timer', (EventStream) => ({ in: Number, out: EventStream(Number) }), {
  subscribe: (interval) => (callback) => {
    let n = 0;
    const id = setInterval(() => callback(n++), interval);
    return { id, cancel: () => clearInterval(id) };
  },
  unsubscribe: () => (sub) => sub.cancel()
});

const stream = EventStream.Timer(100);
const sub = stream.subscribe(x => console.log(x));
stream.unsubscribe(sub);
```

**Codata advantages:**

- Explicit subscription management (not hidden in protocol)
- Can define multiple observers beyond subscribe/unsubscribe
- Type-safe subscription tokens
- Can compose with other codata operations

**Relationship:** Subsumes - Observables are codata with subscription-based observers

**Difference:** RxJS has extensive operator library (map, filter, merge, etc.) - codata would need similar but compositional operators

#### Promises

Promises represent single async values:

```javascript
const promise = new Promise((resolve, reject) => {
  setTimeout(() => resolve(42), 100);
});

promise.then(x => console.log(x));
```

Codata representation (deferred to Phase 6):

```javascript
const Future = codata(({ T }) => ({
  then: { in: Function, out: Future },      // Chain computations
  catch: { in: Function, out: Future },     // Handle errors
  value: Promise(T)                          // Observe value
}))
.unfold('Of', (Future) => ({ in: T, out: Future(T) }), {
  then: (val) => (fn) => fn(val),
  catch: (val) => (fn) => val,  // No error, skip
  value: (val) => Promise.resolve(val)
});

const future = Future.Of(42);
await future.value;  // 42
```

**Codata advantages:**

- Can add more observers beyond then/catch (e.g., timeout, race)
- Composable with other codata types
- Could avoid Promise's eager execution (true lazy futures)

**Relationship:** Subsumes - Promises are single-value codata with async observer

**Challenge:** Promises are eager (execute immediately), codata is lazy. Would need explicit force/evaluation.

#### Continuations

Continuations represent "the rest of the computation":

```javascript
// CPS (Continuation Passing Style)
function add_cps(x, y, k) {
  k(x + y);
}

add_cps(2, 3, result => console.log(result)); // 5
```

Codata representation:

```javascript
const Cont = codata(({ T, R }) => ({
  run: { in: Function, out: R }  // Run continuation with callback
}))
.unfold('Of', (Cont) => ({ in: T, out: Cont(T, R) }), {
  run: (value) => (callback) => callback(value)
});

const cont = Cont.Of(5);
cont.run(x => console.log(x));  // 5
```

**Codata advantages:**

- First-class continuations as values
- Can compose continuations via map/merge
- Type-safe continuation context

**Relationship:** Orthogonal but complementary

- Codata observers ARE continuations (each observer is "what to do next")
- `Self` continuations represent infinite continuation chains
- Codata doesn't replace continuations, it provides a structured way to work with them

**Key insight:** Codata's lazy `Self` references are a form of continuation - they represent "the rest of the codata structure"

#### Thunks

Thunks represent suspended computations:

```javascript
const thunk = () => expensiveComputation();
const result = thunk();  // Execute when needed
```

Codata representation:

```javascript
const Thunk = codata(({ T }) => ({
  force: T  // Observe forces evaluation
}))
.unfold('Delay', (Thunk) => ({ in: Function, out: Thunk(T) }), {
  force: (computation) => computation()
});

const thunk = Thunk.Delay(() => expensiveComputation());
thunk.force;  // Executes and returns result
```

**Codata advantages:**

- Automatic memoization (via Proxy memo)
- Can add more observers (e.g., peek without forcing)
- Type-safe delayed computation

**Relationship:** Orthogonal but foundational

- Codata's lazy evaluation mechanism IS based on thunks
- Every codata observer is essentially a thunk (suspended computation)
- Thunks are the implementation mechanism, codata is the abstraction

**Key insight:** Codata observers are structured thunks with type safety and composition

---

**Summary Table:**

| Abstraction | Relationship | Codata Subsumes? | Notes |
|-------------|--------------|------------------|-------|
| Generators | Isomorphic | Yes | Generators are single-observer codata |
| Async Iterators | Subsumes | Yes | Requires async observer support (Phase 6) |
| RxJS Observables | Subsumes | Yes | Subscription pattern maps to observers |
| Promises | Subsumes | Partial | Single-value async codata; need lazy variant |
| Continuations | Complementary | No | Codata observers ARE continuations |
| Thunks | Foundational | No | Thunks are codata's implementation mechanism |

**Interop Strategy:**

Phase 6 should provide adapters:

- `.toIterator()` / `.fromIterator()` - Sync generators
- `.toAsyncIterator()` / `.fromAsyncIterator()` - Async generators
- `.toObservable()` / `.fromObservable()` - RxJS integration
- `.toPromise()` / `.fromPromise()` - Promise interop (with caveats about eagerness)

**Recommendation:**

- Focus on core synchronous codata first (Phase 1-5)
- Add async support and interop in Phase 6
- Document relationship to continuations and thunks in theory section
- Codata provides unified abstraction over iteration/observation patterns while remaining complementary to continuations and foundational to thunks

### 5. **Stack Safety for Operations**

Current data `unfold` is NOT stack-safe (uses naive recursion). Should codata `unfold` and `fold` be stack-safe?

**Arguments for:**

- Infinite structures are core use case
- Symmetry: data fold is stack-safe, codata fold should be too
- Enables deep continuation chains

**Arguments against:**

- Complexity of iterative corecursion
- May not be necessary if continuations are lazy

**Recommendation:** **Make both operations stack-safe using iterative approach**. Use continuation queue/stack for lazy evaluation. Critical for infinite streams and deep observation chains.

### 6. **Error Handling**

How should errors in observers be handled?

```javascript
const stream = Stream.From(0);
stream.map(x => { if (x === 5) throw new Error(); return x * 2; });
stream.take(10);  // Error on 5th element - then what?
```

**Options:**

- Propagate exception (default JS behavior)
- Return `Option<T>` or `Result<T, E>` from observers
- Provide error recovery observers (`.catch()`, `.recover()`)

**Recommendation:** Start with standard exception propagation. Add error handling ADTs (Option/Result) in future iterations.

---

## Implementation Roadmap

This roadmap has been converted into GitHub issues. See the Product Backlog Items below for copy-paste issue creation.

---

## Product Backlog Items (GitHub Issues)

### Issue 1: Core Codata Infrastructure - Observer Transformer

**Title:** Implement Observer Transformer Abstraction

**Labels:** `enhancement`, `codata`, `phase-1`

**Description:**

Create the `Observer` class to represent codata operations, analogous to the existing `Transformer` class for data operations.

**Acceptance Criteria:**

- [ ] Create `src/Observer.mjs` with Observer class
- [ ] Support operation types: `'unfold' | 'fold' | 'map' | 'merge'`
- [ ] Store observer definitions (name, inSpec, outSpec, cases)
- [ ] Support fold cases: `{ Done, Step }`
- [ ] Include static composition method for fusion
- [ ] Observer constructor validates inputs

**Technical Notes:**

- Mirror structure of `Transformer.mjs` for consistency
- Cases storage for fold operations enables pattern matching
- Composition method needed for merge/deforestation

---

### Issue 2: Core Codata Infrastructure - codata() Function

**Title:** Implement codata() Declaration Function

**Labels:** `enhancement`, `codata`, `phase-1`

**Description:**

Implement the main `codata()` function that parses observer declarations and creates codata types.

**Acceptance Criteria:**

- [ ] Add `codata()` function to `src/index.mjs`
- [ ] Parse observer specs (simple: `T`, parametric: `{ in, out }`)
- [ ] Extract `Self` and type parameters from callback
- [ ] Create codata constructor function
- [ ] Set up WeakMap registry for observers per codata type
- [ ] Validate observer naming (camelCase for methods, PascalCase for constructors)

**Technical Notes:**

- Use callback pattern: `codata(({ Self, T }) => ({ observers }))`
- WeakMap: `codataObservers.set(Codata, Map<string, Observer>)`
- Similar pattern to existing `data()` function

**Example:**

```javascript
const Stream = codata(({ Self, T }) => ({
  head: T,
  tail: Self(T)
}));
```

---

### Issue 3: Core Codata Infrastructure - Proxy-Based Lazy Evaluation

**Title:** Implement Proxy-Based Lazy Evaluation for Codata Instances

**Labels:** `enhancement`, `codata`, `phase-1`

**Description:**

Implement lazy evaluation using JavaScript Proxy with automatic memoization for `Self` continuations.

**Acceptance Criteria:**

- [ ] Create codata instances wrapped in Proxy
- [ ] Lazy evaluation: observers computed only on property access
- [ ] WeakMap for instance state: `{ seed, memo: Map }`
- [ ] Memoize `Self` continuations (return same instance on repeated access)
- [ ] Do NOT memoize simple observers (recompute each time)
- [ ] Proxy `get` handler distinguishes continuation vs simple observer

**Technical Notes:**

- State management: `WeakMap<instance, { seed, memo }>`
- Memoization only for `Self` references (performance/memory tradeoff)
- Simple observers should be pure and cheap to recompute

**Decision Reference:** Open Question 3 (Memoization Granularity)

---

### Issue 4: Core Codata Infrastructure - unfold() Operation

**Title:** Implement unfold() Anamorphism for Codata Construction

**Labels:** `enhancement`, `codata`, `phase-1`

**Description:**

Implement `.unfold()` operation for constructing codata instances from seed values.

**Acceptance Criteria:**

- [ ] Generate static methods (PascalCase naming)
- [ ] Support spec: `(Codata) => ({ in?: Type, out: Codata })`
- [ ] Seed-based instance creation
- [ ] Observer functions: `(seed) => value` or `(seed) => (param) => value`
- [ ] Integrate with Proxy-based lazy evaluation
- [ ] Chain multiple unfolds on same codata type

**Technical Notes:**

- Simple observers: `head: (n) => n`
- Parametric observers: `nth: (n) => (index) => n + index`
- Continuations: `tail: (n) => n + 1` (returns next seed)
- Created instances use Proxy for laziness

**Example:**

```javascript
.unfold('From', (Stream) => ({ in: Number, out: Stream(Number) }), {
  head: (n) => n,
  tail: (n) => n + 1
});
```

---

### Issue 5: Core Codata Infrastructure - Tests for Infinite Structures

**Title:** Test Suite for Lazy Evaluation and Infinite Codata

**Labels:** `test`, `codata`, `phase-1`

**Description:**

Comprehensive test suite covering lazy evaluation, memoization, and infinite codata structures.

**Acceptance Criteria:**

- [ ] Test 1: Infinite Stream - lazy evaluation and continuation memoization
- [ ] Test 2: Constant Stream (ones) - infinite repetition via corecursion
- [ ] Test 3: Rose Tree - lazy children generation on demand
- [ ] Test 4: Codata Set - interface-defined infinite sets (e.g., all evens)
- [ ] Verify lazy evaluation (observers computed on access)
- [ ] Verify memoization (same `Self` reference === same instance)
- [ ] Test parametric observers (functions with inputs)

**Test Cases:**

**Infinite Stream:**

```javascript
const nums = Stream.From(0);
nums.head;  // 0
const tail1 = nums.tail;
const tail2 = nums.tail;
assert(tail1 === tail2);  // Memoized
```

**Constant Stream:**

```javascript
const ones = Stream.Repeat(1);
assert(ones.head === 1);
assert(ones.tail.head === 1);
assert(ones.tail.tail.head === 1);  // Infinite
```

**Rose Tree:**

```javascript
const tree = RoseTree.Node({
  value: 1,
  childGen: (n) => [n * 2, n * 2 + 1]
});
assert(tree.children[0].value === 2);  // Lazy child
```

**Codata Set:**

```javascript
const evens = CodataSet.Evens();
assert(evens.isEmpty === false);  // Infinite
assert(evens.lookup(4) === true);
assert(evens.lookup(3) === false);
```

---

### Issue 6: Fold Operations - Case-Based Catamorphism

**Title:** Implement fold() Catamorphism with Case-Based Pattern Matching

**Labels:** `enhancement`, `codata`, `phase-2`

**Description:**

Implement `.fold()` operation for consuming codata with explicit termination conditions using declarative case-based syntax.

**Acceptance Criteria:**

- [ ] Generate instance methods (camelCase naming)
- [ ] Support spec: `{ in?: Type, out: Type }`
- [ ] Case-based pattern matching: `{ Done, Step }`
- [ ] `Done`: Predicate `(self, ...params) => Boolean`
- [ ] `Step`: Observation `(self, ...params) => { emit, nextState, nextSelf }`
- [ ] Internal accumulation based on `spec.out` (Array, Number, etc.)
- [ ] Stack-safe iterative implementation (NOT recursive)
- [ ] No unbounded operations allowed

**Technical Notes:**

- Framework handles accumulation internally
- Done case: when to stop consuming
- Step case: what to emit and next state
- Iterative loop prevents stack overflow

**Example:**

```javascript
.fold('take', { in: Number, out: Array }, {
  Done: (self, n) => n <= 0,
  Step: (self, n) => ({
    emit: self.head,
    nextState: n - 1,
    nextSelf: self.tail
  })
});
```

**Decision Reference:** Open Question 2 (Safe Iteration), Open Question 5 (Stack Safety)

---

### Issue 7: Fold Operations - Safe Iteration Primitives

**Title:** Implement Safe Iteration Primitives (take, takeWhile)

**Labels:** `enhancement`, `codata`, `phase-2`

**Description:**

Implement safe iteration primitives that require explicit bounds to prevent infinite loops.

**Acceptance Criteria:**

- [ ] Implement `take(n)`: bounded consumption (at most n elements)
- [ ] Implement `takeWhile(predicate)`: predicate-based termination
- [ ] All primitives use fold with explicit `Done` conditions
- [ ] No unbounded operations possible (no `toArray()` without bounds)
- [ ] Stack-safe for deep chains (10000+ elements)

**Technical Notes:**

- All consumption requires explicit termination
- Design enforces safety at API level (not runtime limits)
- Documentation must warn about infinite structures

**Example:**

```javascript
const nums = Stream.From(0);
nums.take(5);  // [0, 1, 2, 3, 4]
nums.takeWhile(x => x < 5);  // [0, 1, 2, 3, 4]
nums.take(10000);  // No stack overflow
```

---

### Issue 8: Fold Operations - Stack Safety Tests

**Title:** Test Suite for Stack-Safe Fold Operations

**Labels:** `test`, `codata`, `phase-2`

**Description:**

Verify that fold operations are stack-safe and handle deep continuation chains without overflow.

**Acceptance Criteria:**

- [ ] Test fold with 10000+ element consumption
- [ ] Test deep continuation chains (10000+ tail accesses)
- [ ] Verify no stack overflow errors
- [ ] Test termination conditions (Done predicates)
- [ ] Test safe iteration primitives
- [ ] Verify no infinite loops possible with API

**Test Cases:**

```javascript
const nums = Stream.From(0);
assert.doesNotThrow(() => nums.take(10000));
assert.doesNotThrow(() => {
  let s = nums;
  for (let i = 0; i < 10000; i++) s = s.tail;
});
```

---

### Issue 9: Map and Merge - Type Parameter Transformation

**Title:** Implement map() for Type Parameter Transformation

**Labels:** `enhancement`, `codata`, `phase-3`

**Description:**

Implement `.map()` operation for transforming type parameters while preserving codata structure with lazy evaluation.

**Acceptance Criteria:**

- [ ] Generate instance methods (camelCase naming)
- [ ] Support spec: `{ out: (T) => Codata }` or `(Self) => ({ out: Self })`
- [ ] Transform spec: `{ T: (value) => transformedValue }`
- [ ] Lazy application (transforms applied on observation, not eagerly)
- [ ] Preserve `Self` continuations with memoization
- [ ] Same API as data `.map()` for consistency

**Technical Notes:**

- Creates new codata instance with transformed observers
- Transformations computed on-demand during access
- Continuations remain memoized after transformation

**Example:**

```javascript
.map('double', {}, { T: (x) => x * 2 });

const nums = Stream.From(0);
const doubled = nums.double();
doubled.head;  // 0 (computed lazily)
doubled.tail.head;  // 2
```

**Decision Reference:** Open Question 1 (Naming: map not refine)

---

### Issue 10: Map and Merge - Operation Fusion (Deforestation)

**Title:** Implement merge() for Operation Composition and Deforestation

**Labels:** `enhancement`, `codata`, `phase-3`

**Description:**

Implement `.merge()` operation to compose fold+map+unfold pipelines without intermediate allocations.

**Acceptance Criteria:**

- [ ] Compose multiple operations: `['unfold', 'map', ..., 'fold']`
- [ ] Validate composition rules:
  - [ ] Maximum 1 unfold operation
  - [ ] Maximum 1 fold operation
  - [ ] Any number of map operations
  - [ ] Left-to-right composition order
- [ ] Optimize intermediate allocations (deforestation)
- [ ] Same API as data `.merge()` for consistency
- [ ] Generate appropriate method (PascalCase if includes unfold, else camelCase)

**Technical Notes:**

- Fuses operations into single traversal
- No intermediate codata instances created
- Performance optimization via fusion

**Example:**

```javascript
.merge('SumOfDoubles', ['From', 'double', 'sum']);

// No intermediate stream created
Stream.SumOfDoubles(0, 10);  // Sum of 0,2,4,6,...,18
```

**Decision Reference:** Open Question 1 (Naming: merge not fuse)

---

### Issue 11: Map and Merge - Performance Tests

**Title:** Test Suite for Map/Merge Performance and Fusion

**Labels:** `test`, `codata`, `phase-3`

**Description:**

Verify that map transformations and merge fusion provide expected performance characteristics.

**Acceptance Criteria:**

- [ ] Test map transformations on infinite streams
- [ ] Benchmark fused vs separate operations
- [ ] Verify no intermediate allocations in merged operations
- [ ] Test composition chains (unfold → map → map → fold)
- [ ] Verify memoization behavior (only Self refs)
- [ ] Performance comparison: merged vs manual composition

**Test Cases:**

```javascript
// Verify fusion eliminates intermediate structures
const separate = Stream.From(0).double().take(1000);
const merged = Stream.SumOfDoubles(0, 1000);
// Benchmark: merged should be faster (no intermediate stream)
```

---

### Issue 12: Extension and Polish - Codata Extension Support

**Title:** Implement extend() for Codata Extension

**Labels:** `enhancement`, `codata`, `phase-4`

**Description:**

Support codata extension mirroring data's `.extend()` mechanism, allowing observer inheritance and override.

**Acceptance Criteria:**

- [ ] Implement `.extend()` for codata types
- [ ] Inherit observers from parent codata
- [ ] Support adding new observers
- [ ] Override mechanism with parent observer access
- [ ] `Self` reference resolution in extended codata
- [ ] Memoization inheritance for continuations
- [ ] Extended instances work with parent operations

**Technical Notes:**

- Similar to data fold parent access mechanism
- Extended codata inherits observer registry
- New observers added to extended type's registry

**Example:**

```javascript
const ExtendedStream = BasicStream.extend(({ Self, T }) => ({
  nth: { in: Number, out: T }
}));

const nums = ExtendedStream.From(10);
nums.take(3);  // [10, 11, 12] - inherited
nums.nth(5);   // 15 - new operation
```

---

### Issue 13: Extension and Polish - Examples Directory

**Title:** Create Comprehensive Codata Examples

**Labels:** `documentation`, `codata`, `phase-4`

**Description:**

Add examples directory demonstrating various codata patterns and use cases.

**Acceptance Criteria:**

- [ ] Infinite streams: fibonacci, primes, iterate
- [ ] Constant stream (ones): infinite repetition
- [ ] Event sources: timers, user input simulation
- [ ] Rose tree: lazy children generation
- [ ] Codata Set: infinite sets (evens, odds)
- [ ] Each example includes:
  - [ ] Codata declaration
  - [ ] Unfold definitions
  - [ ] Fold/consumption examples
  - [ ] Safe iteration demonstrations
  - [ ] Comments explaining codata concepts

**Files to Create:**

- `examples/infinite-stream.mjs`
- `examples/fibonacci.mjs`
- `examples/lazy-tree.mjs`
- `examples/codata-set.mjs`

---

### Issue 14: Extension and Polish - Documentation Updates

**Title:** Update Documentation with Codata Section

**Labels:** `documentation`, `codata`, `phase-4`

**Description:**

Update README and create comprehensive codata guide.

**Acceptance Criteria:**

**README.md Updates:**

- [ ] Add codata section after data section
- [ ] Duality table (data vs codata)
- [ ] Simple example (infinite stream)
- [ ] Lazy evaluation explanation
- [ ] Safe iteration requirements
- [ ] Memoization granularity explanation
- [ ] Link to CODATA_GUIDE.md

**CODATA_GUIDE.md (new file):**

- [ ] Theory: data vs codata, recursion vs corecursion
- [ ] Motivation: infinite structures, effects, continuations
- [ ] Usage patterns: streams, observers, lazy structures
- [ ] Best practices:
  - [ ] Always use bounded consumption
  - [ ] Understand memoization (Self refs only)
  - [ ] When to use codata vs data
- [ ] Relationship to continuations and thunks
- [ ] Relationship to TC39 Observable proposal
- [ ] API reference (unfold, fold, map, merge)

---

### Issue 15: Extension and Polish - Best Practices Documentation

**Title:** Document Codata Best Practices and Patterns

**Labels:** `documentation`, `codata`, `phase-4`

**Description:**

Create comprehensive best practices guide for codata usage.

**Acceptance Criteria:**

- [ ] Safe iteration guidelines (always use bounds)
- [ ] Memoization behavior (Self vs simple observers)
- [ ] When to use codata vs data
- [ ] Performance considerations
- [ ] Memory management (WeakMap, memoization)
- [ ] Error handling patterns
- [ ] Common pitfalls and how to avoid them
- [ ] Relationship to:
  - [ ] Continuations (observers ARE continuations)
  - [ ] Thunks (observers ARE structured thunks)
  - [ ] Generators (isomorphic relationship)
  - [ ] TC39 Observable proposal

---

## Future Work (Phase 5)

The following features are deferred to post-initial release based on user feedback and practical usage patterns:

### Advanced Features

- Promise-based observers: `read: Promise(String)`
- Effect abstraction: Generic effect wrapper
- Async iteration: `AsyncStream` with async observers
- Challenges:
  - Promises are eager, codata is lazy (need explicit force)
  - Mixing sync/async semantics
  - Proper async memoization strategy

**2. Interop Adapters**

Based on Open Question 4 analysis:

- **Generators (Isomorphic)**:
  - `.toIterator()` - Convert codata to generator protocol
  - `.fromIterator()` - Create codata from generators
  - Codata subsumes generators (single-observer streams)

- **Async Iterators (Subsumes)**:
  - `.toAsyncIterator()` - Convert to async generator
  - `.fromAsyncIterator()` - Create async codata
  - Requires async observer support (Phase 5.1)

- **RxJS Observables (Subsumes)**:
  - `.toObservable()` - Convert to RxJS Observable
  - `.fromObservable()` - Create codata from Observable
  - Subscription pattern maps to codata observers
  - Challenges: RxJS has extensive operator library

- **Promises (Partial subsumption)**:
  - `.toPromise()` - Force single async value
  - `.fromPromise()` - Create Future-like codata
  - Challenges: Promises eager, codata lazy

- **Continuations (Complementary)**:
  - Document relationship: observers ARE continuations
  - `Self` continuations represent infinite chains
  - No direct interop needed (conceptual relationship)

- **Thunks (Foundational)**:
  - Document relationship: observers ARE structured thunks
  - No direct interop needed (implementation detail)

**3. Error Handling**

- Option/Result ADTs for observers
- `.catch()` / `.recover()` operations
- Error propagation in fold operations
- Integration with existing Option/Result types

**4. Performance Optimizations**

- Advanced memoization strategies (configurable)
- Fusion optimizations beyond basic merge
- JIT-friendly patterns
- Memory profiling and optimization

**5. Advanced Patterns**

- Cofree comonad (dual of Free monad)
- Moore/Mealy machines (state machines as codata)
- Process calculi (concurrent processes)
- Reactive programming patterns

**Recommendation:**

1. Release core codata (Phases 1-4) as initial stable version
2. Gather feedback and practical usage patterns
3. Phase 5 features added incrementally based on:
   - User demand and use cases
   - Performance requirements
   - Ecosystem integration needs
4. Prioritize interop adapters that show clear value (likely generators first)
5. Document theoretical relationships (continuations, thunks) without implementation

---

## References

### Theoretical Background

1. **"Beautiful Differentiation"** - Conal Elliott (2009)
   - Automatic differentiation via codata
   - <https://www.semanticscholar.org/paper/Beautiful-Differentiation-Elliott/39b0bf43a1ac77c6b27fe62ba3fd1e20f75b3144>

2. **"Data and Codata"** - Conor McBride (2013)
   - Distinction between data and codata
   - <http://strictlypositive.org/>

3. **"Codata in Action"** - Paul Downen, Zena Ariola (2018)
   - Practical codata programming
   - <https://arxiv.org/abs/1806.04022>

4. **"Copatterns: Programming Infinite Structures by Observations"** - Andreas Abel, et al. (2013)
   - Copattern matching for codata
   - <https://doi.org/10.1145/2429069.2429075>

### Related Work

1. **Agda** - Copatterns and corecursion
   - <https://agda.readthedocs.io/en/latest/language/copatterns.html>

2. **Idris 2** - Codata and quantitative types
   - <https://idris2.readthedocs.io/en/latest/tutorial/miscellany.html#coinduction>

3. **RxJS** - Reactive programming (observable pattern)
   - <https://rxjs.dev/>

4. **Algebraic Effects** - Effect handlers (related to codata)
   - <https://overreacted.io/algebraic-effects-for-the-rest-of-us/>

### Lapis JS Existing Documentation

1. **README.md** - Current data ADT documentation
2. **Transformer.mjs** - Current transformer abstraction
3. **examples/** - Existing data examples (List, Stack, Peano, etc.)

---

## Appendix: Comparison with Other Languages

### Haskell (Lazy by Default)

```haskell
-- Infinite stream (lazy evaluation implicit)
data Stream a = Cons a (Stream a)

ones :: Stream Int
ones = Cons 1 ones

take :: Int -> Stream a -> [a]
take 0 _ = []
take n (Cons x xs) = x : take (n-1) xs
```

### Idris 2 (Explicit Codata)

```idris
codata Stream : Type -> Type where
  Cons : a -> Stream a -> Stream a

ones : Stream Int
ones = Cons 1 ones

take : Nat -> Stream a -> List a
take Z _ = []
take (S k) (Cons x xs) = x :: take k xs
```

### Agda (Copatterns)

```agda
record Stream (A : Set) : Set where
  coinductive
  field
    head : A
    tail : Stream A

ones : Stream ℕ
head ones = 1
tail ones = ones
```

### Lapis JS (Proposed)

```javascript
const Stream = codata(({ Self, T }) => ({
  head: T,
  tail: Self(T)
}))
.unfold('Repeat', (Stream) => ({ in: T, out: Stream }), {
  head: (x) => x,
  tail: (x) => x  // Seed for next (lazy)
});

const ones = Stream.Repeat(1);
console.log(ones.head);        // 1
console.log(ones.tail.head);   // 1
```

**Key Difference:** JavaScript is eager by default, so we need explicit lazy evaluation via Proxy/thunks.

---

## Conclusion

This design document outlines a comprehensive plan for adding codata support to Lapis JS. The proposed design:

1. **Maintains symmetry** with existing `data()` API and semantics
2. **Leverages proven patterns** from the current transformer architecture
3. **Enables new use cases**: infinite structures, effects, continuations
4. **Provides clear migration path** through incremental milestones
5. **Preserves compatibility** with existing data ADT features

The implementation can proceed iteratively, with each phase building on the previous one. The core infrastructure (Phase 1-2) provides immediate value, while later phases add power and polish.

**Next Steps:**

1. Review this design document with stakeholders
2. Refine open questions and design decisions
3. Begin Phase 1 implementation
4. Iterate based on practical experience and feedback

---

**Document Status:** Draft for Review
**Last Updated:** November 27, 2025
**Feedback:** Please open an issue or discussion on GitHub
