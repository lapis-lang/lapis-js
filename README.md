# Lapis JS

[![Build](https://github.com/lapis-lang/lapis-js/workflows/Build/badge.svg?branch=master)](https://github.com/lapis-lang/lapis-js/actions?query=workflow%3ABuild%2FRelease)
[![npm version](https://badge.fury.io/js/%40lapis-lang%2Flapis-js.svg)](https://www.npmjs.com/package/@lapis-lang/lapis-js)
[![Downloads](https://img.shields.io/npm/dm/@lapis-lang/lapis-js.svg)](https://www.npmjs.com/package/@lapis-lang/lapis-js)

Lapis JS is an embedded DSL for experimentation of the semantics for the upcoming Lapis programming language.
This is best described informally as a Bialgebraic programming language with support for Algebraic Data Types (Initial Algebras), Subtyping, Behavior (Final Coalgebras), Protocols, Effects, and Contracts.

This should feel familiar to users of functional programming languages like Haskell, OCaml, F#, and Scala, but here
there is an emphasis on the Bird-Meertens Formalism (BMF) (Squiggol) of making programs by combining data and behavior through folds and unfolds (and their various duals and combinations).

## Table of Contents

- [Installation](#installation)
- [Algebraic Data Types (Initial Algebras)](#algebraic-data-types-initial-algebras)
  - [Simple Enumerated Types](#simple-enumerated-types)
  - [Structured Data](#structured-data)
  - [Guards and Validation](#guards-and-validation)
  - [Invariants](#invariants)
- [Parameterized and Recursive ADTs](#parameterized-and-recursive-adts)
- [ADT Extension (Subtyping)](#adt-extension-subtyping)
  - [Extending recursive ADTs](#extending-recursive-adts)
- [Fold Operations](#fold-operations)
  - [Basic Fold Operations](#basic-fold-operations)
  - [Specs](#specs)
  - [Uniform Access Principle](#uniform-access-principle)
  - [Fold on Structured Variants](#fold-on-structured-variants)
  - [Wildcard Handlers](#wildcard-handlers)
  - [Exhaustiveness Checking](#exhaustiveness-checking)
  - [Multiple Fold Operations](#multiple-fold-operations)
  - [Structural Recursion (Catamorphisms)](#structural-recursion-catamorphisms)
  - [Parameterized Folds](#parameterized-folds)
  - [Integration with ADT Extension](#integration-with-adt-extension)
  - [Extending Fold Operations](#extending-fold-operations)
  - [Recursion and Stack Safety](#recursion-and-stack-safety)
  - [Polymorphic Recursion in Extended Folds](#polymorphic-recursion-in-extended-folds)
- [Type Parameter Transformations with Map](#type-parameter-transformations-with-map)
- [Unfold Operations (Corecursion/Anamorphisms)](#unfold-operations-corecursionanamorphisms)
  - [Basic Unfold Operations](#basic-unfold-operations)
  - [Binary Operations with Fold](#binary-operations-with-fold)
- [Merge Operations (Deforestation)](#merge-operations-deforestation)
  - [Recursion Schemes](#recursion-schemes)
- [Behavior (Final Coalgebras)](#behavior-final-coalgebras)
  - [Data vs Behavior](#data-vs-behavior)
  - [Basic Behavior Declaration](#basic-behavior-declaration)
  - [Unfold Operations (Constructing Behavior)](#unfold-operations-constructing-behavior)
  - [Multiple Unfold Constructors](#multiple-unfold-constructors)
  - [Parametric Observers](#parametric-observers)
  - [Lazy Evaluation and Memoization](#lazy-evaluation-and-memoization)
  - [Infinite Structures](#infinite-structures)
  - [Fold Operations (Consuming Behavior)](#fold-operations-consuming-behavior)
  - [Map (Lazy Type Transformation)](#map-lazy-type-transformation)
  - [Merge (Deforestation)](#merge-deforestation)
  - [Effect-like Behavior](#effect-like-behavior)
- [References, Inspirations, and Further Reading](#references-inspirations-and-further-reading)

## Installation

The latest version:

```bash
npm install @lapis-lang/lapis-js
```

A specific version:

```bash
npm install @lapis-lang/lapis-js@<version>
```

For direct use in a browser (no build step):

```html
<script type="importmap">
{
  "imports": {
    "@lapis-lang/lapis-js": "https://unpkg.com/@lapis-lang/lapis-js@<version>/dist/index.mjs"
  }
}
</script>
<script type="module">
import { data } from "@lapis-lang/lapis-js";

console.log(typeof data); // "function"
</script>
```

## Algebraic Data Types (Initial Algebras)

### Simple Enumerated Types

Data types like simple enumerations can be defined as such:

```ts
import { data } from '@lapis-lang/lapis-js';

const Color = data(({Family}) => ({ Red: {}, Green: {}, Blue: {} }));

// Color is the data type; Red, Green, Blue are singleton variants
console.log(Color.Red instanceof Color); // true
console.log(Color.Green instanceof Color); // true

// Type checking with instanceof
if (Color.Red instanceof Color)
    console.log("It's a Color!");
```

- Variant names, being constructors, must be **PascalCase** (start with uppercase letter)
- Variant definitions use empty object literals `{}` to indicate simple singleton variants
- Singleton variants are accessed as properties (e.g., `Color.Red`), not called as functions

Semantically you can think of the above as creating the following JavaScript:

```ts
abstract class Color {
    static Red = new (class Red extends Color {})();
    static Green = new (class Green extends Color {})();
    static Blue = new (class Blue extends Color {})();
}
```

### Structured Data

Structured data can be defined by utilizing the object literal associated with each variant:

```ts
const Point = data((Family) => ({
    Point2D: { x: Number, y: Number },
    Point3D: { x: Number, y: Number, z: Number }
}));
```

- Variant names must be **PascalCase**
- Field names must be **camelCase** (start with lowercase letter, no underscore prefix)
- Field values specify the Guard of the field (e.g., `Number`, `String`, other ADTs, or predicates).
  - Guards are described below.

Structured variants (with fields) are constructed by calling them as functions with named arguments (object form) or positional arguments (tuple form):

```ts
const p1 = Point.Point2D({ x: 10, y: 20 });  // Named arguments
const p2 = Point.Point2D(10, 20);             // Positional arguments
```

If you attempt to construct a variant with missing or extra fields, or with fields of the wrong type, a `TypeError` is thrown at runtime.

```ts
Point.Point2D({ x: 10 });          // Throws TypeError (missing 'y')
Point.Point2D({ x: 10, y: 20, z: 30 }); // Throws TypeError (extra 'z')
Point.Point2D({ x: '10', y: 20 }); // Throws TypeError (x must be Number)
```

The `instanceof` operator works for both the variant and the data type:

```ts
console.log(p1 instanceof Point.Point2D); // true
console.log(p1 instanceof Point);         // true
```

Variant instances are readonly.

```ts
p1.x = 30; // Throws Error (instance is frozen)
```

### Guards and Validation

Guards specify the expected type of each field in a structured variant or in a Spec (described below).

Guards can be:

- Built-in primitive types: `Number`, `String`, `Boolean`, `BigInt`, `Symbol`
- Built-in object types: `Object`, `Array`, `Date`, `RegExp`
- Other ADTs
- Object literals (for validating structured inputs with multiple fields)
- Predicates (custom validation functions)

When a primitive type guard is used. `Number`, `String`, etc., these are validated at runtime using `typeof` checks.
So `Number` fields must be of type `number` (primitive, not wrapper object).

When an object type guard is used, such as `Object`, `Array`, `Date`, or `RegExp`, these are validated at runtime using `instanceof` or `typeof` checks as appropriate.

When an ADT is used as a guard, the field value is validated at runtime using `instanceof` checks against the ADT.

When a predicate is used as a guard, it must be a function that takes a single argument and returns a boolean indicating whether the value is valid. The predicate is called at runtime to validate the field value:

```ts
const isEven = (x) => typeof x === 'number' && x % 2 === 0;

const EvenPoint = data(() => ({
    Point2: { x: isEven , y: isEven }
}));

const p = EvenPoint.Point2({ x: 2, y: 4 });  // Valid
console.log(p.x); // 2
console.log(p.y); // 4

EvenPoint.Point2({ x: 3, y: 4 });  // Throws TypeError at runtime
// TypeError: Field 'x' failed predicate validation
```

### Invariants

Invariants allow you to specify relationships and constraints between multiple fields in a structured variant. Unlike guards which validate individual fields independently, invariants validate the constructed instance as a whole.

Use the `invariant` symbol to define predicates that assert properties about the entire variant:

```ts
import { data, invariant } from '@lapis-lang/lapis-js';

const isChar = (s) => typeof s === 'string' && s.length === 1;

const Range = data(() => ({
    CharRange: {
        [invariant]: ({ start, end }) => start <= end,
        start: isChar,
        end: isChar
    }
}));

const r = Range.CharRange({ start: 'a', end: 'z' }); // Valid
console.log(r.start); // 'a'

Range.CharRange({ start: 'z', end: 'a' }); // Throws TypeError
// TypeError: Invariant violation in variant 'CharRange'
```

**Key points:**

- Invariants are defined using the `[invariant]` symbol as a field key
- The invariant predicate receives the fully constructed instance and returns a boolean
- Invariants are checked **after** all field guards pass, but **before** the instance is frozen
- If the invariant returns `false`, a `TypeError` is thrown with a descriptive message

## Parameterized and Recursive ADTs

Recursive data structures and parameterized (generic) data types can be defined using the callback form of the `data` function `data(({Family, ...}) => ({ ... }))`.

```ts
const Peano = data(({ Family }) => ({
    Zero: {},
    Succ: { pred: Family }
}));

const zero = Peano.Zero;
const one = Peano.Succ({ pred: zero });
const two = Peano.Succ({ pred: one });

console.log(two.pred.pred === zero); // true
```

In the above, `Family` is a reserved special reference to the ADT being defined, allowing recursive references. `Family` references are validated at **runtime** with `instanceof` checks against the ADT family. Since the `Peano` ADT is not parameterized, `Family` is used directly as a guard (it is not callable). In other words, `Family` is equivalent to `Family()` for non-parameterized recursive ADTs, but you write `Family` not `Family()`.

For parameterized ADTs, arbitrary type parameter names can be used in the destructured callback:

```ts
const Pair = data(({ T, U }) => ({
    MakePair: { first: T, second: U }
}));

const numStrPair = Pair(Number, String);

const pair = numStrPair.MakePair(42, 'hello');

console.log(pair.first);  // 42
console.log(pair.second); // 'hello'

numStrPair.MakePair('bad', 100); // Throws TypeError at runtime
```

Recursive parameterized ADTs can combine `Family` and type parameters:

```ts
const List = data(({ Family, T }) => ({
    Nil: {},
    Cons: { head: T, tail: Family(T) }
}));

const {Cons, Nil} = List(Number);

const nums = Cons(1, Cons(2, Cons(3, Nil)));
console.log(nums.head);         // 1
console.log(nums.tail.head);    // 2

const badList = Cons('bad', Nil); // Throws TypeError at runtime
```

Note that `List(Number)` in the above is equivalent to `List({ T: Number })` - both forms are supported for type instantiation.

## ADT Extension (Subtyping)

Extend existing ADTs with new variants using the `[extend]` symbol within a new `data()` declaration. This enables open ADTs that can be incrementally extended while maintaining proper subtyping relationships.

```ts
import { data, extend } from '@lapis-lang/lapis-js';

// Base ADT
const Color = data(() => ({ Red: {}, Green: {}, Blue: {} }));

// Extend with new variants using [extend] symbol
const ExtendedColor = data(() => ({
    [extend]: Color,
    Yellow: {},
    Orange: {}
}));

// Inherited variants accessible on extended ADT
console.log(ExtendedColor.Red);    // Inherited singleton
console.log(ExtendedColor.Yellow); // New singleton

// Proper subtyping
console.log(ExtendedColor.Yellow instanceof Color); // true (new variants are instanceof base)
console.log(ExtendedColor.Red instanceof ExtendedColor); // true (inherited variants are instanceof extended ADT)
console.log(ExtendedColor.Red === Color.Red); // false (new singleton instance created)
```

### Extending recursive ADTs

Use the callback form with `[extend]` and `Family` to extend recursive ADTs. The `Family` reference in extended variants accepts instances from any level of the hierarchy:

```ts
// Base expression language
const IntExpr = data(({ Family }) => ({
    IntLit: { value: Number },
    Add: { left: Family, right: Family }
}));

// Extend with boolean operations
const IntBoolExpr = data(({ Family }) => ({
    [extend]: IntExpr,
    BoolLit: { value: Boolean },
    LessThan: { left: Family, right: Family }
}));

// Extend further with variables
const FullExpr = data(({ Family }) => ({
    [extend]: IntBoolExpr,
    Var: { name: String },
    Let: { name: String, value: Family, body: Family }
}));

// Family fields accept instances from any hierarchy level
const letExpr = FullExpr.Let({
    name: 'x',
    value: FullExpr.IntLit({ value: 5 }),      // IntExpr variant
    body: FullExpr.LessThan({
        left: FullExpr.Var({ name: 'x' }),
        right: FullExpr.IntLit({ value: 5 })
    })  // IntBoolExpr variant
});
console.log(letExpr instanceof IntExpr);     // true
console.log(letExpr instanceof IntBoolExpr); // true
console.log(letExpr instanceof FullExpr);    // true
```

**Key points:**

- Extended ADTs inherit all parent variants
- Extended variants are `instanceof` both extended and base ADTs
- Inherited variants maintain original type (not `instanceof` extended ADT)
- Singleton and constructor identity preserved
- `Family` accepts instances from any hierarchy level
- Variant name collisions throw errors

## Fold Operations

A fold (catamorphism) is the **universal observation** on an algebraic data type: every total function that consumes an ADT and respects its algebraic structure is expressible as a fold. This is why Lapis provides a single `fold` mechanism rather than distinguishing between `foldl` and `foldr` — that distinction is an artifact of lists being linear. For general algebraic data types (trees, expressions, etc.), there is only one canonical fold: the catamorphism, which replaces each constructor with a corresponding function and accumulates results bottom-up from leaves to root.

For non-recursive ADTs, folds perform simple pattern matching. For recursive ADTs, folds automatically recurse into `Family` fields, replacing constructors with functions. Operations are installed on variant class prototypes and support proper inheritance through the extension hierarchy.

Semantically you can think of folds as creating methods on each variant class that dispatch based on the variant type and recursively process fields as needed.

**Declaring operations:** Use the `fold()`, `unfold()`, `map()`, and `merge()` helpers. Import them alongside `data` or `behavior`:

```ts
import { data, fold, unfold, map, merge } from '@lapis-lang/lapis-js';
```

### Basic Fold Operations

Fold operations are defined inline within the ADT declaration using `fold(spec)(handlers)`, where `spec` describes input/output types and `handlers` maps each variant to a function:

```ts
const Color = data(() => ({
    Red: {},
    Green: {},
    Blue: {},

    toHex: fold({ out: String })({
        Red() { return '#FF0000'; },
        Green() { return '#00FF00'; },
        Blue() { return '#0000FF'; }
    })
}));

console.log(Color.Red.toHex);   // '#FF0000'
console.log(Color.Green.toHex); // '#00FF00'
console.log(Color.Blue.toHex);  // '#0000FF'
```

### Specs

The spec (first argument to `fold()`, `unfold()`, or `map()`) is an **object literal** describing the operation's signature. Pass an empty object `{}` to skip all runtime validation.

When provided, the spec can contain:

- `in`: The input guard for parameters — validated at runtime for both fold and unfold operations
- `out`: The return guard — **only validated at runtime for fold operations**; on unfold operations it carries no runtime enforcement

**Why `out` is not checked on unfold:** fold handlers are *user code* that returns a value — the framework validates it against `out` because the handler could return the wrong type. Unfold handlers, by contrast, never return the ADT/behavior instance directly; they return either `null` or a plain fields object (e.g. `{ head: n, tail: n-1 }`), and the framework constructs the actual output instance itself. The output type is therefore a structural guarantee enforced by construction, not something a handler can violate. Stating `out: Family` or `out: Self` on an unfold is documentation of intent only.

**Summary:** omit `spec` entirely when there is no `in` to validate. Adding `out` to an unfold spec is always optional documentation, never runtime enforcement.

For recursive ADTs, the spec can reference `Family` from the surrounding `data()` callback scope:

```ts
data(({ Family }) => ({
    // ... variants ...
    operationName: fold({ out: Family })({
        // ... handlers ...
    })
}))
```

### Uniform Access Principle

Lapis JS follows the **Uniform Access Principle (UAP)**: parameterless operations are accessed as properties, not methods. This provides a consistent interface where:

- **Parameterless operations** (no input parameter): accessed as properties
  - Example: `Color.Red.toHex` (not `Color.Red.toHex()`)
- **Parameterized operations** (accept input parameter): called as methods
  - Example: `list.append(3)` (requires parentheses and argument)

This design eliminates visual noise for pure computations while making it clear when operations require input. Since data operations should be pure (no side effects), treating parameterless computations as properties is semantically appropriate.

### Fold on Structured Variants

Handlers use **named destructuring** to access variant fields:

```ts
const Point = data(() => ({
    Point2D: { x: Number, y: Number },
    Point3D: { x: Number, y: Number, z: Number },

    quadrant: fold({ out: String })({
        Point2D({ x, y }) {
            if (x >= 0 && y >= 0) return 'Q1';
            if (x < 0 && y >= 0) return 'Q2';
            if (x < 0 && y < 0) return 'Q3';
            return 'Q4';
        },
        Point3D({ x, y, z }) {
            // 3D quadrant logic...
            return `Octant(${x >= 0}, ${y >= 0}, ${z >= 0})`;
        }
    })
}));

const p = Point.Point2D({ x: 5, y: 10 }));
console.log(p.quadrant); // 'Q1'

const p3d = Point.Point3D({ x: -1, y: 2, z: 3 }));
console.log(p3d.quadrant); // 'Octant(false, true, true)'
```

**Handler parameter form:**

- Handlers use **named form only**: `Variant({ field1, field2 }) => ...`
- Partial destructuring allowed: `Point3D({ x, y }) => ...` (ignoring `z`)
- Singleton variants have no parameters: `Red() => ...`

### Wildcard Handlers

Use the `_` wildcard to handle unknown or unspecified variants:

```ts
const Color = data(() => ({
    Red: {},
    Green: {},
    Blue: {},
    toHex: fold({ out: String })({
        Red() { return '#FF0000'; },
        _() { return '#UNKNOWN'; }
    })
}));

console.log(Color.Red.toHex);   // '#FF0000'
console.log(Color.Green.toHex); // '#UNKNOWN' (wildcard)
console.log(Color.Blue.toHex);  // '#UNKNOWN' (wildcard)
```

**Wildcard handler signature:**

```ts
// Parameterless fold
_(fields) {
    // Access variant information
    console.log(this.constructor.name); // Variant name
    return someValue;
}

// Parameterized fold
_(fields, inputArg) {
    // Access both instance and input parameter
    return computeWithBoth(this, inputArg);
}
```

### Exhaustiveness Checking

Exhaustive handler coverage is enforced at runtime:

#### Option 1: All handlers required (no wildcard)

```ts
// Valid - all variants handled
const Color = data(() => ({
    Red: {},
    Green: {},
    Blue: {},

    toHex: fold({})({
        Red() { return '#FF0000'; },
        Green() { return '#00FF00'; },
        Blue() { return '#0000FF'; }
    })
}));

// Runtime Error - Green and Blue handlers missing
const Incomplete = data(() => ({
    Red: {},
    Green: {},
    Blue: {},

    toHex: fold({})({
        Red() { return '#FF0000'; }
        // Missing handlers - will throw at runtime when Green or Blue is encountered
    })
}));

// Color.Red.toHex works fine
// Color.Green.toHex throws: Error: No handler for variant 'Green' in operation 'toHex'
```

#### Option 2: Partial handlers with wildcard

```ts
// Valid - wildcard handles unspecified variants
const Color = data(() => ({
    Red: {},
    Green: {},
    Blue: {},

    toHex: fold({})({
        Red() { return '#FF0000'; },
        _() { return '#UNKNOWN'; }
    })
}));

// Color.Green.toHex returns '#UNKNOWN' (wildcard handler)
```

#### Extended ADTs and Exhaustiveness

**When extending an existing operation**: Only new variants need handlers (parent provides inherited handlers)

```ts
const Color = data(() => ({
    Red: {},
    Green: {},
    Blue: {},

    toHex: fold({})({
        Red() { return '#FF0000'; },
        Green() { return '#00FF00'; },
        Blue() { return '#0000FF'; }
    })
}));

// Valid - only new variants (Yellow, Orange) need handlers
const ExtendedColor = data(() => ({
    [extend]: Color,
    Yellow: {},
    Orange: {},

    toHex: fold({})({
        Yellow() { return '#FFFF00'; },
        Orange() { return '#FFA500'; }
    })
}));
```

**When adding a new operation to an extended ADT**: All variants (parent + new) need handlers OR wildcard

```ts
// Runtime Error - Yellow and Orange handlers missing
const ExtendedColor = data(() => ({
    [extend]: Color,
    Yellow: {},
    Orange: {},

    toRGB: fold({})({
        Red() { return 'rgb(255,0,0)'; },
        Green() { return 'rgb(0,255,0)'; },
        Blue() { return 'rgb(0,0,255)'; }
        // Missing Yellow and Orange - will throw at runtime when encountered
    })
}));

// ExtendedColor.Yellow.toRGB throws: Error: No handler for variant 'Yellow' in operation 'toRGB'

// All 5 variants handled
const Complete = data(() => ({
    [extend]: Color,
    Yellow: {},
    Orange: {},

    toRGB: fold({})({
        Red() { return 'rgb(255,0,0)'; },
        Green() { return 'rgb(0,255,0)'; },
        Blue() { return 'rgb(0,0,255)'; },
        Yellow() { return 'rgb(255,255,0)'; },
        Orange() { return 'rgb(255,165,0)'; }
    })
}));

// Or use wildcard for unhandled variants
const WithWildcard = data(() => ({
    [extend]: Color,
    Yellow: {},
    Orange: {},

    toRGB: fold({})({
        Red() { return 'rgb(255,0,0)'; },
        Green() { return 'rgb(0,255,0)'; },
        Blue() { return 'rgb(0,0,255)'; },
        _() { return 'rgb(128,128,128)'; } // Handles Yellow, Orange
    })
}));
```

**Key points:**

- Without a wildcard `_`, **all variants must have handlers** (runtime throws error if handler missing)
- With a wildcard `_`, handlers are optional (wildcard catches unhandled cases at runtime)
- **Extending existing operations**: Only new variants need handlers (partial handlers allowed)
- **New operations on extended ADTs**: All variants (parent + new) need handlers OR wildcard
- Runtime validation: error thrown when a variant without a handler is encountered
- Extends to all variant types: simple enumerations, structured data, recursive ADTs, and extended ADTs

### Multiple Fold Operations

Define multiple fold operations inline as separate properties within the ADT declaration:

```ts
const Color = data(() => ({
    Red: {},
    Green: {},
    Blue: {},

    toHex: fold({})({
        Red() { return '#FF0000'; },
        Green() { return '#00FF00'; },
        Blue() { return '#0000FF'; }
    }),
    toRGB: fold({})({
        Red() { return 'rgb(255, 0, 0)'; },
        Green() { return 'rgb(0, 255, 0)'; },
        Blue() { return 'rgb(0, 0, 255)'; }
    })
}));

console.log(Color.Red.toHex); // '#FF0000'
console.log(Color.Red.toRGB); // 'rgb(255, 0, 0)'
```

### Structural Recursion (Catamorphisms)

For recursive ADTs, fold operations perform **catamorphisms** - structural recursion from leaves to root. The framework automatically recurses into `Family` fields, passing already-folded values to handlers.

```ts
const Peano = data(({ Family }) => ({
    Zero: {},
    Succ: { pred: Family },

    toValue: fold({})({
        Zero() { return 0; },
        Succ({ pred }) { return 1 + pred; }  // pred is already a Number
    })
}));

const three = Peano.Succ({ pred: Peano.Succ({ pred: Peano.Succ({ pred: Peano.Zero }) }) });
console.log(three.toValue); // 3

// For lists: accumulates bottom-up (Nil base case first, then each Cons from tail to head)
const List = data(({ Family }) => ({
    Nil: {},
    Cons: { head: Number, tail: Family },
    sum: fold({})({
        Nil() { return 0; },
        Cons({ head, tail }) { return head + tail; }  // tail is the sum of remaining elements
    })
}));

const list = List.Cons(1, List.Cons(2, List.Cons(3, List.Nil)));
console.log(list.sum); // 6 (1 + (2 + (3 + 0)))

// For trees: processes from leaves to root
const Tree = data(({ Family }) => ({
    Leaf: { value: Number },
    Node: { left: Family, right: Family, value: Number },
    sum: fold({ out: Number })({
        Leaf({ value }) { return value; },
        Node({ left, right, value }) { return left + right + value; }
    })
}));
```

### Parameterized Folds

Fold operations can accept a single input parameter, enabling operations like `append`, `insert`, or `map` that transform structures based on additional input.

**How parameterized folds differ from simple folds:**

In a **simple fold** (without parameter), `Family` fields are replaced with their already-computed folded values:

```ts
const List = data(({ Family }) => ({
    Nil: {},
    Cons: { head: Number, tail: Family },

    length: fold({})({
        Nil() { return 0; },
        Cons({ tail }) { return 1 + tail; }  // tail is a Number (already computed)
    })
}));
```

In a **parameterized fold** (with parameter), `Family` fields become **partially-applied functions** that accept the parameter:

```ts
const List = data(({ Family }) => ({
    Nil: {},
    Cons: { head: Number, tail: Family },

    append: fold({})({
        Nil({}, val) {
            return List.Cons(val, List.Nil);
        },
        Cons({ head, tail }, val) {
            // tail is a function: tail(val) continues the fold with the parameter
            return List.Cons(head, tail(val));
        }
    })
}));

const list = List.Cons(1, List.Cons(2, List.Nil));
const extended = list.append(3);
// Result: Cons(1, Cons(2, Cons(3, Nil)))
```

**Why the difference?**

Both traverse bottom-up (leaves to root), but:

- **Simple fold**: Eagerly computes values during traversal. By the time a handler runs, recursive fields contain final results.
- **Parameterized fold**: Delays computation until the parameter is provided. Recursive fields become functions that continue the fold when given the parameter.

The parameter is threaded through the entire structure, allowing each level to use it in its computation.

**Key points for parameterized folds:**

- Fold operations accept **at most one input parameter**
- **Getter vs method is determined by handler arity**: if any handler declares more than one argument (e.g., `Cons({ head, tail }, val)`), the fold is installed as an instance method; otherwise it is a getter. `spec.in` is *not* what controls this, it is optional and used only for documentation/type hints.
- For recursive ADTs, `Family` fields become **partially applied functions** that accept the input parameter
- Handler signature for singleton variants: `Variant({}, inputArg) => result`
- Handler signature for structured variants: `Variant({ field1, field2, ... }, inputArg) => result`
- **Wildcard handler signature**: `_(fields, inputArg) => result` (receives both fields and input parameter)
- The input parameter is threaded through all recursive calls automatically
- Both forms still process structures bottom-up (catamorphic recursion)

```ts
// Polymorphic fold for generic ADTs
const List = data(({ Family, T }) => ({
    Nil: {},
    Cons: { head: T, tail: Family },

    append: fold({ in: Object, out: Family })({
        Nil({}, val) {
            return List.Cons(val, List.Nil);
        },
        Cons({ head, tail }, val) {
            return List.Cons(head, tail(val));
        }
    })
}));

const NumList = List(Number);
const nums = NumList.Cons(1, NumList.Cons(2, NumList.Nil));
const result = nums.append(3);  // Returns NumList instance, not generic List
```

**Wildcard handlers with parameterized folds:**

```ts
const Color = data(() => ({
    Red: {},
    Green: {},
    Blue: {},

    matches: fold({ in: String, out: Boolean })({
        Red(text) { return text.toLowerCase() === 'red'; },
        _(fields, text) {
            return this.constructor.name.toLowerCase().includes(text.toLowerCase());
        }
    })
}));

console.log(Color.Red.matches('red'));    // true (specific handler)
console.log(Color.Green.matches('green')); // true (wildcard handler)
console.log(Color.Blue.matches('blue'));    // true (wildcard handler)
```

### Integration with ADT Extension

Operations defined on a base ADT are inherited by extended ADTs:

```ts
const Color = data(() => ({
    Red: {},
    Green: {},
    Blue: {},

    toHex: fold({})({
        Red() { return '#FF0000'; },
        Green() { return '#00FF00'; },
        Blue() { return '#0000FF'; }
    })
}));

const ExtendedColor = data(() => ({
    [extend]: Color,
    Yellow: {},
    Orange: {}
}));

// Inherited variants have the operation
console.log(ExtendedColor.Red.toHex); // '#FF0000'

// New variants without handlers throw error
ExtendedColor.Yellow.toHex; // ✗ Error: No handler for variant 'Yellow'
```

**Use wildcard for open extension:**

```ts
const Color = data(() => ({
    Red: {},
    Green: {},
    Blue: {},
    toHex: fold({})({
        Red() { return '#FF0000'; },
        _() { return '#UNKNOWN'; }
    })
}));

const ExtendedColor = data(() => ({
    [extend]: Color,
    Yellow: {},
    Orange: {}
}));

console.log(ExtendedColor.Red.toHex);    // '#FF0000'
console.log(ExtendedColor.Yellow.toHex); // '#UNKNOWN' (wildcard)
```

**Add operations to extended ADTs:**

```ts
const ExtendedColor = data(() => ({
    [extend]: Color,
    Yellow: {},
    Orange: {},

    isWarm: fold({})({
        Red() { return true; },
        Green() { return false; },
        Blue() { return false; },
        Yellow() { return true; },
        Orange() { return true; }
    })
}));

// Both operations available
console.log(ExtendedColor.Red.toHex);  // '#FF0000' (inherited)
console.log(ExtendedColor.Red.isWarm); // true (new operation)
console.log(ExtendedColor.Yellow.isWarm); // true
```

### Extending Fold Operations

When defining a fold operation in an extended ADT with the same name as a parent operation, extend mode is automatically activated with **polymorphic recursion**.

```ts
const Color = data(() => ({
    Red: {},
    Green: {},
    Blue: {},

    toHex: fold({})({
        Red() { return '#FF0000'; },
        Green() { return '#00FF00'; },
        Blue() { return '#0000FF'; }
    })
}));

// Extend mode auto-detected because parent has 'toHex' operation
const ExtendedColor = data(() => ({
    [extend]: Color,
    Yellow: {},
    Orange: {},

    toHex: fold({})({
        Yellow() { return '#FFFF00'; },
        Orange() { return '#FFA500'; }
    })
}));

// Inherited variants use parent handlers
console.log(ExtendedColor.Red.toHex); // '#FF0000'

// New variants use extended handlers
console.log(ExtendedColor.Yellow.toHex); // '#FFFF00'
```

**Override parent handlers:**

When extending an operation, you can override parent handlers while still accessing the parent's implementation. The `parent` symbol is a unique key that accesses the parent handler when used in the `this` context:

```ts
import { data, extend, fold, parent } from '@lapis-lang/lapis-js';

const ExtendedColor = data(() => ({
    [extend]: Color,
    Yellow: {},

    toHex: fold({})({
        Yellow() { return '#FFFF00'; },
        Red() {
            // this[parent]!() calls the parent's Red handler
            return this[parent]!().replace('FF', 'EE');
        }
    })
}));

console.log(ExtendedColor.Red.toHex); // '#EE0000' (overridden)
```

**Replacing parent handlers (ignoring parent):**

```ts
const ExtendedColor = data(() => ({
    [extend]: Color,
    Yellow: {},

    toHex: fold({})({
        Yellow() { return '#FFFF00'; },
        Red() { return '#EE0000'; } // Replace handler completely (no parent access)
    })
}));
```

**Wildcard inheritance:**

```ts
const Color = data(() => ({
    Red: {},
    Green: {},

    toHex: fold({})({
        Red() { return '#FF0000'; },
        _() { return '#UNKNOWN'; } // Wildcard for undefined variants
    })
}));

const ExtendedColor = data(() => ({
    [extend]: Color,
    Blue: {},
    // No toHex handler for Blue - inherits wildcard from parent
}));

console.log(ExtendedColor.Blue.toHex); // '#UNKNOWN' (wildcard from parent)
```

**Overriding wildcard handler:**

When you override a wildcard handler, it replaces the parent's wildcard handler completely:

```ts
const ExtendedColor = data(() => ({
    [extend]: Color,
    Blue: {},
    toHex: fold({})({
        _() {
            return `#EXTENDED-${this.constructor.name}`;
        }
    })
}));

console.log(ExtendedColor.Blue.toHex); // '#EXTENDED-Blue'
```

### Recursion and Stack Safety

Lapis JS provides **stack-safe structural recursion** through its fold mechanism, but it's important to understand what this means and what it doesn't cover.

#### What Lapis JS Provides: Structural Recursion

The library implements fold operations using **iterative post-order traversal** with an explicit work stack. This means that when you define a fold operation on a recursive ADT, the recursion through the data structure happens iteratively, not through JavaScript function calls:

```ts
const List = data(({ Family }) => ({
    Nil: {},
    Cons: { head: Number, tail: Family },
    sum: fold({ out: Number })({
        Nil() { return 0; },
        Cons({ head, tail }) { return head + tail; }
    })
}));

// This works for arbitrarily large lists without stack overflow
let bigList = List.Nil;
for (let i = 100000; i > 0; i--) {
    bigList = List.Cons(1, bigList);
}

console.log(bigList.sum); // 100000 - no stack overflow
```

The fold mechanism automatically:

- Traverses the structure from leaves to root
- Processes `Family` fields iteratively
- Passes already-computed values to handlers
- Avoids deep JavaScript call stacks

#### What Lapis JS Doesn't Provide: Tail-Call Optimization

JavaScript (outside of Safari/WebKit) does **not** provide tail-call optimization (TCO). This means:

**Regular recursive functions will still overflow:**

```ts
// This will overflow for large N - NOT recommended
function factorial(n) {
    if (n <= 1) return 1;
    return n * factorial(n - 1);  // Not tail-recursive
}

factorial(100000); // Stack overflow!
```

**Mutual recursion between operations is not optimized:**

```ts
// These would overflow for large N - NOT a library use case
function isEven(n) {
    if (n === 0) return true;
    return isOdd(n - 1);
}

function isOdd(n) {
    if (n === 0) return false;
    return isEven(n - 1);
}

isEven(100000); // Stack overflow!
```

#### The Lapis Approach: Structural Transformation

Instead of writing mutually recursive functions, express computations as **structural transformations** using fold:

```ts
// Idiomatic: single fold operation
const Peano = data(({ Family }) => ({
    Zero: {},
    Succ: { pred: Family },

    FromValue: unfold({ in: Number, out: Family })({
        Zero: (n) => (n <= 0 ? {} : null),
        Succ: (n) => (n > 0 ? { pred: n - 1 } : null)
    }),
    isEven: fold({ out: Boolean })({
        Zero() { return true; },
        Succ({ pred }) { return !pred; }  // pred is already a boolean
    })
}));

// Stack-safe for arbitrarily deep structures
const big = Peano.FromValue(100000);
console.log(big.isEven); // Works without overflow
```

### Polymorphic Recursion in Extended Folds

When extending fold operations on recursive ADTs, recursive calls use the **extended operation** with new handlers:

```ts
import { data, extend, fold } from '@lapis-lang/lapis-js';

const IntExpr = data(({ Family }) => ({
    IntLit: { value: Number },
    Add: { left: Family, right: Family },

    eval: fold({ out: Number })({
        IntLit({ value }) { return value; },
        Add({ left, right }) { return left + right; }
    })
}));

// Extend with multiplication - inherited Add works with new Mul
const ExtendedExpr = data(({ Family }) => ({
    [extend]: IntExpr,
    Mul: { left: Family, right: Family },
    eval: fold({ out: Number })({
        Mul({ left, right }) { return left * right; }
    })
}));

// Expression: (2 + 3) * 4
const product = ExtendedExpr.Mul({
    left: ExtendedExpr.Add({
        left: ExtendedExpr.IntLit({ value: 2 }),
        right: ExtendedExpr.IntLit({ value: 3 })
    }),
    right: ExtendedExpr.IntLit({ value: 4 })
});
console.log(product.eval); // 20
```

**Override parent handlers:**

```ts
import { data, extend, fold, parent } from '@lapis-lang/lapis-js';

const Peano = data(({ Family }) => ({
    Zero: {},
    Succ: { pred: Family },
    toValue: fold({ out: Number })({
        Zero() { return 0; },
        Succ({ pred }) { return 1 + pred; }
    })
}));

const ExtendedPeano = data(({ Family }) => ({
    [extend]: Peano,
    NegSucc: { pred: Family },
    toValue: fold({ out: Number })({
        NegSucc({ pred }) { return -1 + pred; },
        Succ() {
            const parentResult = this[parent]!() as number;
            return parentResult * 10;  // Override: scale by 10
        }
    })
}));

console.log(ExtendedPeano.Succ({ pred: ExtendedPeano.Zero }).toValue); // 10
console.log(Peano.Succ({ pred: Peano.Zero }).toValue); // 1 (original)
```

## Type Parameter Transformations with Map

Map operations transform type parameter values while preserving ADT structure. They are defined inline using `map(spec)(handlers)`:

```ts
const List = data(({ Family, T }) => ({
    Nil: {},
    Cons: { head: T, tail: Family(T) },
    increment: map({ out: Family })({ T: (x) => x + 1 }),
    stringify: map({ out: Family })({ T: (x) => String(x) })
}));

const list = List.Cons(1, List.Cons(2, List.Cons(3, List.Nil)));

const incremented = list.increment;
console.log(incremented.head); // 2 (structure preserved)

const strings = list.stringify;
console.log(typeof strings.head); // 'string' (type changed)

// Multiple type parameters
const Pair = data(({ T, U }) => ({
    MakePair: { first: T, second: U },
    transform: map({ out: Family })({
        T: (x) => x * 2,
        U: (s) => s.toUpperCase()
    })
}));

// Map with arguments
const List2 = data(({ Family, T }) => ({
    Nil: {},
    Cons: { head: T, tail: Family },
    scale: map({ out: Family })({ T: (x, factor) => x * factor })
}));

const scaled = list.scale(10); // All values multiplied by 10
```

## Unfold Operations (Corecursion/Anamorphisms)

Unfold operations (anamorphisms) generate ADT instances through corecursion — the dual of fold. Just as fold is the universal observation on a data type (every way of consuming an ADT factors through fold), unfold is the **universal generator** (every way of producing a recursive structure from a seed factors through unfold). Where fold replaces constructors with functions and accumulates bottom-up, unfold starts from a seed value and repeatedly decides which constructor to apply, building the structure top-down.

Unfolds are defined inline within the `data` or `behavior` declaration using `unfold(spec)(handlers)`. The `spec` argument is optional — see [Specs](#specs) for details. This co-locates type definitions with their constructors for clarity.

### Basic Unfold Operations

Each unfold handler inspects the seed value and decides whether to produce its variant. Handlers return either:

- An object `{ field: value, ... }` containing field values to construct that variant
- `null` to indicate the handler doesn't match (try next variant)

The first handler that returns a non-null object determines which variant gets constructed. For `Family` fields, the returned value becomes the seed for recursive unfolding.

```js
const List = data(({ Family }) => ({
    Nil: {},
    Cons: { head: Number, tail: Family },
    Range: unfold({ in: Number, out: Family })({
        Nil: (n) => (n <= 0 ? {} : null),  // Return {} to produce Nil when n <=> 0
        Cons: (n) => (n > 0 ? { head: n, tail: n - 1 } : null)  // Return fields for Cons, n-1 seeds tail
    })
}));

const countdown = List.Range(5);
// Creates: List.Cons(5, List.Cons(4, List.Cons(3, List.Cons(2, List.Cons(1, List.Nil)))))

// Works with parameterized ADTs - operations defined inline
const GenericList = data(({ Family, T }) => ({
    Nil: {},
    Cons: { head: T, tail: Family },
    // Unfold operation available on all instantiations
    Range: unfold({ in: Number, out: Family })({
        Nil: (n) => (n <= 0 ? {} : null),
        Cons: (n) => (n > 0 ? { head: n, tail: n - 1 } : null)
    })
}));

const NumList = GenericList(Number);

// Unfold operation available on all instantiations
const nums = NumList.Range(3);  // Works
const strs = GenericList(String).Range(3);  // Also works
```

### Binary Operations with Fold

Fold operations with parameterized input enable binary operations:

```ts
const Pair = data(({ T, U }) => ({
    MakePair: { first: T, second: U }
}));

const List = data(({ Family, T }) => ({
    Nil: {},
    Cons: { head: T, tail: Family(T) },
    zip: fold({})({
        Nil() { return Family(T).Nil; },
        Cons({ head, tail }, ys) {
            // If other list is empty, stop
            if (!ys || ys.constructor.name === 'Nil')
                return Family(T).Nil;

            const PairType = Pair(typeof head, typeof ys.head);
            return Family(T).Cons({
                head: PairType.MakePair({ first: head, second: ys.head }),
                tail: tail(ys.tail)  // tail is a partially applied function
            });
        }
    })
}));

// Instantiate types
const NumList = List(Number);
const StrList = List(String);

// Usage
const nums = NumList.Cons({ head: 1, tail: NumList.Cons({ head: 2, tail: NumList.Cons({ head: 3, tail: NumList.Nil }) }) });
const strs = StrList.Cons({ head: "a", tail: StrList.Cons({ head: "b", tail: StrList.Cons({ head: "c", tail: StrList.Nil }) }) });
const zipped = nums.zip(strs);

// zipped contains pairs: (1, "a"), (2, "b"), (3, "c")
```

## Merge Operations (Deforestation)

Merge operations compose multiple operations (fold, map, unfold) into a single fused operation, eliminating intermediate allocations. Since unfold is the universal way to generate structure and fold is the universal way to consume it, their composition (a hylomorphism) represents the general pattern of "generate then consume" — without materializing the intermediate data structure. They are defined inline using `merge(...operationNames)`:

### Recursion Schemes

| Scheme | Operations | Direction | Use Case |
| ------ | ----------- | ----------- | ----------- |
| **Catamorphism** | Fold operation | Bottom-up (leaves → root) | Consume/reduce structures |
| **Anamorphism** | Unfold operation | Top-down (seed → structure) | Generate/produce structures |
| **Hylomorphism** | Unfold + fold | Generate then consume | Transform without intermediate structure |
| **Paramorphism** | Fold (`this` context) | Bottom-up + substructure | Fold while retaining access to original substructures |
| **Prepromorphism** | Map + fold | Transform then consume | Apply type transformation before consuming |
| **Postpromorphism** | Unfold + map | Generate then transform | Apply type transformation after generating |

> **Paramorphisms via `this`:** In a fold handler, `this` is the raw original instance. Recursive `Family` fields in `foldedFields` carry the already-folded result, while `this.<field>` accesses the original substructure — giving you both at once, which is the defining characteristic of a paramorphism.

### Examples

**Hylomorphism — `List.Factorial`** (unfold → fold, no intermediate list):

```js
const List = data(({ Family }) => ({
    Nil: {},
    Cons: { head: Number, tail: Family },
    Range: unfold({ in: Number, out: Family })({
        Nil: (n) => (n <= 0 ? {} : null),
        Cons: (n) => (n > 0 ? { head: n, tail: n - 1 } : null)
    }),
    product: fold({ out: Number })({
        Nil() { return 1; },
        Cons({ head, tail }) { return head * tail; }
    }),
    Factorial: merge('Range', 'product')
}));

console.log(List.Factorial(5)); // 120 (5 * 4 * 3 * 2 * 1) - no intermediate list created
```

**All six schemes — `Stack`:**

A single Stack ADT can illustrate every recursion scheme in the table. Each operation is annotated with its corresponding scheme:

```js
const Stack = data(({ Family, T }) => ({
    Empty: {},
    Push: { value: T, rest: Family(T) },

    // Catamorphism: plain fold — consumes structure bottom-up
    size: fold({ out: Number })({
        Empty() { return 0; },
        Push({ rest }) { return 1 + rest; }
    }),

    // Paramorphism: fold using `this` to retain the original substructure.
    // `this.rest` is the original Stack; the folded `rest` field is not needed here.
    pop: fold({})({
        Empty() { return null; },
        Push() { return [this.value, this.rest]; }
    }),

    // Map step used in prepromorphism and postpromorphism below
    double: map({ out: Family })({ T: (x) => x * 2 }),

    // Fold step used in hylomorphism and prepromorphism below
    toArray: fold({ out: Array })({
        Empty() { return []; },
        Push({ value, rest }) { return [value, ...rest]; }
    }),

    // Anamorphism: unfold — generates a Stack top-down from an array seed
    FromArray: unfold({ in: Array, out: Family })({
        Empty: (arr) => (arr.length === 0 ? {} : null),
        Push: (arr) => (arr.length > 0 ? { value: arr[0], rest: arr.slice(1) } : null)
    }),

    // Hylomorphism: unfold + fold — build from array then immediately count,
    // no intermediate Stack allocated
    SizeOf: merge('FromArray', 'size'),

    // Prepromorphism: map + fold — double all values, then collect to array
    doubledArray: merge('double', 'toArray'),

    // Postpromorphism: unfold + map — build from array, then double all values
    DoubleFrom: merge('FromArray', 'double')
}));

const NumStack = Stack(Number);
const { Empty, Push } = NumStack;

const stack = Push({ value: 3, rest: Push({ value: 2, rest: Push({ value: 1, rest: Empty }) }) });

// Catamorphism
console.log(stack.size);                          // 3

// Paramorphism — returns [topValue, remainingStack] via this.rest (original substructure)
const [top, remaining] = stack.pop;
console.log(top);                                 // 3
console.log(remaining.size);                      // 2

// Anamorphism
const fromArr = NumStack.FromArray([10, 20, 30]);
console.log(fromArr.size);                        // 3

// Hylomorphism — array → Stack → size, no intermediate Stack retained
console.log(NumStack.SizeOf([10, 20, 30]));       // 3

// Prepromorphism — double values, then collect to array
console.log(stack.doubledArray);                  // [6, 4, 2]

// Postpromorphism — build from array with all values doubled
console.log(NumStack.DoubleFrom([1, 2, 3]).toArray); // [2, 4, 6]
```

**Composition rules:**

The merge operation validates composition to ensure correctness:

- Minimum 2 operations: At least two operations required for meaningful composition
- Maximum 1 unfold: At most one generator operation
- Maximum 1 fold: At most one consumption operation
- Any number of maps: Multiple transformations allowed
- Left-to-right composition: Operations applied in array order

```ts
// Valid compositions
Factorial:  merge('unfold1', 'fold1')            // hylomorphism
doubleSum:  merge('map1', 'fold1')               // paramorphism
generate:   merge('unfold1', 'map1')             // apomorphism
pipeline:   merge('map1', 'map2', 'fold1')       // multiple maps
full:       merge('unfold1', 'map1', 'fold1')    // full pipeline

// Invalid compositions (would throw errors)
// merge('fold1')                          // ✗ Error: need at least 2 operations
// merge()                                 // ✗ Error: empty array
// merge('unfold1', 'unfold2')             // ✗ Error: multiple unfolds
// merge('fold1', 'fold2')                 // ✗ Error: multiple folds
// merge('unfold1', 'unfold2', 'fold1')    // ✗ Error: multiple unfolds
```

**Naming Conventions:**

Merged operations follow specific naming rules:

- Static methods (with unfold): Must be PascalCase (e.g., `'Factorial'`, `'Range'`)
- Instance methods (without unfold): Must be camelCase (e.g., `'doubleSum'`, `'sumOfSquares'`)

## Behavior (Final Coalgebras)

Behavior types are the categorical dual of data (algebraic data types). Where data is defined by **constructors** (how to build it), behavior is defined by **observers** or **destructors** (how to observe it). Behavior types correspond formally to *final coalgebras* (νF) in category theory — the API uses `behavior()` because behavior types are defined by what they *do*, not what they *are*.

### Data vs Behavior

Data types (initial algebras) and behavior types (final coalgebras) are **dual** to each other. This duality is the organizing principle of Lapis:

- **Data** is defined by its constructors (variants) and is naturally open to new observations — you can always define new folds. Fold is the **universal observation**: every total function that consumes a data type and respects its structure is expressible as a fold.
- **Behavior** is defined by its observations (methods/projections) and is naturally open to new implementations — you can always define new generators. Unfold is the **universal generator**: every way of producing behavior from a seed is expressible as an unfold.

This asymmetry is sometimes called the **Expression Problem**: data makes adding observations easy but adding variants hard, while behavior makes adding implementations easy but adding observations hard. Lapis addresses both sides: `extend` allows new variants to be added to data types (with inherited and overridable operations), and coalgebraic behavior definitions allow new implementations of existing observation interfaces.

| Aspect | Data — Initial Algebra (μF) | Behavior — Final Coalgebra (νF) |
| --- | --- | --- |
| **Defined by** | Constructors (how to build) | Observers / Destructors (how to observe) |
| **Self-reference** | `Family` | `Self` |
| **Defined by** (closed by default) | Constructors (variants) | Observations (methods) |
| **Naturally open to** | New observations (folds) | New generators (unfolds) |
| **Extensible via** | `extend` (add variants + inherit ops) | New unfold implementations |
| **Universal arrow** | Fold (catamorphism) | Unfold (anamorphism) |
| **Direction** | Consumes structure bottom-up | Produces structure top-down |
| **Natural introduction** | Construction (calling constructors) | Unfold (anamorphism from seed) |
| **Natural elimination** | Fold (catamorphism) | Observation (accessing observers) |
| **Dual operation** | Unfold (build from seed) | Fold (bounded consumption) |
| **Structure** | Finite, inductive | Potentially infinite, coinductive |
| **Evaluation** | Eager (constructed fully, then frozen) | Lazy (observed on-demand via Proxy) |
| **Equality** | Structural (frozen objects) | Bisimulation (same observations) |
| **Example** | Lists, trees, Peano numbers | Streams, infinite sequences, state machines |

### Basic Behavior Declaration

Behavior types are defined using the `behavior()` function with a callback that receives `Self` (for continuations) and type parameters:

```js
import { behavior } from '@lapis-lang/lapis-js';

const Stream = behavior(({ Self, T }) => ({
    head: T,           // Simple observer: returns current value
    tail: Self(T)      // Continuation: returns next stream instance
}));
```

**Observer types:**

- **Simple observer** — `head: T` Returns a value of type T; installed as a getter
- **Parametric observer** — `nth: { in: Number, out: T }` Takes input, returns output; installed as a method
- **Continuation** — `tail: Self(T)` Returns the next behavior instance (lazy, memoized)
- **Parametric continuation** — `advance: { in: Number, out: Self }` Takes input, returns next behavior instance

**Naming conventions:**

| Element | Convention | Notes |
| --- | --- | --- |
| Observers | camelCase | Instance properties / methods |
| Unfold operations | PascalCase | Static factory methods |
| Fold operations | camelCase | Instance methods / getters |
| Map operations | camelCase | Instance methods / getters |
| Merge with unfold | PascalCase | Static method |
| Merge without unfold | camelCase | Instance method |

### Unfold Operations (Constructing Behavior)

Unfold operations define how to construct behavior instances from seed values. The unfold name becomes a static factory method (or getter if parameterless) on the behavior type.

```js
const Stream = behavior(({ Self, T }) => ({
    head: T,
    tail: Self(T),
    From: unfold({ in: Number, out: Self })({
        head: (n) => n,      // handler returns observer value
        tail: (n) => n + 1   // handler returns next seed
    })
}));

const nums = Stream.From(0);
console.log(nums.head);           // 0
console.log(nums.tail.head);      // 1
console.log(nums.tail.tail.head); // 2
```

**Handler signatures:**

- **Simple observers**: `(seed) => value`
- **Parametric observers**: `(seed) => (param) => value`
- **Continuations (`Self`)**: `(seed) => nextSeed` — the framework creates the next instance lazily

**Parameterless unfold (UAP):**

If `spec` has no `in` property (or `spec` is omitted entirely), the unfold is installed as a static getter:

```js
const Console = behavior(() => ({
    log: { in: String, out: undefined },
    Create: unfold({})({  // No spec — becomes getter, no runtime type checks
        log: () => (msg) => console.log(msg)
    })
}));

const io = Console.Create;  // getter — no parentheses
io.log('hello');
```

> **Note:** `out` in a behavior unfold `spec` is never validated at runtime — the framework constructs the behavior instance itself from the handler's returned seed, so the output type is guaranteed by construction, not by a value check. Only `in` matters for runtime type checking. Prefer omitting `spec` entirely when there is no `in` to validate.

### Multiple Unfold Constructors

Define multiple unfold operations to provide different ways to construct a behavior type:

```js
const Stream = behavior(({ Self, T }) => ({
    head: T,
    tail: Self(T),
    From: unfold({ in: Number, out: Self })({
        head: (n) => n,
        tail: (n) => n + 1
    }),
    Constant: unfold({ in: Number, out: Self })({
        head: (n) => n,
        tail: (n) => n          // Same seed = constant stream
    }),
    Fibonacci: unfold({ in: { a: Number, b: Number }, out: Self })({
        head: ({ a }) => a,
        tail: ({ a, b }) => ({ a: b, b: a + b })
    })
}));

const ones = Stream.Constant(1);
const fib  = Stream.Fibonacci({ a: 0, b: 1 });
```

### Parametric Observers

Observers can accept parameters:

```js
const Stream = behavior(({ Self, T }) => ({
    head: T,
    tail: Self(T),
    nth: { in: Number, out: T },
    From: unfold({ in: Number, out: Self })({
        head: (n) => n,
        tail: (n) => n + 1,
        nth: (n) => (index) => n + index
    })
}));

const nums = Stream.From(0);
console.log(nums.nth(5));   // 5
console.log(nums.nth(10));  // 10
```

### Lazy Evaluation and Memoization

Behavior instances use Proxy-based lazy evaluation:

- **Simple observers** — recomputed on each access (no memoization)
- **Parametric observers** — function wrapper is memoized
- **Continuations (`Self`)** — instances are memoized (same instance on repeated access)

```js
const stream = Stream.From(0);

const tail1 = stream.tail;
const tail2 = stream.tail;
console.log(tail1 === tail2);  // true — memoized

stream.head;  // computed
stream.head;  // computed again (no memoization for simple observers)
```

### Infinite Structures

Behavior naturally represents potentially infinite structures:

```js
// Infinite binary tree
const Tree = behavior(({ Self }) => ({
    value: Number,
    left: Self,
    right: Self,
    Create: unfold({ in: Number, out: Self })({
        value: (n) => n,
        left:  (n) => n * 2,
        right: (n) => n * 2 + 1
    })
}));

const tree = Tree.Create(1);
console.log(tree.value);           // 1
console.log(tree.left.value);      // 2
console.log(tree.right.value);     // 3
console.log(tree.left.left.value); // 4
```

### Fold Operations (Consuming Behavior)

Fold is the dual elimination operation for behavior. Where data fold dispatches on **which variant is present** (one handler per variant of a sum type), behavior fold receives **all observations simultaneously** (a single handler for the observation product). A fold drives observations top-down until the handler chooses not to recurse.

**Data fold vs Behavior fold:**

| | Data Fold | Behavior Fold |
|---|---|---|
| **Type structure** | Sum type — dispatch on variant | Product type — receive all observers |
| **Handlers** | Many (one per variant) | One (`_`) for the whole product |
| **Recursive fields** | Pre-folded by framework (bottom-up) | Exposed as fold functions (top-down) |
| **Base case** | A base-variant handler (e.g., `Nil`) | Not calling any continuation |
| **Direction** | Bottom-up (leaves → root) | Top-down (root → leaves, user-controlled) |

The `_` key is the sole canonical form — there is no per-observer alternative because behavior is a product type.

```js
const Stream = behavior(({ Self, T }) => ({
    head: T,
    tail: Self(T),
    From: unfold({ in: Number, out: Self })({
        head: (n) => n,
        tail: (n) => n + 1
    }),
    take: fold({ in: Number, out: Array })({
        //  observations ──┐  fold params ──┐
        _: ({ head, tail }, n) => n > 0 ? [head, ...tail(n - 1)] : []
        //  tail is a fold-function ──╯
    }),
    sum: fold({ in: Number, out: Number })({
        _: ({ head, tail }, n) => n > 0 ? head + tail(n - 1) : 0
    })
}));

const nums = Stream.From(0);
nums.take(5)  // [0, 1, 2, 3, 4]
nums.sum(5)   // 10  (0+1+2+3+4)
```

In the handler, `tail` is a **fold function** — calling `tail(n - 1)` recursively folds the continuation. Not calling it terminates the fold (the base case).

**Parameterless fold (UAP):**

When the `_` handler accepts only one argument (the observations object), the fold is installed as a getter. This mirrors the `data` fold rule; handler arity drives getter vs method; `spec.in` is optional.

```js
const Countdown = behavior(({ Self }) => ({
    value: Number,
    next: Self,
    done: Boolean,
    Create: unfold({ in: Number, out: Self })({
        value: (n) => n,
        next:  (n) => n - 1,
        done:  (n) => n <= 0
    }),
    collect: fold({ out: Array })({
        _: ({ value, next, done }) => done ? [] : [value, ...next()]
    })
}));

const cd = Countdown.Create(5);
cd.collect  // [5, 4, 3, 2, 1]  — getter via UAP
```

### Map (Lazy Type Transformation)

Map is the dual of data's map operation. Where data map eagerly reconstructs the entire structure O(n), behavior map is lazy — the transform is applied on-demand at observation time, O(1) to create.

Map propagates through continuations automatically: accessing a `Self` observer on a mapped instance returns another mapped instance with the same transform applied.

```js
const Stream = behavior(({ Self, T }) => ({
    head: T,
    tail: Self(T),
    From: unfold({ in: Number, out: Self })({
        head: (n) => n,
        tail: (n) => n + 1
    }),
    take: fold({ in: Number, out: Array })({
        _: ({ head, tail }, n) => n > 0 ? [head, ...tail(n - 1)] : []
    }),
    // Getter map — no extra args
    doubled: map({})({ T: (x) => x * 2 }),
    // Method map — extra args become method parameters
    apply: map({})({ T: (x, f) => f(x) })
}));

const nums = Stream.From(0);
nums.doubled.take(5)            // [0, 2, 4, 6, 8]  — lazy, O(1) to create
nums.apply(x => x * 3).take(5) // [0, 3, 6, 9, 12]
nums.doubled.doubled.take(4)    // [0, 4, 8, 12]     — chained maps
nums.take(5)                    // [0, 1, 2, 3, 4]   — original unaffected
```

**Key points:**

- No extra args → getter (e.g., `nums.doubled`)
- Extra args → method (e.g., `nums.apply(fn)`)
- Map creation is O(1) — no observation happens at map time
- Maps compose: `nums.doubled.doubled` = quadrupled
- Original instance is never mutated

### Merge (Deforestation)

Merge composes a pipeline of operations into a single named callable, eliminating intermediate behavior construction. The pipeline order is `unfold → map* → fold`.

**Naming follows its composition:**

- Includes an unfold → PascalCase, installed on the type (static)
- No unfold (map + fold only) → camelCase, installed on instances

```js
const Stream = behavior(({ Self, T }) => ({
    head: T,
    tail: Self(T),
    From: unfold({ in: Number, out: Self })({
        head: (n) => n,
        tail: (n) => n + 1
    }),
    doubled: map({})({ T: (x) => x * 2 }),
    take: fold({ in: Number, out: Array })({
        _: ({ head, tail }, n) => n > 0 ? [head, ...tail(n - 1)] : []
    }),
    sum: fold({ in: Number, out: Number })({
        _: ({ head, tail }, n) => n > 0 ? head + tail(n - 1) : 0
    }),
    // Static merge (includes unfold) — PascalCase, called on the type
    TakeDoubled: merge('From', 'doubled', 'take'),
    // Instance merge (no unfold) — camelCase, called on instances
    doubledSum: merge('doubled', 'sum')
}));

// Static — no intermediate stream created
Stream.TakeDoubled(0, 5)          // [0, 2, 4, 6, 8]

// Instance
Stream.From(0).doubledSum(5)      // 20  (0+2+4+6+8)

// Equivalent manual composition:
Stream.From(0).doubled.take(5)    // same as TakeDoubled(0, 5)
```

### Effect-like Behavior

Behavior with parametric observers can model effects like IO:

```js
const Console = behavior(({ Self }) => ({
    log: { in: String, out: undefined },
    read: { out: String },
    Create: unfold({ out: Self })({
        log: () => (msg) => { console.log(msg); },
        read: () => () => Promise.resolve('input')
    })
}));

const io = Console.Create;
io.log('Hello, world!');
const input = await io.read();
```

**Key points:**

- Behavior is defined by observers (destructors), not constructors
- Unfold operations are PascalCase static factory methods/getters
- Fold operations are camelCase instance methods/getters (single `_` handler receives the observation product)
- Map operations are camelCase; lazy — O(1) creation, transform applied at observation time
- Merge operations compose pipelines; naming follows whether an unfold is included
- Lazy evaluation via Proxy enables infinite structures with no up-front cost
- Continuations (`Self`) are memoized; simple observers are recomputed each access

**See also:**

- `examples/behavior-stream.mjs` - Comprehensive behavior examples

## References, Inspirations, and Further Reading

- [Algebraic Data Types in JavaScript (2008)](https://w3future.com/weblog/stories/2008/06/16/adtinjs.xml)
- [Brevity - Michael Haufe (2022)](https://github.com/mlhaufe/brevity)
- [From Object Algebras to Finally Tagless Interpreters - Oleksandr Manzyuk (2014)](https://web.archive.org/web/20181211210520/https://oleksandrmanzyuk.wordpress.com/2014/06/18/from-object-algebras-to-finally-tagless-interpreters-2/)
- [Extensibility for the Masses - Bruno C. d. S. Oliveira and William R. Cook (2012)](https://www.cs.utexas.edu/~wcook/Drafts/2012/ecoop2012.pdf)
