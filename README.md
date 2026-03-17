# Lapis JS

[![Build](https://github.com/lapis-lang/lapis-js/workflows/Build/badge.svg?branch=master)](https://github.com/lapis-lang/lapis-js/actions?query=workflow%3ABuild%2FRelease)
[![npm version](https://badge.fury.io/js/%40lapis-lang%2Flapis-js.svg)](https://www.npmjs.com/package/@lapis-lang/lapis-js)
[![Downloads](https://img.shields.io/npm/dm/@lapis-lang/lapis-js.svg)](https://www.npmjs.com/package/@lapis-lang/lapis-js)

Lapis JS is an embedded DSL for experimentation of the semantics for the upcoming Lapis programming language.
This is best described informally as a programming language with support for Algebraic Data Types, Subtyping, Behavior types, Protocols, and Contracts. (In category-theoretic terms, Lapis is bialgebraic: ADTs are initial algebras and behaviors are final coalgebras.)

This should feel familiar to users of functional programming languages like Haskell, OCaml, F#, and Scala, but here
there is an emphasis on the Bird-Meertens Formalism (BMF) (Squiggol) of making programs by combining data and behavior through folds and unfolds (and their various duals and combinations).

## Table of Contents

- [Installation](#installation)
- [Algebraic Data Types](#algebraic-data-types)
  - [Simple Enumerated Types](#simple-enumerated-types)
  - [Structured Data](#structured-data)
  - [Guards and Validation](#guards-and-validation)
  - [Invariants](#invariants)
- [Parameterized and Recursive ADTs](#parameterized-and-recursive-adts)
- [ADT Extension (Subtyping)](#adt-extension-subtyping)
  - [Extending recursive ADTs](#extending-recursive-adts)
- [Multi-Sorted Algebras](#multi-sorted-algebras)
  - [Declaring Multi-Sorted ADTs](#declaring-multi-sorted-adts)
  - [Sort-Typed Field Validation](#sort-typed-field-validation)
  - [Sort Reflection](#sort-reflection)
  - [Folds on Multi-Sorted ADTs](#folds-on-multi-sorted-adts)
  - [Extending Multi-Sorted ADTs](#extending-multi-sorted-adts)
- [Fold Operations](#fold-operations)
  - [Basic Fold Operations](#basic-fold-operations)
  - [Specs](#specs)
  - [Uniform Access Principle](#uniform-access-principle)
  - [Fold on Structured Variants](#fold-on-structured-variants)
  - [Wildcard Handlers](#wildcard-handlers)
  - [Exhaustiveness Checking](#exhaustiveness-checking)
  - [Multiple Fold Operations](#multiple-fold-operations)
  - [Structural Recursion](#structural-recursion)
  - [Parameterized Folds](#parameterized-folds)
  - [Course-of-Values Recursion (Histomorphisms)](#course-of-values-recursion-histomorphisms)
  - [Auxiliary Folds (Zygomorphisms)](#auxiliary-folds-zygomorphisms)
  - [Integration with ADT Extension](#integration-with-adt-extension)
  - [Extending Fold Operations](#extending-fold-operations)
  - [Recursion and Stack Safety](#recursion-and-stack-safety)
  - [Circular Fold Protection](#circular-fold-protection)
  - [Polymorphic Recursion in Extended Folds](#polymorphic-recursion-in-extended-folds)
- [Type Parameter Transformations with Map](#type-parameter-transformations-with-map)
  - [Invertible Maps (Allegories)](#invertible-maps-allegories)
- [Unfold Operations (Corecursion)](#unfold-operations-corecursion)
  - [Basic Unfold Operations](#basic-unfold-operations)
  - [Binary Operations with Fold](#binary-operations-with-fold)
- [Merge Operations (Deforestation)](#merge-operations-deforestation)
  - [Recursion Schemes](#recursion-schemes)
- [Behavior](#behavior)
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
- [Relation (Relational Operations on Data)](#relation-relational-operations-on-data)
  - [Relation Declaration](#relation-declaration)
  - [Auto-Generated Operations](#auto-generated-operations)
  - [Join Invariant (Auto-Generated)](#join-invariant-auto-generated)
  - [Logic Programming Interpretation (Relation)](#logic-programming-interpretation-relation)
  - [Complete Example: Ancestor Relation](#complete-example-ancestor-relation)
  - [Cycle Handling](#cycle-handling)
- [Observer (Stepwise Exploration on Behavior)](#observer-stepwise-exploration-on-behavior)
  - [Observer Declaration](#observer-declaration)
  - [Auto-Generated Operation: `explore(seed, options?)`](#auto-generated-operation-exploreseed-options)
  - [Complete Example: Graph Path Finder](#complete-example-graph-path-finder)
  - [Relation vs Observer: When to Use Which](#relation-vs-observer-when-to-use-which)
  - [Logic Programming Interpretation (Observer)](#logic-programming-interpretation-observer)
- [Design by Contract](#design-by-contract)
  - [Assertions](#assertions)
  - [Implies](#implies)
  - [Iff](#iff)
  - [Demands (Preconditions)](#demands-preconditions)
  - [Ensures (Postconditions)](#ensures-postconditions)
  - [Rescue (Structured Recovery)](#rescue-structured-recovery)
  - [Continuous Invariants](#continuous-invariants)
  - [Subcontracting](#subcontracting)
  - [The Order of Assertions](#the-order-of-assertions)
  - [Contracts on Behavior (Codata)](#contracts-on-behavior-codata)
- [IO (Effects and the Mealy Machine)](#io-effects-and-the-mealy-machine)
  - [What is a Mealy Machine?](#what-is-a-mealy-machine)
  - [Sync Program, Async Runtime](#sync-program-async-runtime)
  - [IORequest and IOResponse](#iorequest-and-ioresponse)
  - [Building an IO Program](#building-an-io-program)
  - [The IO Loop](#the-io-loop)
  - [Running a Program](#running-a-program)
  - [Contracts on IO](#contracts-on-io)
  - [Event Handling (Listen, Subscribe, AwaitEvent)](#event-handling-listen-subscribe-awaitevent)
- [Module System](#module-system)
  - [Defining a Module](#defining-a-module)
  - [Module Contracts](#module-contracts)
  - [Module Extension with `[extend]`](#module-extension-with-extend)
  - [Contract Subcontracting in Modules](#contract-subcontracting-in-modules)
  - [system() — Programs as Mealy Machines](#system--programs-as-mealy-machines)
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

## Algebraic Data Types

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

For parameterized ADTs, type parameter names are single uppercase letters (`A`–`Z`). This restriction enables full compile-time type propagation: when you instantiate a parameterized ADT with concrete types, TypeScript correctly resolves field types:

```ts
const Pair = data(({ T, U }) => ({
    MakePair: { first: T, second: U }
}));

const numStrPair = Pair({ T: Number, U: String });

const pair = numStrPair.MakePair({ first: 42, second: 'hello' });

console.log(pair.first);  // 42
console.log(pair.second); // 'hello'

numStrPair.MakePair('bad', 100); // Throws TypeError at runtime
```

When using the object form of type instantiation, TypeScript propagates type arguments at the type level:

```ts
const Dictionary = data(({ K, V }) => ({
    Empty: {},
    Entry: { key: K, value: V }
}));

const StrNumDict = Dictionary({ K: String, V: Number });
// entry.key is typed as `string`, entry.value as `number`
const entry = StrNumDict.Entry({ key: 'age', value: 30 });
```

> **Note:** `Family` (in `data()` declarations) and `Self` (in `behavior()` declarations) are reserved names and cannot be used as type parameter names.

Recursive parameterized ADTs can combine `Family` and type parameters:

```ts
const List = data(({ Family, T }) => ({
    Nil: {},
    Cons: { head: T, tail: Family(T) }
}));

const {Cons, Nil} = List({ T: Number });

const nums = Cons({ head: 1, tail: Cons({ head: 2, tail: Cons({ head: 3, tail: Nil }) }) });
console.log(nums.head);         // 1
console.log(nums.tail.head);    // 2

const badList = Cons({ head: 'bad', tail: Nil }); // Throws TypeError at runtime
```

Type instantiation must use the object form (`List({ T: Number })`), which maps parameter names to concrete types.

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

## Multi-Sorted Algebras

A standard (single-sorted) ADT has one carrier type — every constructor produces values of the same sort, and every fold handler returns the same result type. Some domains, however, require **multiple syntactic sorts** within a single ADT. An expression language, for example, may distinguish *expressions* from *statements* — each sort gets its own carrier type in a fold.

Multi-sorted algebras add **sort parameters** (`$A`–`$Z`) alongside the existing type parameters (`A`–`Z`) and self-reference (`Family`). Import the `sort` and `isSort` symbols:

```ts
import { data, fold, sort, isSort } from '@lapis-lang/lapis-js';
```

| Category | Syntax | Example | Bound when |
| --- | --- | --- | --- |
| Self-reference | `Family` | `tail: Family` | Always (the ADT itself) |
| Type parameter | `A`–`Z` | `head: T` | At instantiation: `List({T: Number})` |
| Sort parameter | `$A`–`$Z` | `left: $E` | At fold definition |

### Declaring Multi-Sorted ADTs

Sort parameters are destructured from the callback parameter alongside `Family` and type parameters. Each variant declares its sort using the `[sort]` symbol:

```ts
const Lang = data(({ $E, $S }) => ({
    // Exp sort
    Lit:    { [sort]: $E, value: Number },
    Add:    { [sort]: $E, left: $E, right: $E },
    // Stmt sort
    Assign: { [sort]: $S, name: String, expr: $E },
    Seq:    { [sort]: $S, first: $S, second: $S }
}));

const lit5 = Lang.Lit(5);
const lit3 = Lang.Lit(3);
const sum  = Lang.Add(lit5, lit3);
const assign = Lang.Assign('x', sum);
const seq  = Lang.Seq(assign, Lang.Assign('y', Lang.Lit(1)));
```

**`[sort]` annotation rules:**

- **Optional when single-sorted:** If only one sort parameter is used (e.g., only `$E`), the annotation is optional — all variants are inferred to belong to that single sort.
- **Required when multi-sorted:** If two or more sort parameters appear, every variant MUST have a `[sort]` annotation. Missing annotations throw an error.
- **Not present = single-sorted (backward compatible):** ADTs that don't destructure any `$`-prefixed names work exactly as before. `Family` remains the sole recursion marker.

Single-sorted example without explicit `[sort]`:

```ts
const Nat = data(({ $N }) => ({
    Zero: {},
    Succ: { pred: $N },
    toNum: fold({ out: Number })({
        Zero() { return 0; },
        Succ({ pred }) { return 1 + pred; }
    })
}));

const two = Nat.Succ(Nat.Succ(Nat.Zero));
console.log(two.toNum); // 2
```

### Sort-Typed Field Validation

Sort parameters serve double duty as both `[sort]` annotation values and **field type guards**. At construction time, the framework validates that sort-typed fields receive values of the correct sort:

```ts
const Lang = data(({ $E, $S }) => ({
    Lit:    { [sort]: $E, value: Number },
    Add:    { [sort]: $E, left: $E, right: $E },
    Assign: { [sort]: $S, name: String, expr: $E },
    Seq:    { [sort]: $S, first: $S, second: $S }
}));

// Assign.expr expects $E — Lit is $E, so this works:
Lang.Assign('x', Lang.Lit(1)); // OK

// Seq expects $S fields — passing a $E value throws:
Lang.Seq(Lang.Lit(1), Lang.Assign('x', Lang.Lit(2)));
// TypeError: Field 'first' expected a variant of sort '$S', but got sort '$E'
```

`Family`-typed fields impose no sort restriction — they accept any variant regardless of sort.

### Sort Reflection

The `[isSort]` symbol on a multi-sorted ADT checks sort membership at runtime:

```ts
const lit = Lang.Lit(42);
const assign = Lang.Assign('x', lit);

Lang[isSort](lit, '$E');     // true
Lang[isSort](lit, '$S');     // false
Lang[isSort](assign, '$S');  // true
Lang[isSort](assign, '$E');  // false
```

### Folds on Multi-Sorted ADTs

#### Sort-erasing folds

A fold with a plain `out` spec collapses all sorts to a single carrier type — the same as standard single-sorted folds:

```ts
const Lang = data(({ $E, $S }) => ({
    Lit:    { [sort]: $E, value: Number },
    Add:    { [sort]: $E, left: $E, right: $E },
    Assign: { [sort]: $S, name: String, expr: $E },
    Seq:    { [sort]: $S, first: $S, second: $S },

    pretty: fold({ out: String })({
        Lit({ value }) { return String(value); },
        Add({ left, right }) { return `(${left} + ${right})`; },
        Assign({ name, expr }) { return `${name} = ${expr}`; },
        Seq({ first, second }) { return `${first}; ${second}`; }
    })
}));

const program = Lang.Seq(
    Lang.Assign('x', Lang.Add(Lang.Lit(1), Lang.Lit(2))),
    Lang.Assign('y', Lang.Lit(42))
);

console.log(program.pretty); // 'x = (1 + 2); y = 42'
```

Sort-typed fields are structurally recursive — inside handlers, `left`, `right`, `expr`, `first`, and `second` are already folded to their carrier values (strings in this case).

#### Per-sort carrier folds

When each sort needs a distinct carrier type, pass an object keyed by sort parameter names as the `out` value:

```ts
eval: fold({ out: { $E: Number, $S: undefined } })({
    Lit({ value })         { return value; },
    Add({ left, right })   { return left + right; },
    Assign({ name, expr }) { console.log(`${name} = ${expr}`); },
    Seq({ first, second }) { first; second; }
})
```

Inside handlers, sort-typed fields are folded to their sort's carrier: the `Add` handler receives `left` and `right` as numbers (the `$E` carrier), and the `Seq` handler receives `first` and `second` as `undefined` (the `$S` carrier).

If `out` is an object with sort-name keys, ALL declared sort names must be present.

### Extending Multi-Sorted ADTs

Multi-sorted ADTs can be extended with `[extend]`, just like single-sorted ADTs. Sort identity is matched by name — parent's `$E` and child's `$E` are the same sort:

```ts
const BaseLang = data(({ $E, $S }) => ({
    Lit:    { [sort]: $E, value: Number },
    Add:    { [sort]: $E, left: $E, right: $E },
    Assign: { [sort]: $S, name: String, expr: $E },

    pretty: fold({ out: String })({
        Lit({ value }) { return String(value); },
        Add({ left, right }) { return `(${left} + ${right})`; },
        Assign({ name, expr }) { return `${name} = ${expr}`; }
    })
}));

const ExtLang = data(({ $E, $S }) => ({
    [extend]: BaseLang,
    Mul:  { [sort]: $E, left: $E, right: $E },
    Seq:  { [sort]: $S, first: $S, second: $S },

    pretty: fold({ out: String })({
        Mul({ left, right }) { return `(${left} * ${right})`; },
        Seq({ first, second }) { return `${first}; ${second}`; }
    })
}));

const program = ExtLang.Seq(
    ExtLang.Assign('x', ExtLang.Mul(ExtLang.Lit(2), ExtLang.Lit(3))),
    ExtLang.Assign('y', ExtLang.Add(ExtLang.Lit(1), ExtLang.Lit(1)))
);

console.log(program.pretty); // 'x = (2 * 3); y = (1 + 1)'
```

**Key points:**

- Inherited variants keep their parent sort assignment
- The child can introduce sort parameters not present in the parent
- The child's sort set is the union of parent's and child's sorts
- Fold handlers are inherited from the parent; the child only provides handlers for new variants
- `[isSort]` works on inherited variants: `ExtLang[isSort](ExtLang.Lit(42), '$E')` returns `true`

## Fold Operations

A fold is the **universal observation** on an algebraic data type: every total function that consumes an ADT and respects its algebraic structure is expressible as a fold. A fold replaces each constructor with a corresponding handler function, then evaluates bottom-up from leaves to root. (This is called a *catamorphism* in the recursion-schemes literature.)

```text
Tree: Node(Leaf(1), Node(Leaf(2), Leaf(3)))

       Node                  g
      /    \              /     \
    Leaf   Node   ->     h       g
     |    /    \         |     /   \
     1  Leaf  Leaf       1    h     h
         |     |              |     |
         2     3              2     3

= g(h(1), g(h(2), h(3)))
```

The result has the same shape as the input — only the constructor labels change.

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

- `in`: The input guard for parameters: validated at runtime for both fold and unfold operations
- `out`: The return guard: **only validated at runtime for fold operations**; on unfold operations it carries no runtime enforcement

**Why `out` is not checked on unfold:** fold handlers are *user code* that returns a value: the framework validates it against `out` because the handler could return the wrong type. Unfold handlers, by contrast, never return the ADT/behavior instance directly; they return either `null` or a plain fields object (e.g. `{ head: n, tail: n-1 }`), and the framework constructs the actual output instance itself. The output type is therefore a structural guarantee enforced by construction, not something a handler can violate. Stating `out: Family` or `out: Self` on an unfold is documentation of intent only.

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

### Structural Recursion

For recursive ADTs, fold operations perform **structural recursion** from leaves to root (also known as *catamorphisms*). The framework automatically recurses into `Family` fields, passing already-folded values to handlers.

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

const NumList = List({ T: Number });
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

### Course-of-Values Recursion (Histomorphisms)

A **course-of-values fold** (also called a *histomorphism*) extends a regular fold by giving each handler access to the already-folded sub-results of all recursive children: not just the immediate fold result, but the entire "course of values" down the recursion.

Enable course-of-values recursion by adding `history: true` to the fold spec. Import the `history` symbol and destructure `[history]` from the fold argument to access an object keyed by recursive field names:

```ts
import { data, fold, history } from '@lapis-lang/lapis-js';

const Nat = data(({ Family }) => ({
    Zero: {},
    Succ: { pred: Family },
    fib: fold({ history: true, out: Number })({
        Zero() { return 0; },
        Succ({ pred, [history]: h }) {
            // pred  = fib(n-1) - the immediate fold result (standard fold)
            // h.pred = the child's foldedFields object
            // h.pred.pred = fib(n-2) - the grandchild's fold result
            const fibN2 = h.pred?.pred;
            return fibN2 !== undefined ? pred + fibN2 : 1;
        }
    })
}));

Nat.Succ({ pred: Nat.Succ({ pred: Nat.Succ({ pred:
    Nat.Succ({ pred: Nat.Succ({ pred: Nat.Zero }) }) }) }) }).fib
// → 5 (fibonacci of 5)
```

Each entry in the `[history]` object is the child's own `foldedFields`, which itself carries a `[history]`: forming a chain that lets you look back arbitrarily far:

```ts
// In a Succ handler for fib(5):
// pred            → fib(4) = 3
// h.pred.pred     → fib(3) = 2
// h.pred[history].pred.pred → fib(2) = 1
```

For **base-case variants** (no recursive fields), `[history]` is an empty object `{}`.

Histomorphisms also work with **binary trees**, where history provides access to both children:

```ts
const Tree = data(({ Family }) => ({
    Leaf: { value: Number },
    Node: { left: Family, right: Family },
    sumHisto: fold({ history: true, out: Number })({
        Leaf({ value }) { return value; },
        Node({ left, right, [history]: h }) {
            // h.left and h.right are the children's foldedFields
            return left + right;
        }
    })
}));
```

Histomorphisms work with **parameterized folds** too: history entries become lazy getters that resolve after the child thunk is invoked:

```ts
const List = data(({ Family }) => ({
    Nil: {},
    Cons: { head: Number, tail: Family },
    scan: fold({ history: true, in: Number, out: Array })({
        Nil() { return []; },
        Cons({ head, tail, [history]: h }, limit) {
            return [head, ...tail(limit)];
        }
    })
}));
```

Course-of-values recursion is supported on both **Data** and **Behavior** types. For behavior folds, `[history]` provides lazy access to the sub-observations of continuation fields.

### Auxiliary Folds (Zygomorphisms)

An **auxiliary fold** (also called a *zygomorphism*) fuses two (or more) folds into a single traversal. The primary fold has access to the results of one or more *auxiliary* folds at every recursive position, without requiring a separate pass over the structure.

Enable auxiliary folds by adding `aux` to the fold spec. Import the `aux` symbol and destructure `[aux]` from the fold argument:

**String form**: a single auxiliary fold produces a *flat* shape keyed by recursive field names:

```ts
import { data, fold, aux } from '@lapis-lang/lapis-js';

const Tree = data(({ Family }) => ({
    Leaf: { value: Number },
    Node: { left: Family, right: Family },
    depth: fold({ out: Number })({
        Leaf() { return 0; },
        Node({ left, right }) { return 1 + Math.max(left, right); }
    }),
    isBalanced: fold({ aux: 'depth', out: Boolean })({
        Leaf() { return true; },
        Node({ left, right, [aux]: a }) {
            // left, right = isBalanced results of children (standard fold)
            // a.left     = depth of left child  (auxiliary fold result)
            // a.right    = depth of right child
            return left && right && Math.abs(a.left - a.right) <= 1;
        }
    })
}));
```

**Array form**: multiple auxiliary folds produce a *nested* shape `a.<foldName>.<fieldName>`:

```ts
const Tree = data(({ Family }) => ({
    Leaf: { value: Number },
    Node: { left: Family, right: Family },
    depth: fold({ out: Number })({ /* … */ }),
    size:  fold({ out: Number })({ /* … */ }),
    info: fold({ aux: ['depth', 'size'], out: String })({
        Leaf() { return 'leaf'; },
        Node({ [aux]: a }) {
            // a.depth.left, a.depth.right - depth of each child
            // a.size.left,  a.size.right  - size of each child
            return `d:${a.depth.left}/${a.depth.right} s:${a.size.left}/${a.size.right}`;
        }
    })
}));
```

For **base-case variants** (no recursive fields), `[aux]` is an empty object `{}` (string form) or an object with empty nested objects (array form).

Auxiliary folds can be **combined with course-of-values recursion**: use both `history: true` and `aux` in the same fold spec to access both sub-result history and auxiliary fold results simultaneously.

Auxiliary folds are supported on both **Data** and **Behavior** types. For behavior folds with parameterized auxiliary folds, `[aux]` entries are functions that accept the auxiliary fold's parameters.

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

### Circular Fold Protection

Lapis JS enforces a **re-entrancy guard** that prevents a fold operation from being invoked on the same instance during its own evaluation. This catches the class of bugs where `this.sameOp` creates infinite recursion:

```ts
const List = data(({ Family }) => ({
    Nil: {},
    Cons: { head: Number, tail: Family },

    // ✗ This will throw at runtime - circular fold
    bad: fold({ out: Number })({
        Nil() { return 0; },
        Cons({ head }) {
            return head + this.bad;  // re-enters same fold on same node!
        }
    }),

    // ✓ Correct: use destructured `tail` (already-folded value)
    sum: fold({ out: Number })({
        Nil() { return 0; },
        Cons({ head, tail }) {
            return head + tail;
        }
    })
}));

const list = List.Cons(1, List.Cons(2, List.Nil));
list.bad;  // Error: Circular fold detected: operation 'bad' re-entered
           //        on the same instance during its own evaluation.
           //        Use destructured fields for structural recursion
           //        instead of `this.bad`.
list.sum;  // 3 - works correctly
```

The guard also catches **mutual recursion** cycles where two operations call each other on the same node:

```ts
// ✗ opA → opB → opA on same instance - detected and throws
const List = data(({ Family }) => ({
    Nil: {},
    Cons: { head: Number, tail: Family },
    opA: fold({ out: Number })({
        Nil() { return 0; },
        Cons() { return this.opB; }
    }),
    opB: fold({ out: Number })({
        Nil() { return 0; },
        Cons() { return this.opA; }  // triggers opA's guard
    })
}));
```

The following patterns remain valid and are **not** affected by the guard:

| Pattern | Valid? | Reason |
| ------- | ------ | ------ |
| `fields.tail` (destructured) | ✓ | Structural recursion: always terminates |
| `this.differentOp` | ✓ | Independent fold on same node: separate guard |
| `this.childField.sameOp` | ✓ | Same operation on a smaller substructure |
| `this.nonRecursiveField` | ✓ | Data access, no recursion |
| `this.sameOp` | ✗ | Re-enters same fold on same instance |
| `this.opA` → `this.opB` → `this.opA` | ✗ | Mutual cycle on same instance |

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

### Invertible Maps (Allegories)

Two map operations can be declared as inverses of each other using the `inverse` spec property. This establishes a bijective (one-to-one) relationship: applying the forward map followed by its inverse is the identity.

```ts
const TempList = data(({ Family, T }) => ({
    Nil: {},
    Cons: { head: T, tail: Family(T) },

    // Celsius → Fahrenheit
    toFahrenheit: map({ out: Family })({ T: (c) => c * 9 / 5 + 32 }),

    // Fahrenheit → Celsius (declared as inverse of toFahrenheit)
    toCelsius: map({ out: Family, inverse: 'toFahrenheit' })({
        T: (f) => (f - 32) * 5 / 9
    })
}));

const Temps = TempList({ T: Number });
const readings = Temps.Cons(0, Temps.Cons(100, Temps.Nil));

readings.toFahrenheit;                // [32, 212]
readings.toFahrenheit.toCelsius;      // [0, 100] — round-trip identity
```

The declaration is **one-sided**: only the inverse operation declares the relationship via `inverse: 'forwardOpName'`. The system registers the link bidirectionally. A strict **1:1 constraint** is enforced — each operation may have at most one inverse. Attempting to declare a second inverse for the same operation throws a `TypeError`.

#### Constructor-Time Fusion

`merge` pipelines are automatically optimized at definition time through three fusion rules applied in sequence:

**1. Inverse pair elimination (f° ∘ f = id)**

Consecutive inverse pairs are removed. This is applied repeatedly so nested pairs (e.g., `['a', 'b', 'b_inv', 'a_inv']`) are fully eliminated.

**2. Map-map fusion (g ∘ f in a single traversal)**

Consecutive getter-map operations are composed into a single map whose per-parameter transform is the pipeline composition of each individual transform. This eliminates intermediate structures between adjacent maps.

**3. Map-fold fusion (fold with f pre-applied)**

A map getter immediately before a fold is fused: the fold pre-applies the map transforms to type-parameter fields, eliminating the intermediate mapped structure entirely.

```ts
const List = data(({ Family, T }) => ({
    Nil: {},
    Cons: { head: T, tail: Family(T) },

    double:    map({ out: Family })({ T: (x) => x * 2 }),
    halve:     map({ out: Family, inverse: 'double' })({ T: (x) => x / 2 }),
    increment: map({ out: Family })({ T: (x) => x + 1 }),

    sum: fold({ out: Number })({
        Nil()              { return 0; },
        Cons({ head, tail }) { return head + tail; }
    }),

    // Inverse elimination: double → halve cancels → [increment]
    pipeline: merge('double', 'halve', 'increment'),

    // Map-map fusion: double → increment → single map (2x + 1)
    doubleThenInc: merge('double', 'increment'),

    // Map-fold fusion: double → sum → single fold (no intermediate)
    doubledSum: merge('double', 'sum'),

    // Combined: double → halve → increment → double → sum
    //   inverses cancel → [increment, double, sum]
    //   map-map fuses   → [fusedMap, sum]
    //   map-fold fuses  → single fold
    combined: merge('double', 'halve', 'increment', 'double', 'sum')
}));
```

Non-adjacent inverse pairs (e.g., `['a', 'c', 'a_inv']`) are preserved — only consecutive pairs are fused. Map operations with extra parameters (non-getters) are not eligible for map-map or map-fold fusion.

## Unfold Operations (Corecursion)

Unfold operations generate ADT instances through corecursion — the dual of fold. (In the recursion-schemes literature, an unfold is called an *anamorphism*.) Just as fold is the universal observation on a data type (every way of consuming an ADT factors through fold), unfold is the **universal generator** (every way of producing a recursive structure from a seed factors through unfold). Where fold replaces constructors with handler functions, unfold does the reverse: a decision function examines each seed and chooses which constructor to produce, building the structure top-down.

```text
Unfold: seed [1,2,3] → Tree

        p                  Node
      /   \              /     \
    p       p    ->    Leaf    Node
    |     /   \         |    /    \
    1    p     p        1  Leaf  Leaf
         |     |             |     |
         2     3             2     3

p([1,2,3]) → Node, seeds [1] and [2,3]
p([1])     → Leaf(1)
p([2,3])   → Node, seeds [2] and [3]
```

Compare with the fold diagram: fold replaces constructor labels with functions (left → right); unfold replaces decision functions with constructor labels (left → right).

Unfolds are defined inline within the `data` or `behavior` declaration using `unfold(spec)(handlers)`. The `spec` argument is optional: see [Specs](#specs) for details. This co-locates type definitions with their constructors for clarity.

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

const NumList = GenericList({ T: Number });

// Unfold operation available on all instantiations
const nums = NumList.Range(3);  // Works
const strs = GenericList({ T: String }).Range(3);  // Also works
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

            const PairType = Pair({ T: Number, U: String });
            return Family(T).Cons({
                head: PairType.MakePair({ first: head, second: ys.head }),
                tail: tail(ys.tail)  // tail is a partially applied function
            });
        }
    })
}));

// Instantiate types
const NumList = List({ T: Number });
const StrList = List({ T: String });

// Usage
const nums = NumList.Cons({ head: 1, tail: NumList.Cons({ head: 2, tail: NumList.Cons({ head: 3, tail: NumList.Nil }) }) });
const strs = StrList.Cons({ head: "a", tail: StrList.Cons({ head: "b", tail: StrList.Cons({ head: "c", tail: StrList.Nil }) }) });
const zipped = nums.zip(strs);

// zipped contains pairs: (1, "a"), (2, "b"), (3, "c")
```

## Merge Operations (Deforestation)

Merge operations compose multiple operations (fold, map, unfold) into a single fused operation, eliminating intermediate allocations. Since unfold is the universal way to generate structure and fold is the universal way to consume it, their composition represents the general pattern of "generate then consume" without materializing the intermediate data structure. (This fused unfold+fold is called a *hylomorphism* in the recursion-schemes literature.) They are defined inline using `merge(...operationNames)`.

At definition time, three fusion rules are applied automatically to the pipeline:

1. **Inverse pair elimination**: consecutive inverse pairs are removed (f° ∘ f = id)
2. **Map-map fusion**: consecutive map getters are composed into a single traversal (g ∘ f)
3. **Map-fold fusion**: a map getter before a fold is fused into the fold's field access

See [Invertible Maps (Allegories)](#invertible-maps-allegories) for details on inverse declaration and the complete fusion rules.

### Recursion Schemes

The table below maps each standard recursion scheme to its Lapis operations. The scheme names (catamorphism, anamorphism, etc.) come from the recursion-schemes literature and are included for reference.

| Scheme | Operations | Direction | Use Case |
| ------ | ----------- | ----------- | ----------- |
| **Fold** *(catamorphism)* | Fold operation | Bottom-up (leaves → root) | Consume/reduce structures |
| **Course-of-values fold** *(histomorphism)* | Fold (`history: true`) | Bottom-up + history | Fold with access to sub-results of recursive children |
| **Auxiliary fold** *(zygomorphism)* | Fold (`aux: 'name'`) | Bottom-up + auxiliary | Fold fused with one or more auxiliary folds |
| **Unfold** *(anamorphism)* | Unfold operation | Top-down (seed → structure) | Generate/produce structures |
| **Unfold + fold** *(hylomorphism)* | Unfold + fold | Generate then consume | Transform without intermediate structure |
| **Fold + unfold** *(metamorphism)* | Fold + unfold | Consume then generate | Transform structure via intermediate value |
| **Fold with substructure** *(paramorphism)* | Fold (`this` context) | Bottom-up + substructure | Fold while retaining access to original substructures |
| **Map + fold** *(prepromorphism)* | Map + fold | Transform then consume | Apply type transformation before consuming |
| **Unfold + map** *(postpromorphism)* | Unfold + map | Generate then transform | Apply type transformation after generating |

> **Fold with substructure access via `this`:** In a fold handler, `this` is the raw original instance. Recursive `Family` fields in `foldedFields` carry the already-folded result, while `this.<field>` accesses the original substructure: giving you both at once, which is the defining characteristic of a fold-with-substructure (also called a *paramorphism*). Note: `this.sameOp` on the same instance is guarded against (see [Circular Fold Protection](#circular-fold-protection)): use `this.childField.sameOp` or destructured fields instead.

### Examples

**Unfold + Fold: `List.Factorial`** (no intermediate list materialized):

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

**All seven schemes: `Stack`:**

A single Stack ADT can illustrate every recursion scheme in the table. Each operation is annotated with its corresponding scheme:

```js
const Stack = data(({ Family, T }) => ({
    Empty: {},
    Push: { value: T, rest: Family(T) },

    // Fold: plain fold - consumes structure bottom-up (catamorphism)
    size: fold({ out: Number })({
        Empty() { return 0; },
        Push({ rest }) { return 1 + rest; }
    }),

    // Fold with substructure: fold using `this` to retain the original substructure (paramorphism).
    // `this.rest` is the original Stack; the folded `rest` field is not needed here.
    pop: fold({})({
        Empty() { return null; },
        Push() { return [this.value, this.rest]; }
    }),

    // Map step used in map+fold and unfold+map below
    double: map({ out: Family })({ T: (x) => x * 2 }),

    // Fold steps used in unfold+fold, map+fold, and fold+unfold below
    toArray: fold({ out: Array })({
        Empty() { return []; },
        Push({ value, rest }) { return [value, ...rest]; }
    }),

    toSortedArray: fold({ out: Array })({
        Empty() { return []; },
        Push({ value, rest }) {
            const arr = [...rest, value];
            arr.sort((a, b) => a - b);
            return arr;
        }
    }),

    // Unfold: generates a Stack top-down from an array seed (anamorphism)
    FromArray: unfold({ in: Array, out: Family })({
        Empty: (arr) => (arr.length === 0 ? {} : null),
        Push: (arr) => (arr.length > 0 ? { value: arr[0], rest: arr.slice(1) } : null)
    }),

    // Unfold + fold: build from array then immediately count,
    // no intermediate Stack allocated (hylomorphism)
    SizeOf: merge('FromArray', 'size'),

    // Map + fold: double all values, then collect to array (prepromorphism)
    doubledArray: merge('double', 'toArray'),

    // Unfold + map: build from array, then double all values (postpromorphism)
    DoubleFrom: merge('FromArray', 'double'),

    // Fold + unfold: fold to sorted array, then rebuild as Stack (metamorphism).
    // The intermediate value (sorted array) is essential and cannot be eliminated.
    sorted: merge('toSortedArray', 'FromArray')
}));

const NumStack = Stack({ T: Number });
const { Empty, Push } = NumStack;

const stack = Push({ value: 3, rest: Push({ value: 2, rest: Push({ value: 1, rest: Empty }) }) });

// Fold (catamorphism)
console.log(stack.size);                          // 3

// Fold with substructure (paramorphism) - returns [topValue, remainingStack] via this.rest
const [top, remaining] = stack.pop;
console.log(top);                                 // 3
console.log(remaining.size);                      // 2

// Unfold (anamorphism)
const fromArr = NumStack.FromArray([10, 20, 30]);
console.log(fromArr.size);                        // 3

// Unfold + fold (hylomorphism) - array → Stack → size, no intermediate Stack retained
console.log(NumStack.SizeOf([10, 20, 30]));       // 3

// Map + fold (prepromorphism) - double values, then collect to array
console.log(stack.doubledArray);                  // [6, 4, 2]

// Unfold + map (postpromorphism) - build from array with all values doubled
console.log(NumStack.DoubleFrom([1, 2, 3]).toArray); // [2, 4, 6]

// Fold + unfold (metamorphism) - fold to sorted array, then unfold into a new sorted Stack
console.log(stack.sorted.toArray);                // [1, 2, 3]
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
Factorial:  merge('unfold1', 'fold1')            // unfold + fold (hylomorphism)
sorted:     merge('fold1', 'unfold1')            // fold + unfold (metamorphism)
doubleSum:  merge('map1', 'fold1')               // map + fold (prepromorphism)
generate:   merge('unfold1', 'map1')             // unfold + map (postpromorphism)
pipeline:   merge('map1', 'map2', 'fold1')       // multiple maps
full:       merge('unfold1', 'map1', 'fold1')    // full unfold+map+fold pipeline (hylomorphism)
fullMeta:   merge('map1', 'fold1', 'unfold1')    // full map+fold+unfold pipeline (metamorphism)

// Invalid compositions (would throw errors)
// merge('fold1')                          // ✗ Error: need at least 2 operations
// merge()                                 // ✗ Error: empty array
// merge('unfold1', 'unfold2')             // ✗ Error: multiple unfolds
// merge('fold1', 'fold2')                 // ✗ Error: multiple folds
// merge('unfold1', 'unfold2', 'fold1')    // ✗ Error: multiple unfolds
```

**Naming Conventions:**

Merged operations follow specific naming rules:

- Static methods (unfold first, i.e. *hylomorphism*): Must be PascalCase (e.g., `'Factorial'`, `'Range'`)
- Instance methods (all others): Must be camelCase (e.g., `'doubleSum'`, `'sorted'`)

## Behavior

Behavior types are the dual of data (algebraic data types). Where data is defined by **constructors** (how to build it), behavior is defined by **observers** or **destructors** (how to observe it). Behavior types are defined by what they *do*, not what they *are*. (In category theory these correspond to *final coalgebras*, written νF.)

### Data vs Behavior

Data types and behavior types are **dual** to each other. This duality is the organizing principle of Lapis:

- **Data** is defined by its constructors (variants) and is naturally open to new observations: you can always define new folds. Fold is the **universal observation**: every total function that consumes a data type and respects its structure is expressible as a fold.
- **Behavior** is defined by its observations (methods/projections) and is naturally open to new implementations: you can always define new generators. Unfold is the **universal generator**: every way of producing behavior from a seed is expressible as an unfold.

This asymmetry is sometimes called the **Expression Problem**: data makes adding observations easy but adding variants hard, while behavior makes adding implementations easy but adding observations hard. Lapis addresses both sides: `extend` allows new variants to be added to data types (with inherited and overridable operations), and behavior definitions allow new implementations of existing observation interfaces.

| Aspect | Data | Behavior |
| --- | --- | --- |
| **Defined by** | Constructors (how to build) | Observers / Destructors (how to observe) |
| **Self-reference** | `Family` | `Self` |
| **Naturally open to** | New observations (folds) | New generators (unfolds) |
| **Extensible via** | `extend` (add variants + inherit ops) | New unfold implementations |
| **Universal arrow** | Fold | Unfold |
| **Direction** | Consumes structure bottom-up | Produces structure top-down |
| **Natural introduction** | Construction (calling constructors) | Unfold (generate from seed) |
| **Natural elimination** | Fold (consume bottom-up) | Observation (accessing observers) |
| **Dual operation** | Unfold (build from seed) | Fold (bounded consumption) |
| **Structure** | Finite, recursive | Potentially infinite, corecursive |
| **Evaluation** | Eager (constructed fully, then frozen) | Lazy (observed on-demand via Proxy) |
| **Equality** | Structural (frozen objects) | Observational (same observations → equivalent) |
| **Example** | Lists, trees, Peano numbers | Streams, infinite sequences, state machines |

> *CT note:* Data corresponds to initial algebras (μF), behavior to final coalgebras (νF). Fold is a catamorphism, unfold an anamorphism. Observational equality on behaviors is formally called *bisimulation*.

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

- **Simple observer**: `head: T` Returns a value of type T; installed as a getter
- **Parametric observer**: `nth: { in: Number, out: T }` Takes input, returns output; installed as a method
- **Continuation**: `tail: Self(T)` Returns the next behavior instance (lazy, memoized)
- **Parametric continuation**: `advance: { in: Number, out: Self }` Takes input, returns next behavior instance

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
- **Continuations (`Self`)**: `(seed) => nextSeed`: the framework creates the next instance lazily

**Parameterless unfold (UAP):**

If `spec` has no `in` property (or `spec` is omitted entirely), the unfold is installed as a static getter:

```js
const Console = behavior(() => ({
    log: { in: String, out: undefined },
    Create: unfold({})({  // No spec - becomes getter, no runtime type checks
        log: () => (msg) => console.log(msg)
    })
}));

const io = Console.Create;  // getter - no parentheses
io.log('hello');
```

> **Note:** `out` in a behavior unfold `spec` is never validated at runtime: the framework constructs the behavior instance itself from the handler's returned seed, so the output type is guaranteed by construction, not by a value check. Only `in` matters for runtime type checking. Prefer omitting `spec` entirely when there is no `in` to validate.

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

- **Simple observers**: recomputed on each access (no memoization)
- **Parametric observers**: function wrapper is memoized
- **Continuations (`Self`)**: instances are memoized (same instance on repeated access)

```js
const stream = Stream.From(0);

const tail1 = stream.tail;
const tail2 = stream.tail;
console.log(tail1 === tail2);  // true - memoized

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
| --- | --- | --- |
| **Type structure** | Sum type: dispatch on variant | Product type: receive all observers |
| **Handlers** | Many (one per variant) | One (`_`) for the whole product |
| **Recursive fields** | Pre-folded by framework (bottom-up) | Exposed as fold functions (top-down) |
| **Base case** | A base-variant handler (e.g., `Nil`) | Not calling any continuation |
| **Direction** | Bottom-up (leaves → root) | Top-down (root → leaves, user-controlled) |

The `_` key is the sole canonical form: there is no per-observer alternative because behavior is a product type.

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

In the handler, `tail` is a **fold function**: calling `tail(n - 1)` recursively folds the continuation. Not calling it terminates the fold (the base case).

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
cd.collect  // [5, 4, 3, 2, 1]  - getter via UAP
```

### Map (Lazy Type Transformation)

Map is the dual of data's map operation. Where data map eagerly reconstructs the entire structure O(n), behavior map is lazy: the transform is applied on-demand at observation time, O(1) to create.

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
    // Getter map - no extra args
    doubled: map({})({ T: (x) => x * 2 }),
    // Method map - extra args become method parameters
    apply: map({})({ T: (x, f) => f(x) })
}));

const nums = Stream.From(0);
nums.doubled.take(5)            // [0, 2, 4, 6, 8]  - lazy, O(1) to create
nums.apply(x => x * 3).take(5) // [0, 3, 6, 9, 12]
nums.doubled.doubled.take(4)    // [0, 4, 8, 12]     - chained maps
nums.take(5)                    // [0, 1, 2, 3, 4]   - original unaffected
```

**Key points:**

- No extra args → getter (e.g., `nums.doubled`)
- Extra args → method (e.g., `nums.apply(fn)`)
- Map creation is O(1): no observation happens at map time
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
    // Static merge (includes unfold) - PascalCase, called on the type
    TakeDoubled: merge('From', 'doubled', 'take'),
    // Instance merge (no unfold) - camelCase, called on instances
    doubledSum: merge('doubled', 'sum')
}));

// Static - no intermediate stream created
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
- Map operations are camelCase; lazy: O(1) creation, transform applied at observation time
- Merge operations compose pipelines; naming follows whether an unfold is included
- Lazy evaluation via Proxy enables infinite structures with no up-front cost
- Continuations (`Self`) are memoized; simple observers are recomputed each access

**See also:**

- `examples/behavior-stream.mjs` - Comprehensive behavior examples

## Relation (Relational Operations on Data)

A relation is a `data()` type enriched with **endpoint projections** (`[origin]` and `[destination]`) that give each instance a "from" and "to" value:

```text
A ←origin- R -destination→ B
```

This lets `relation()` automatically derive operations familiar from Datalog-style logic programming: compute transitive closures (`closure`), and query reachability in both directions (`reachableFrom`, `reachingTo`).

> Categorically, the `[origin]`/`[destination]` pair forms a *span* $A \leftarrow R \rightarrow B$, making the type an object in an allegory. The auto-generated operations correspond to allegory composition, relational image, and relational converse.

```ts
import { relation, fold, origin, destination } from '@lapis-lang/lapis-js';
```

### Relation Declaration

A relation is declared like a `data()` type, with two required fold operations (`[origin]` and `[destination]`) that project each variant to its endpoints:

```ts
const Edge = relation(({ Family }) => ({
    // Variants (same as data)
    Direct: { from: String, to: String },
    Path:   { first: Family, second: Family },

    // Endpoint projections (required)
    [origin]: fold({ out: String })({
        Direct({ from }) { return from; },
        Path({ first })  { return first; }
    }),
    [destination]: fold({ out: String })({
        Direct({ to })     { return to; },
        Path({ second })   { return second; }
    }),

    // Additional fold operations (same as data)
    length: fold({ out: Number })({
        Direct() { return 1; },
        Path({ first, second }) { return first + second; }
    })
}));
```

**Special keys:**

| Key | Purpose |
| --- | --- |
| `[origin]` | **Required.** `fold({ out: DomainType })({...})`: projects each variant to its origin endpoint |
| `[destination]` | **Required.** `fold({ out: CodomainType })({...})`: projects each variant to its destination endpoint |

The `out` type in each fold spec declares the endpoint type. All PascalCase keys are **variants** (same as `data()`). All other camelCase keys with `fold`/`map`/`merge`/`unfold` are **operations** (same as `data()`).

### Auto-Generated Operations

#### `closure(baseFacts, options?)`

Computes the transitive closure: all endpoint pairs reachable by composing base facts through recursive variants, using semi-naive fixpoint iteration (the same strategy as bottom-up Datalog evaluation):

1. Seed with base facts (leaf variants)
2. Each iteration: compose existing facts through recursive variants, requiring at least one fact from the previous delta (semi-naive optimization)
3. Invalid compositions (failing the join invariant) are silently skipped
4. Deduplicate by endpoint pair (same as Datalog's flat-tuple semantics)
5. Stop when no new pairs are derived

```ts
const edges = [
    Edge.Direct('A', 'B'), Edge.Direct('B', 'C'), Edge.Direct('A', 'D'),
    Edge.Direct('D', 'C'), Edge.Direct('C', 'E')
];

const allPairs = Edge.closure(edges);

console.log(`${allPairs.length} reachable pairs`);
allPairs.forEach(e =>
    console.log(`  ${e.origin} → ${e.destination}  (length ${e.length})`)
);
```

By default, two facts with the same `origin` and `destination` are considered identical: only the first derivation is kept. This mirrors Datalog, where `ancestor(alice, dave)` is one tuple regardless of the proof path. The number of facts is bounded by |domain| × |codomain|, so `closure()` always terminates without safety limits.

To override dedup (e.g., distinguishing by an additional attribute), pass a custom `key`:

```ts
const allPairs = Edge.closure(edges, {
    key: e => `${e.origin}→${e.destination}:${e.length}`
});
```

| Option | Default | Description |
| --- | --- | --- |
| `key` | endpoint-pair dedup | `(fact) => string`: custom dedup key function |

Structurally, `closure()` is a fused unfold + fold (a *hylomorphism*). The unfold phase derives new proof trees by composing existing facts through recursive constructors (`Path({ first, second })`). The fold phase collapses each proof tree to its endpoint pair for deduplication. These two phases are fused inside the fixpoint loop: each iteration unfolds one derivation step, immediately folds (dedup), and feeds the result back — generating then consuming without materializing the full intermediate structure. The formula R⁺ = μX. R ∪ (R;X) captures this: the μ (least fixpoint) drives iteration, the union/composition is the unfold, and set-membership dedup is the fold.

#### `reachableFrom(facts, domainValues)`

Forward reachability: given a set of origin values, returns all destination values paired with them in the facts:

```ts
Edge.reachableFrom(allPairs, ['A']);  // ['B', 'C', 'D', 'E']
Edge.reachableFrom(allPairs, ['D']);  // ['C', 'E']
```

#### `reachingTo(facts, codomainValues)`

Backward reachability: given a set of destination values, returns all origin values paired with them in the facts:

```ts
Edge.reachingTo(allPairs, ['E']);  // ['A', 'B', 'C', 'D']
Edge.reachingTo(allPairs, ['C']);  // ['A', 'B', 'D']
```

### Join Invariant (Auto-Generated)

For any recursive variant with two or more `Family` fields, `relation()` automatically attaches an invariant enforcing composability on every adjacent pair:

```text
fields[0].destination === fields[1].origin
fields[1].destination === fields[2].origin
...
```

For the common two-field case `{ first: Family, second: Family }`, this reduces to:

```text
first.destination === second.origin
```

This is the definition of **relational composition** in an allegory: two relation instances can only be chained when the destination of the first matches the origin of the second. Without this invariant, `closure()` would attempt to compose every pair of facts, producing nonsensical derivations like composing `alice->bob` with `carol->dave` into a meaningless `alice->dave` that skips an unconnected gap.

The invariant is what makes `closure()` correct: during fixpoint iteration, it silently rejects invalid compositions (they throw `TypeError` at construction time, which `closure()` catches and skips). Only connected chains survive, so every derived fact represents a valid path through the relation.

You never write this invariant yourself: it is derived from the endpoint projections. If you were using plain `data()`, you would need to write `[invariant]: ({ first, second }) => first.destination === second.origin` by hand on every recursive variant. `relation()` generates it for you.

### Logic Programming Interpretation (Relation)

Because Lapis stores full **proof trees** (not flat Datalog tuples), the standard `data()` operations acquire logic-programming meanings when applied to a relation:

| Operation | data() meaning | relation() LP meaning |
| --- | --- | --- |
| **fold** | Structural recursion: consume a value bottom-up | **Inspect/evaluate a proof**: walk the derivation tree and compute a result (e.g. `depth`, `origin`, `destination`) |
| **unfold** | Corecursion: generate a structure from a seed | **Derive a proof**: apply rules to produce a proof tree (rule application, proof construction) |
| **map** | Transform type parameters, preserving structure | **Relational homomorphism**: re-label endpoints or provenance while preserving the derivation structure |
| **merge** | Fuse unfold + fold (deforestation) | **Combine derivations**: compose proof generation with proof evaluation without materializing the intermediate tree |

The key insight is that a relation instance IS a proof witness: a `Direct('alice', 'bob')` is an axiom, and a `Transitive({ hop, rest })` is a derivation step. Fold reads the proof; unfold writes the proof; map transforms it; merge fuses reading and writing.

### Complete Example: Ancestor Relation

```ts
const Ancestor = relation(({ Family }) => ({
    Direct:     { from: String, to: String },
    Transitive: { hop: Family, rest: Family },

    [origin]: fold({ out: String })({
        Direct({ from })       { return from; },
        Transitive({ hop })    { return hop; }
    }),
    [destination]: fold({ out: String })({
        Direct({ to })         { return to; },
        Transitive({ rest })   { return rest; }
    }),

    depth: fold({ out: Number })({
        Direct() { return 1; },
        Transitive({ hop, rest }) { return hop + rest; }
    })
}));

const parents = [
    Ancestor.Direct('alice', 'bob'), Ancestor.Direct('bob', 'carol'),
    Ancestor.Direct('carol', 'dave'), Ancestor.Direct('dave', 'eve')
];

const all = Ancestor.closure(parents);

// Who are all descendants of alice?
Ancestor.reachableFrom(all, ['alice']);     // ['bob', 'carol', 'dave', 'eve']

// Who are all ancestors of eve?
Ancestor.reachingTo(all, ['eve']);    // ['alice', 'bob', 'carol', 'dave']
```

### Cycle Handling

The default endpoint-pair dedup in `closure()` prevents infinite expansion on cyclic graphs:

```ts
const cyclic = [Edge.Direct('X', 'Y'), Edge.Direct('Y', 'Z'), Edge.Direct('Z', 'X')];
const all = Edge.closure(cyclic);
// 9 pairs - full connectivity, no infinite loop
```

## Observer (Stepwise Exploration on Behavior)

An observer is a `behavior()` type enriched with **exploration structure**: fold operations that extract results, detect termination, and filter successes from the observation stream:

```text
Query →input- P ←output- Path[]
```

Where `relation()` computes exhaustively bottom-up (like Datalog), `observer()` explores lazily top-down (like Prolog). This makes `observer()` suited for large or infinite search spaces where you only need some results.

> Categorically, the `[output]`/`[done]`/`[accept]` triple forms a *cospan*: the dual of a relation's span. `explore()` computes a greatest fixpoint, dual to `closure()`'s least fixpoint.

**Relation vs Observer at a glance:**

| Relation | Observer |
| --- | --- |
| Computes **all** reachable pairs (bottom-up) | Explores **lazily** from a seed (top-down) |
| `[origin]` / `[destination]` project endpoints (fold ops) | `[output]` / `[done]` / `[accept]` observe state (field references) |
| `closure()` iterates to a fixpoint | `explore()` steps until done or limit reached |
| Join invariant auto-generated | `Self` continuation auto-detected |
| Datalog-style | Prolog-style |

```ts
import { observer, unfold, fold, output, done, accept } from '@lapis-lang/lapis-js';
```

### Observer Declaration

An observer is declared like a `behavior()` type, with three required cospan projections that define the cospan structure. This parallels how `relation()` requires `[origin]`/`[destination]` fold defs for its span structure.

Each cospan key is a **string naming an observer field**. The framework auto-generates the corresponding fold projection:

```ts
const PathFinder = observer(({ Self }) => ({
    // Observers (same as behavior)
    path: Array,
    found: Boolean,
    exhausted: Boolean,
    next: Self,

    // Cospan projections — each names a field defined above
    [output]: 'path',
    [done]:   'exhausted',
    [accept]: 'found',

    // Unfold (observer map, same as behavior)
    Search: unfold({ in: Object, out: Self })({
        path:      (s) => s.path,
        found:     (s) => s.isFound,
        exhausted: (s) => s.isExhausted,
        next:      (s) => s.step
    })
}));
```

Any derived value (e.g. filtering, transforming) belongs in the unfold as a dedicated field, then referenced by name:

```ts
    // Computed in the unfold, referenced by name in the cospan:
    isEven: Boolean,
    [accept]: 'isEven',

    Gen: unfold({ in: Number, out: Self })({
        isEven: (n) => n % 2 === 0,
        ...
    })
```

**Required cospan projections:**

| Key | Purpose |
| --- | --- |
| `[output]` | **Required.** String field reference. Extracts the result from the current observation |
| `[done]` | **Required.** String field reference. When to stop stepping (termination) |
| `[accept]` | **Required.** String field reference. Which observations are successes to collect |

The referenced field's type serves as the projection type: the `[output]` field's type is the codomain (what `explore()` returns). The `in` type of the unfold serves as the domain type (the seed).

The `Self` continuation is **auto-detected**: any field whose value is a `Self` reference becomes the stepping mechanism.

All other keys follow the same rules as `behavior()`: observers, fold/unfold operations, etc.

### Auto-Generated Operation: `explore(seed, options?)`

The `explore()` method drives the observer step by step, collecting results along the way:

1. Unfold the seed into an initial behavior instance
2. At each step, read `[accept]` (fold getter) on the current instance
3. If `[accept]` is true, collect `[output]` (fold getter) into results
4. If `[done]` (fold getter) is true, stop
5. Follow the `Self` continuation to the next state
6. Repeat until done, exhausted, or limits reached

```ts
const results = PathFinder.explore(seed);
const first   = PathFinder.explore(seed, { maxResults: 1 });
```

Options:

| Option | Default | Description |
| --- | --- | --- |
| `maxSteps` | 10000 | Maximum steps before giving up |
| `maxResults` | Infinity | Maximum results to collect. Use `1` for **cut** semantics (commit to first solution, like Prolog `!`) |
| `unfold` | first unfold in spec | Name of the unfold to use as the generator |

**Rescue as backtracking:** If stepping to the next state throws (e.g. a demand failure on the unfold), `explore()` treats the branch as exhausted. The behavior's own `rescue` handler gets first chance to recover before the error propagates — this maps directly to Prolog backtracking: demand failure → try next alternative (rescue/retry), or fail the branch.

**Tabling (always-on cycle detection):** `explore()` automatically tracks visited output values and terminates a branch when an output is revisited. Object outputs are tracked by identity (`WeakSet`), while primitive outputs are tracked by value (`Set`). This avoids `JSON.stringify` pitfalls with circular references, functions, or non-serializable values. The approach is dual to `closure()`'s always-on endpoint-pair deduplication — Datalog tables derived facts by tuple identity; here the output projection collapses behavior instances to comparable identities. No user configuration is needed.

### Complete Example: Graph Path Finder

This example uses `data()` for the search state ADT and `observer()` for the lazy path-finding behavior:

```ts
import { data, observer, fold, unfold, output, done, accept } from '@lapis-lang/lapis-js';

// SearchState ::= Active | Found | Exhausted
const SearchState = data(() => {
    function resolve(target, adj, workList) {
        const wl = [...workList];
        while (wl.length > 0) {
            const item = wl.pop();
            if (item.node === target)
                return SearchState.Found({
                    target, adj, foundPath: item.path, workList: wl
                });
            const visited = new Set(item.path);
            for (const n of adj[item.node].filter(x => !visited.has(x)))
                wl.push({ node: n, path: [...item.path, n] });
        }
        return SearchState.Exhausted;
    }

    return {
        Active:    { target: String, adj: Object, workList: Array },
        Found:     { target: String, adj: Object, foundPath: Array, workList: Array },
        Exhausted: {},

        path: fold({ out: Array })({
            Active()              { return []; },
            Found({ foundPath })  { return foundPath; },
            Exhausted()           { return []; }
        }),
        isFound: fold({ out: Boolean })({
            Active()    { return false; },
            Found()     { return true; },
            Exhausted() { return false; }
        }),
        isExhausted: fold({ out: Boolean })({
            Active()    { return false; },
            Found()     { return false; },
            Exhausted() { return true; }
        }),
        step: fold({ out: Object })({
            Active({ target, adj, workList }) { return resolve(target, adj, workList); },
            Found({ target, adj, workList })  { return resolve(target, adj, workList); },
            Exhausted()                       { return SearchState.Exhausted; }
        })
    };
});

// Query ::= Query(adj, start, target)
const Query = data(() => ({
    Query: { adj: Object, start: String, target: String },
    toState: fold({ out: Object })({
        Query({ adj, start, target }) {
            if (start === target)
                return SearchState.Found({ target, adj, foundPath: [start], workList: [] });
            const workList = (adj[start] ?? []).map(n => ({ node: n, path: [start, n] }));
            return workList.length === 0
                ? SearchState.Exhausted
                : SearchState.Active({ target, adj, workList });
        }
    })
}));

// PathFinder - observer with cospan structure
const PathFinder = observer(({ Self }) => ({
    path: Array,
    found: Boolean,
    exhausted: Boolean,
    next: Self,

    [output]: 'path',
    [done]:   'exhausted',
    [accept]: 'found',

    Search: unfold({ in: Object, out: Self })({
        path:      (s) => s.path,
        found:     (s) => s.isFound,
        exhausted: (s) => s.isExhausted,
        next:      (s) => s.step
    })
}));

// Usage
const dag = { A: ['B', 'D'], B: ['C'], D: ['C'], C: ['E'] };

const paths = PathFinder.explore(
    Query.Query(dag, 'A', 'E').toState,
    { maxResults: 10 }
);
// paths = [['A', 'D', 'C', 'E'], ['A', 'B', 'C', 'E']]

const first = PathFinder.explore(
    Query.Query(dag, 'A', 'E').toState,
    { maxResults: 1 }
);
// first = [['A', 'D', 'C', 'E']]
```

### Relation vs Observer: When to Use Which

| Scenario | Use | Why |
| --- | --- | --- |
| Enumerate **all** reachable pairs | `relation()` + `closure()` | Bottom-up exhaustive computation |
| Answer **one** specific query lazily | `observer()` + `explore()` | Top-down, stops after finding results |
| Need `reachableFrom()` / `reachingTo()` projections | `relation()` | Built-in relational algebra |
| Need to control search (DFS, BFS, heuristics) | `observer()` | Observer map controls traversal strategy |
| Small, finite relation | Either | Both produce correct results |
| Large or infinite search space | `observer()` | Lazy evaluation avoids materializing all facts |

### Logic Programming Interpretation (Observer)

Just as `relation()` operations have LP meanings on proof trees, `observer()` operations have dual meanings on the **search process** (proof search driven by behavior):

| Operation | behavior() meaning | observer() LP meaning |
| --- | --- | --- |
| **fold** | Observe/consume behavior state | **Read search state**: extract the current result (`[output]`), check termination (`[done]`), test acceptance (`[accept]`) |
| **unfold** | Construct behavior from a seed | **Expand the search**: produce the next search state from a query (goal resolution, SLD-resolution step) |
| **demands** | Precondition on unfold seed | **Mode declaration / pruning**: reject invalid seeds before expanding the search (constraint propagation at each step) |
| **rescue** | Structured recovery on failure | **Backtracking**: when stepping fails, rescue provides alternative continuation (try next branch) |
| **tabling** (auto-derived) | Cycle detection on state space | **Memoization**: prevent infinite loops by tracking visited output values (dual of `closure()` endpoint-pair dedup) |
| **`maxResults: 1`** | Collect single result | **Cut** (Prolog `!`): commit to first accepted result, stop exploring |
| **map** | Lazy type transformation on observations | **Transform the search space**: re-label states or results without altering the search strategy |
| **merge** | Fuse observation pipeline (deforestation) | **Compose search strategies**: fuse goal expansion with result extraction, avoiding intermediate state materialization |

Where `relation()` stores proof witnesses (data: what was proved), `observer()` drives proof search (behavior: how to prove it). The duality is:

- **Relation**: data side. Proof trees are constructed and inspected. `closure()` computes a least fixpoint (enumerate all proofs). *(CT: initial algebra, μ-side.)*
- **Observer**: behavior side. Search processes are stepped and observed. `explore()` computes a greatest fixpoint (lazily find proofs on demand). *(CT: final coalgebra, ν-side.)*

Together they form a complete LP system: relations for exhaustive bottom-up derivation, observers for lazy top-down search.

## Design by Contract

Lapis JS integrates [Design by Contract™](https://en.wikipedia.org/wiki/Design_by_contract) directly into `data` and `behavior` declarations. Contracts are specified inline in fold/unfold specs and are enforced at runtime.

This enables enforcement of the [Liskov Substitution Principle](https://en.wikipedia.org/wiki/Liskov_substitution_principle) (LSP) and [Organized Panic](https://en.wikipedia.org/wiki/Exception_handling#Exception_handling_based_on_design_by_contract): structured, localized error handling with optional retry.

The contract system supports several key software reliability principles:

- **[Organized Panic](https://en.wikipedia.org/wiki/Exception_handling#Exception_handling_based_on_design_by_contract)**: Rather than scattering `try/catch` blocks throughout the call stack, exceptions are handled in a structured and localized manner. When an operation fails, the `rescue` handler at the point of failure recovers gracefully: either by returning a fallback value or by retrying with corrected arguments. You can always lexically determine where exception handling occurs.
- **[Robustness](https://en.wikipedia.org/wiki/Robustness_(computer_science))**: The ability of a system to respond to situations not specified. The `rescue` mechanism enables implementations to cope with unanticipated failures by providing structured recovery logic at the declaration site, rather than relying on callers to anticipate every failure mode.
- **[Fault-Tolerance](https://en.wikipedia.org/wiki/Fault_tolerance)**: The ability to continue operating despite failures. Rescue handlers work per-node during recursive fold traversal: when a handler throws for a particular node, `rescue` provides a fallback for that node while the rest of the tree continues folding normally.
- **[Redundancy](https://en.wikipedia.org/wiki/Redundancy_(engineering))**: The `retry` mechanism allows an operation to re-execute with corrected arguments or after restoring invariants, providing a form of redundancy by attempting alternative strategies when the primary approach fails.
- **[N-Version Programming](https://en.wikipedia.org/wiki/N-version_programming)**: The combination of `rescue` and `retry` provides a foundation for implementing multiple independent strategies for the same operation. When one approach fails, the rescue handler can retry with an entirely different algorithm or set of inputs.

The contract system provides:

- **Demands** (preconditions): caller-blame checks before an operation executes
- **Ensures** (postconditions): implementer-blame checks after an operation completes
- **Rescue**: structured recovery with optional retry when an operation fails
- **Continuous invariants**: checked around every operation invocation
- **Subcontracting**: LSP-safe composition through `[extend]` hierarchies

```ts
import {
    data, fold, unfold, invariant,
    DemandsError, EnsuresError, InvariantError,
    assert, implies, iff
} from '@lapis-lang/lapis-js';
```

### Assertions

`assert` is **always active**. It targets hard logical invariants (programmer errors) that should never be silenced.

Use the `assert` function for inline assertions:

```ts
import { assert } from '@lapis-lang/lapis-js';

function avg(xs: number[]): number {
    assert(xs.length > 0, 'The list cannot be empty');
    return xs.reduce((sum, next) => sum + next) / xs.length;
}
```

If you are using TypeScript, `assert` supports assertion signatures so the type system narrows after a successful call:

```ts
let value: unknown = 'hello';

value.toUpperCase(); // Error: 'value' is of type 'unknown'

assert(typeof value === 'string');

value.toUpperCase(); // OK: value is now narrowed to string
```

If the condition is falsy, an `AssertionError` is thrown:

```ts
assert(false, 'Something went wrong');
// Throws: AssertionError: Something went wrong
```

**`assert` should not be used for validating operation arguments**: use `demands` for that purpose.

### Implies

When defining predicates it is a common use case to encode [material implication](https://en.wikipedia.org/wiki/Material_conditional):

```ts
import { implies } from '@lapis-lang/lapis-js';

implies(weather.isSunny, person.visitsBeach);
// Equivalent to: !weather.isSunny || person.visitsBeach
```

Useful in demands and ensures predicates:

```ts
const Stack = data(({ Family, T }) => ({
    Empty: {},
    Push: { value: T, rest: Family(T) },
    size: fold({ out: Number })({
        Empty() { return 0; },
        Push({ rest }) { return 1 + rest; }
    }),
    pop: fold({
        // If the stack is non-empty, then pop should succeed
        demands: (self) => implies(self.size > 0, true)
    })({
        Empty() { throw new Error('Cannot pop empty stack'); },
        Push() { return [this.value, this.rest]; }
    })
}));
```

| p | q | `implies(p, q)` |
| --- | --- | --- |
| `true` | `true` | `true` |
| `true` | `false` | `false` |
| `false` | `true` | `true` |
| `false` | `false` | `true` |

### Iff

When defining predicates it is a common use case to encode [if and only if](https://en.wikipedia.org/wiki/Logical_biconditional) (biconditional):

```ts
import { iff } from '@lapis-lang/lapis-js';

iff(person.hasTicket, person.ridesTrain);
// Equivalent to: implies(p, q) && implies(q, p)
```

Useful for encoding equivalences in invariants:

```ts
const Stack = data(({ Family, T }) => ({
    Empty: {},
    Push: {
        [invariant]: (self) => iff(self.size === 0, self instanceof Stack.Empty),
        value: T,
        rest: Family(T)
    },
    size: fold({ out: Number })({
        Empty() { return 0; },
        Push({ rest }) { return 1 + rest; }
    })
}));
```

| p | q | `iff(p, q)` |
| --- | --- | --- |
| `true` | `true` | `true` |
| `true` | `false` | `false` |
| `false` | `true` | `false` |
| `false` | `false` | `true` |

### Demands (Preconditions)

Use `demands` in a fold or unfold spec to specify preconditions. If the condition fails, a `DemandsError` is thrown **before** the operation body executes. This represents **caller blame**: the caller invoked the operation with invalid state or arguments.

```ts
const Stack = data(({ Family, T }) => ({
    Empty: {},
    Push: { value: T, rest: Family(T) },
    size: fold({ out: Number })({
        Empty() { return 0; },
        Push({ rest }) { return 1 + rest; }
    }),

    // demands: stack must not be empty before popping
    pop: fold({
        demands: (self) => self.size > 0
    })({
        Empty() { throw new TypeError('Cannot pop empty stack'); },
        Push() { return [this.value, this.rest]; }
    }),

    // demands with input parameter: value must not be null/undefined
    append: fold({
        in: T,
        demands: (self, val) => val !== undefined && val !== null
    })({
        Empty({}, val) { return Stack({ T: Number }).Push({ value: val, rest: Stack({ T: Number }).Empty }); },
        Push({ rest }, val) { return Stack({ T: Number }).Push({ value: this.value, rest: rest(val) }); }
    })
}));

const NumStack = Stack({ T: Number });
const { Empty, Push } = NumStack;

const stack = Push({ value: 1, rest: Empty });
console.log(stack.pop); // [1, Empty] - demands satisfied

try {
    Empty.pop; // DemandsError - stack is empty
} catch (e) {
    console.log(e instanceof DemandsError); // true
}
```

**Demands on unfold operations:**

```ts
const List = data(({ Family }) => ({
    Nil: {},
    Cons: { head: Number, tail: Family },
    Range: unfold({
        in: Number,
        out: Family,
        demands: (self, n) => typeof n === 'number' && n >= 0
    })({
        Nil: (n) => (n <= 0 ? {} : null),
        Cons: (n) => (n > 0 ? { head: n, tail: n - 1 } : null)
    })
}));

List.Range(5);  // OK
List.Range(-1); // DemandsError: n must be >= 0
```

**Key points:**

- The demands predicate receives `(self, ...args)` where `self` is the instance (or ADT for unfolds)
- If the predicate returns `false` (or throws), a `DemandsError` is thrown
- The operation body is **never executed** when demands fail
- `DemandsError` is never caught by `rescue`: demands failures are always propagated to the caller

### Ensures (Postconditions)

Use `ensures` in a fold or unfold spec to specify postconditions. If the condition fails, an `EnsuresError` is thrown **after** the operation body completes. This represents **implementer blame**: the operation produced a result that violates its contract.

```ts
const Stack = data(({ Family, T }) => ({
    Empty: {},
    Push: { value: T, rest: Family(T) },
    size: fold({ out: Number })({
        Empty() { return 0; },
        Push({ rest }) { return 1 + rest; }
    }),

    // ensures: the result size must be one more than the original
    append: fold({
        in: T,
        out: Family,
        ensures: (self, old, result) => result.size === old.size + 1
    })({
        Empty({}, val) { return Stack({ T: Number }).Push({ value: val, rest: Stack({ T: Number }).Empty }); },
        Push({ rest }, val) { return Stack({ T: Number }).Push({ value: this.value, rest: rest(val) }); }
    })
}));
```

The ensures predicate receives `(self, old, result, ...args)`:

- `self`: the instance the operation was called on
- `old`: a snapshot of the instance state captured **before** the body executed
- `result`: the value returned by the operation body
- `...args`: any input arguments passed to the operation

**Key points:**

- The ensures predicate is evaluated **after** the operation body returns
- If the predicate returns `false` (or throws), an `EnsuresError` is thrown
- `EnsuresError` **is** caught by `rescue` if one is defined: allowing recovery

### Rescue (Structured Recovery)

Use `rescue` in a fold or unfold spec to handle exceptions thrown by the operation body or by `ensures`. Unlike traditional `try/catch` where exceptions are non-resumable and often handled far from the source (leading to scattered and redundant error handling), `rescue` provides **localized, declarative error handling** with optional retry.

This is the mechanism underlying [Organized Panic](#design-by-contract): you can lexically determine where exception handling occurs, restore invariants or perform corrective actions before retrying or failing, and implement alternative strategies for error recovery. This approach supports [Robustness](#design-by-contract), [Fault-Tolerance](#design-by-contract), [Redundancy](#design-by-contract), and [N-Version Programming](#design-by-contract) as described in the introduction above.

```ts
import { data, fold } from '@lapis-lang/lapis-js';

const Expr = data(({ Family }) => ({
    Lit: { value: Number },
    Div: { left: Family, right: Family },

    eval: fold({
        out: Number,
        rescue: (self, error, args) => {
            console.log(`Caught: ${error.message}`);
            return NaN; // Return a fallback value
        }
    })({
        Lit({ value }) { return value; },
        Div({ left, right }) {
            if (right === 0) throw new Error('Division by zero');
            return left / right;
        }
    })
}));

const { Lit, Div } = Expr;

Div({ left: Lit({ value: 10 }), right: Lit({ value: 0 }) }).eval;
// Logs: "Caught: Division by zero"
// Returns: NaN
```

**Retry:**

The rescue handler receives a `retry` function as its fourth argument. Calling `retry(...newArgs)` re-executes the operation body with new arguments, re-checking all contracts:

```ts
const Stack = data(({ Family, T }) => ({
    Empty: {},
    Push: { value: T, rest: Family(T) },

    append: fold({
        in: T,
        out: Family,
        rescue: (self, error, args, retry) => {
            console.log(`append failed, retrying with default value 0`);
            return retry(0); // Retry with a fallback argument
        }
    })({
        Empty({}, val) {
            if (val === undefined) throw new Error('No value');
            return Stack({ T: Number }).Push({ value: val, rest: Stack({ T: Number }).Empty });
        },
        Push({ rest }, val) {
            return Stack({ T: Number }).Push({ value: this.value, rest: rest(val) });
        }
    })
}));
```

**Rescue handler signature:**

```ts
rescue: (self, error, args, retry) => result
```

- `self`: the instance the operation was called on
- `error`: the error that was thrown
- `args`: the original arguments passed to the operation
- `retry(...newArgs)`: re-execute the body with new arguments

**Fault-tolerant recursive folds (Fault-Tolerance and Redundancy):**

Rescue handlers work per-node during fold traversal, enabling [Fault-Tolerance](https://en.wikipedia.org/wiki/Fault_tolerance). When a handler throws for a particular node, rescue provides a fallback ([Redundancy](https://en.wikipedia.org/wiki/Redundancy_(engineering))) for that node while the rest of the tree continues folding normally:

```ts
const Expr = data(({ Family }) => ({
    Lit: { value: Number },
    Add: { left: Family, right: Family },
    Div: { left: Family, right: Family },

    eval: fold({
        out: Number,
        rescue: (self, error, args) => {
            return 0; // Default value for failed nodes
        }
    })({
        Lit({ value }) { return value; },
        Add({ left, right }) { return left + right; },
        Div({ left, right }) {
            if (right === 0) throw new Error('Division by zero');
            return left / right;
        }
    })
}));

const { Lit, Add, Div } = Expr;

// The division-by-zero node returns 0, but Add(5, 0) still computes correctly
const expr = Add({ left: Lit({ value: 5 }), right: Div({ left: Lit({ value: 10 }), right: Lit({ value: 0 }) }) });
console.log(expr.eval); // 5 (5 + 0)
```

**Key points:**

- `rescue` catches errors from the operation body **and** from `ensures` failures
- `rescue` does **not** catch `DemandsError`: precondition failures are always propagated to the caller
- `retry` re-executes the full contract cycle (demands → body → ensures), supporting [N-Version Programming](https://en.wikipedia.org/wiki/N-version_programming) by allowing alternative strategies on failure
- A maximum retry count (100) prevents infinite retry loops
- If rescue does not call `retry` and does not throw, its return value becomes the operation result
- Rescue handlers are inherited through `[extend]` unless overridden (see [Subcontracting](#subcontracting))

### Continuous Invariants

`[invariant]` predicates are not only checked at construction time: they are also checked **around every fold/unfold operation**. The invariant is verified both **before** and **after** the operation executes, ensuring that operations maintain the structural integrity of the data.

```ts
import { data, fold, invariant, InvariantError } from '@lapis-lang/lapis-js';

const Stack = data(({ Family, T }) => ({
    Empty: {},
    Push: {
        [invariant]: (self) => self.size >= 0,
        value: T,
        rest: Family(T)
    },
    size: fold({ out: Number })({
        Empty() { return 0; },
        Push({ rest }) { return 1 + rest; }
    })
}));
```

**Key points:**

- Without contracts, `[invariant]` is only checked at construction time
- Invariants are checked **before** and **after** every operation
- If the invariant fails before the operation, an `InvariantError` is thrown (the body never executes)
- If the invariant fails after the operation (or after rescue), an `InvariantError` is thrown
- Invariants are AND-composed through `[extend]` hierarchies (see [Subcontracting](#subcontracting))

### Subcontracting

When a child ADT extends a parent ADT (via `[extend]`) and both define contracts for the same operation, the contracts are composed according to the [Liskov Substitution Principle](https://en.wikipedia.org/wiki/Liskov_substitution_principle) (LSP):

| Contract | Composition Rule | Effect |
| --- | --- | --- |
| **Demands** | OR (weaken) | The child can accept **more** inputs than the parent |
| **Ensures** | AND (strengthen) | The child must satisfy **all** postconditions from both parent and child |
| **Invariant** | AND (strengthen) | All invariants in the inheritance chain must hold |
| **Rescue** | Override or inherit | The child's rescue replaces the parent's; if absent, the parent's is inherited |

**Demands: weakening (OR):**

A child type can weaken preconditions to accept a wider range of inputs:

```ts
const IntExpr = data(({ Family }) => ({
    Lit: { value: Number },
    Add: { left: Family, right: Family },
    eval: fold({
        out: Number,
        // Parent demands: value must be >= 0
        demands: (self) => self.value !== undefined ? self.value >= 0 : true
    })({
        Lit({ value }) { return value; },
        Add({ left, right }) { return left + right; }
    })
}));

const ExtExpr = data(({ Family }) => ({
    [extend]: IntExpr,
    Neg: { operand: Family },
    eval: fold({
        out: Number,
        // Child demands: also accept negative values (weaker = more permissive)
        demands: (self) => self.value !== undefined ? self.value >= -100 : true
    })({
        Neg({ operand }) { return -operand; }
    })
}));

// Effective demand: parent(self) || child(self)
// Value -50 fails parent demand but passes child demand → accepted
```

**Ensures: strengthening (AND):**

```ts
const Base = data(({ Family }) => ({
    Lit: { value: Number },
    eval: fold({
        out: Number,
        ensures: (self, old, result) => result >= 0    // Parent: result non-negative
    })({
        Lit({ value }) { return Math.abs(value); }
    })
}));

const Extended = data(({ Family }) => ({
    [extend]: Base,
    eval: fold({
        out: Number,
        ensures: (self, old, result) => result <= 100  // Child: result at most 100
    })({})
}));

// Effective ensures: parent(result) && child(result)
// Result must be both >= 0 AND <= 100
```

**Rescue: override or inherit:**

```ts
const Base = data(({ Family }) => ({
    Lit: { value: Number },
    eval: fold({
        out: Number,
        rescue: (self, error) => 0  // Parent rescue: default to 0
    })({
        Lit({ value }) { return value; }
    })
}));

const Extended = data(({ Family }) => ({
    [extend]: Base,
    Neg: { operand: Family },
    eval: fold({
        out: Number,
        rescue: (self, error) => -1  // Child rescue: override, default to -1
    })({
        Neg({ operand }) { return -operand; }
    })
}));

// If no child rescue is defined, the parent's rescue is inherited
```

### The Order of Assertions

When an operation is invoked, the assertions are evaluated in the following order:

**Happy path** (no errors):

1. **Invariant pre-check**: verify invariant holds before the operation
2. **Demands**: verify precondition
3. **Capture old state**: snapshot for `ensures` predicate
4. **Execute body**: run the operation handler
5. **Ensures**: verify postcondition against old state and result
6. **(Invariant post-check)**: verify invariant still holds after the operation

**Error path** (body or ensures throws):

1. **Invariant pre-check**
2. **Demands**
3. **Execute body** → throws
4. **Rescue**: if defined, handles the error
   - If `retry` is called → go back to step 2
   - If rescue returns a value → that becomes the result
5. **Invariant post-check**

**Special cases:**

- If **demands** fails → `DemandsError` is raised directly to the caller. The body is never entered, invariant is not re-checked (the operation cannot have modified state without executing).
- If **invariant pre-check** fails → `InvariantError` is raised. The body is never entered.
- If **rescue** throws or does not call `retry` → the invariant is checked before the error propagates.

### Contracts on Behavior (Codata)

Contracts work on `behavior` types the same way they work on `data` types. Demands and ensures can be specified on both unfold (construction) and fold (consumption) operations:

```ts
import { behavior, fold, unfold, DemandsError } from '@lapis-lang/lapis-js';

const Stream = behavior(({ Self, T }) => ({
    head: T,
    tail: Self(T),

    // Unfold with demands: seed must be non-negative
    From: unfold({
        in: Number,
        out: Self,
        demands: (self, seed) => typeof seed === 'number' && seed >= 0
    })({
        head: (n) => n,
        tail: (n) => n + 1
    }),

    // Fold with demands + ensures + rescue
    take: fold({
        in: Number,
        out: Array,
        demands: (self, n) => typeof n === 'number' && n >= 0,
        ensures: (self, old, result, n) =>
            Array.isArray(result) && result.length <= n,
        rescue: (self, error, args) => {
            console.log(`take failed: ${error.message}`);
            return []; // Fallback to empty array
        }
    })({
        _: ({ head, tail }, n) => n > 0 ? [head, ...tail(n - 1)] : []
    }),

    // Fold with contracts
    sum: fold({
        in: Number,
        out: Number,
        demands: (self, n) => n >= 0,
        ensures: (self, old, result) => typeof result === 'number'
    })({
        _: ({ head, tail }, n) => n > 0 ? head + tail(n - 1) : 0
    })
}));

const NumStream = Stream({ T: Number });

const nats = NumStream.From(0);
console.log(nats.take(5)); // [0, 1, 2, 3, 4]
console.log(nats.sum(5));  // 10

try {
    NumStream.From(-1); // DemandsError: seed must be >= 0
} catch (e) {
    console.log(e instanceof DemandsError); // true
}

try {
    nats.take(-1); // DemandsError: n must be >= 0
} catch (e) {
    console.log(e instanceof DemandsError); // true
}
```

**See also:**

- `examples/contracts-stack.mts`: Stack with demands, ensures, rescue, and invariants
- `examples/contracts-fault-tolerant.mts`: Expression tree with fault-tolerant fold
- `examples/contracts-stream.mts`: Behavior stream with contracts

## IO (Effects and the Mealy Machine)

Lapis programs model IO as a **Mealy machine** — a pure state machine that separates *describing* effects from *performing* them. The program itself never executes side effects; it only produces data values that a platform runtime interprets.

IO programs are built with `system()` and run with `run()`, both available as a separate sub-package:

```ts
import { system } from '@lapis-lang/lapis-js';
import { IORequest, IOResponse, run } from '@lapis-lang/lapis-js/io';
```

### What is a Mealy Machine?

A [Mealy machine](https://en.wikipedia.org/wiki/Mealy_machine) is a finite-state machine where outputs depend on both the current state and the current input. In Lapis, the IO system has four parts:

- **State** — the program’s internal state, threaded through each IO cycle
- **Output** — an `IORequest` value describing what IO to perform next
- **Input** — an `IOResponse` value carrying the result of that IO
- **Transition** — `respond(state)(IOResponse) → nextState`

Formally, each step is a function:

$$\text{step}: S \to \text{IORequest} \times (\text{IOResponse} \to S)$$

where $S$ is the state type. The first projection (`request`) produces the output, and the second projection (`respond`) consumes the input and returns the next state. The loop terminates when `request(state)` returns `IORequest.Done`.

### Sync Program, Async Runtime

The Mealy machine design creates a clean boundary between synchronous program logic and asynchronous IO execution. This separation is reflected in the package structure: `system()` lives in the platform-agnostic core (`@lapis-lang/lapis-js`) and returns a plain data value — a `MealyMachine` record with `init`, `request`, and `respond`. The runtime (`run`, `executeRequest`) lives in the platform sub-package (`@lapis-lang/lapis-js/io`) and is the only place that touches `Promise`, browser APIs, or timers. Because the machine is just a plain object, any interpreter can drive it — the reference browser runtime, a Node adapter, or a fully synchronous test mock.

| | Program | Runtime |
| --- | --- | --- |
| **Purity** | Pure — no side effects | Impure — performs actual IO |
| **Sync/Async** | Synchronous — `request` and `respond` are pure functions over immutable state | Asynchronous — `run()` and `executeRequest()` are `async` |
| **Determinism** | Deterministic — same `IOResponse` sequence always produces same `IORequest` sequence | Non-deterministic — network, timing, user input |
| **Testability** | Mock interpreter drives the loop synchronously | Real IO requires browser APIs |

The program never encounters `Promise`, `async`, `await`, or callbacks. All asynchrony is encapsulated inside the runtime:

```ts
// Program side (sync, pure) — this is what you write
const app = system({}, () => ({
    init: { url: '/api/data', phase: 'fetch' },
    request: ({ url }) => IORequest.HttpGet({ url }),
    respond: (_s) => (res) => ({ phase: 'done', body: res.body })
}));

app.request(app.init);              // IORequest.HttpGet({ url: '/api/data' })
app.respond(app.init)(someResult);  // next state (synchronous)

// Runtime side (async, impure) — this is what runs it
const exitCode = await run(app);    // internally awaits fetch, setTimeout, etc.
```

This means programs can be tested with a fully synchronous mock interpreter:

```ts
function testRun(machine, responses) {
    let state = machine.init;
    const requests = [];
    for (const response of responses) {
        requests.push(machine.request(state));
        state = machine.respond(state)(response);
    }
    requests.push(machine.request(state));
    return requests;
}

// No async needed — pure deterministic state transitions
const requests = testRun(app,
    [IOResponse.HttpResult({ status: 200, body: '{"ok":true}' })]
);
```

### IORequest and IOResponse

`IORequest` is an algebraic data type describing what IO operation to perform. `IOResponse` describes the result. Both are defined with `data()` and cover four IO quadrants:

|  | **Single** (one value) | **Multiple** (stream) |
| --- | --- | --- |
| **Pull** (program asks) | `Read` → `ReadResult`<br> `Write` → `WriteResult`<br> `HttpGet` → `HttpResult`<br> `GetTime` → `TimeResult` | `OpenStream` → `StreamOpened`<br> `ReadChunk` → `StreamChunk` / `EndOfStream`<br> `CloseStream` → `None` |
| **Push** (environment notifies) | `Listen` → `EventResult`<br> `Timer` → `TimerResult` | `Subscribe` → `EventResult`<br> `AwaitEvent` → `EventResult` |
| **Terminal** | `Done({ code })` — exits the loop | |

| Quadrant | IORequest | IOResponse | Description |
| --- | --- | --- | --- |
| Pull/Single | `Read({ path })` | `ReadResult({ content })` | Fetch a resource by URL/path |
| Pull/Single | `Write({ message })` | `WriteResult` | Output a message |
| Pull/Single | `HttpGet({ url })` | `HttpResult({ status, body })` | HTTP GET request |
| Pull/Single | `GetTime` | `TimeResult({ now })` | Current timestamp |
| Pull/Multiple | `OpenStream({ path })` | `StreamOpened({ handle })` | Open a readable stream |
| Pull/Multiple | `ReadChunk({ handle })` | `StreamChunk({ data })` | Read the next chunk |
| Pull/Multiple | `ReadChunk({ handle })` | `EndOfStream` | Stream exhausted |
| Pull/Multiple | `CloseStream({ handle })` | `None` | Close an open stream |
| Push/Single | `Listen({ event })` | `EventResult({ payload })` | Wait for a named event |
| Push/Single | `Timer({ ms })` | `TimerResult` | Delay for a duration |
| Push/Multiple | `Subscribe({ source })` | `EventResult({ payload })` | Subscribe to an event source |
| Push/Multiple | `AwaitEvent` | `EventResult({ payload })` | Wait for a generic event |
| Terminal | `Done({ code })` | — | Terminate with exit code |

```ts
import { IORequest, IOResponse } from '@lapis-lang/lapis-js/io';

// Structured variants are constructed with fields
const req = IORequest.Read({ path: '/data.json' });
console.log(req.path);                   // '/data.json'
console.log(req instanceof IORequest);    // true

// Singleton variants are accessed as properties
const time = IORequest.GetTime;
console.log(time instanceof IORequest);   // true

// Responses follow the same pattern
const res = IOResponse.HttpResult({ status: 200, body: '{"ok":true}' });
console.log(res.status);                  // 200
console.log(res instanceof IOResponse);   // true
```

Guards are enforced on construction — passing the wrong type throws a `TypeError`:

```ts
IORequest.Read({ path: 42 });   // TypeError: path must be a String
IORequest.Done({ code: 'ok' }); // TypeError: code must be a Number
```

### Building an IO Program

Use `system()` to define a Mealy machine as a plain object with three properties:

```ts
import { system } from '@lapis-lang/lapis-js';
import { IORequest, IOResponse, run } from '@lapis-lang/lapis-js/io';

type State = { phase: string; url: string; content: string };

const app = system({}, () => ({
    init: { phase: 'fetch', url: '/api/data', content: '' } as State,
    request: ({ phase, url, content }: State) => {
        if (phase === 'fetch')   return IORequest.HttpGet({ url });
        if (phase === 'display') return IORequest.Write({ message: content });
        return IORequest.Done({ code: 0 });
    },
    respond: ({ phase, url }: State) => (response: any): State => {
        if (phase === 'fetch')
            return { phase: 'display', url, content: response.body };
        return { phase: 'done', url, content: '' };
    }
}));

const exitCode = await run(app);
console.log('Exited with code:', exitCode);
```

- **`init`** — the initial state value
- **`request(state)`** — returns an `IORequest` description of the next IO action
- **`respond(state)(response)`** — returns the next state given the IO result

### The IO Loop

The Mealy machine protocol proceeds as a deterministic loop:

```text
┌─────────────────────────────────────────────┐
│                                             │
│  ┌───────┐  request   ┌─────────┐  execute   │
│  │ state ├───────────►│IORequest├──────────┐ │
│  │       │            └─────────┘          │ │
│  │       │◄───────────┬──────────┐         │ │
│  └───────┘  respond   │IOResponse│◄────────┘ │
│                      └──────────┘           │
│            repeats until Done                │
└─────────────────────────────────────────────┘
```

1. Call `request(state)` → an `IORequest` value
2. The runtime performs the described IO → an `IOResponse` value
3. Call `respond(state)(response)` → the next state
4. Repeat until `request(state)` returns `IORequest.Done`

The program is pure at every step — the runtime is the sole source of side effects.

### Running a Program

The `run` function drives the IO loop using browser-native APIs (`fetch`, `console.log`, `setTimeout`, `addEventListener`):

```ts
import { run } from '@lapis-lang/lapis-js/io';

const exitCode = await run(app);
console.log('Exited with code:', exitCode);
```

`run` returns a `Promise<number>` that resolves with the exit code from `IORequest.Done`.

The reference runtime maps each `IORequest` to browser APIs:

| IORequest | Browser API |
| --- | --- |
| `Read({ path })` | `fetch(path)` → `response.text()` |
| `Write({ message })` | `console.log(message)` |
| `HttpGet({ url })` | `fetch(url)` → `{ status, body }` |
| `GetTime` | `Date.now()` |
| `OpenStream({ path })` | `fetch(path)` → `response.body.getReader()` |
| `ReadChunk({ handle })` | `reader.read()` → `TextDecoder.decode(chunk)` |
| `CloseStream({ handle })` | `reader.cancel()` |
| `Timer({ ms })` | `setTimeout` (via Promise) |
| `Listen({ event })` | `window.addEventListener(event, ..., { once: true })` |
| `Subscribe({ source })` | `window.addEventListener(source, ..., { once: true })` |
| `AwaitEvent` | `window.addEventListener('lapis-event', ..., { once: true })` |

You can also call `executeRequest(request)` directly for custom interpreters or testing:

```ts
import { executeRequest } from '@lapis-lang/lapis-js/io';

const response = await executeRequest(IORequest.GetTime);
console.log(response.now); // e.g. 1700000000000
```

### Contracts on IO

Contracts integrate naturally with the IO protocol. Use `DemandsError` to validate state in `request`:

```ts
import { system, DemandsError } from '@lapis-lang/lapis-js';
import { IORequest, run } from '@lapis-lang/lapis-js/io';

type State = { args: string[] };

const app = system({}, () => ({
    init: { args: ['/input.txt'] } as State,
    request({ args }: State) {
        if (!args || args.length === 0)
            throw new DemandsError('request', 'app', ({ args }: State) => args.length > 0);
        return IORequest.Write({ message: args[0] });
    },
    respond(_state: State) {
        return (_response: any): State => ({ args: [] });
    }
}));

app.request({ args: ['hello'] }); // OK
app.request({ args: [] });        // throws DemandsError
```

### Event Handling (Listen, Subscribe, AwaitEvent)

The event-related IO requests integrate with the browser’s `CustomEvent` system:

- **`Listen({ event })`** — waits for a single `CustomEvent` with the given event name on `window`
- **`Subscribe({ source })`** — waits for a single `CustomEvent` with the given source name on `window`
- **`AwaitEvent`** — waits for a single `CustomEvent` named `'lapis-event'` on `window`

External code dispatches events to drive the program:

```ts
// From the Lapis program:
// request: () => IORequest.Listen({ event: 'user-action' })

// From external code (e.g., a button click handler):
window.dispatchEvent(new CustomEvent('user-action', {
    detail: 'button-clicked'
}));

// The runtime delivers IOResponse.EventResult({ payload: 'button-clicked' })
// to the program's respond continuation.
```

This enables reactive patterns like the Elm architecture — the program declares what events it wants, and the runtime bridges them:

```ts
import { system } from '@lapis-lang/lapis-js';
import { IORequest, IOResponse, run } from '@lapis-lang/lapis-js/io';

type State = { phase: 'render' | 'listen' | 'done'; count: number };

const counter = system({}, () => ({
    init: { phase: 'render', count: 0 } as State,
    request: ({ phase, count }: State) => {
        if (phase === 'render')
            return IORequest.Write({ message: `Count: ${count}` });
        if (phase === 'listen')
            return IORequest.Listen({ event: 'counter-action' });
        return IORequest.Done({ code: 0 });
    },
    respond: ({ phase, count }: State) => (response: any): State => {
        if (phase === 'render') return { phase: 'listen', count };
        if (phase === 'listen') {
            const action = response.payload;
            if (action === 'increment') return { phase: 'render', count: count + 1 };
            if (action === 'decrement') return { phase: 'render', count: count - 1 };
            if (action === 'quit')      return { phase: 'done', count };
        }
        return { phase: 'done', count };
    }
}));

run(counter);
```

**Key points:**

- IO is modeled as a Mealy machine — programs emit `IORequest` descriptions, never perform side effects directly
- `system()` defines the protocol: `init` (starting state), `request(state)` (current IO description), and `respond(state)(response)` (state transition on IO result)
- `run(app)` drives the loop using browser-native APIs until `IORequest.Done` is observed
- The platform runtime is the sole interpreter of IO descriptions — replaceable for testing or different environments
- Contracts (`DemandsError`, `EnsuresError`) can be applied inside `request` or `respond` functions

**See also:**

- `examples/io-cli-cat.mts`: Fetch a resource and display its contents
- `examples/io-echo-server.mts`: Cyclic event handler with Listen/Write loop
- `examples/io-counter-reactive.mts`: Reactive counter with Subscribe/AwaitEvent

## Module System

Lapis JS provides a first-class module system following Bracha's
["Ban on Imports"](http://gbracha.blogspot.com/2009/06/ban-on-imports.html) philosophy:
modules are values, not declarations. A module is a function from its dependencies to its
exports — dependencies are injected explicitly rather than resolved through a global import
mechanism.

```ts
import { module, system, extend } from '@lapis-lang/lapis-js';
```

### Defining a Module

`module(spec, body)` creates a **`ModuleDef`** — a callable that accepts a dependency object
and returns a frozen record of exports. Module bodies may only export Lapis types: values
produced by `data()`, `behavior()`, `relation()`, or `observer()`.

```ts
import { module, data } from '@lapis-lang/lapis-js';

// A module with no dependencies
const GeometryModule = module({}, () => ({
    Point: data(() => ({
        Point2D: { x: Number, y: Number },
        Point3D: { x: Number, y: Number, z: Number }
    }))
}));

const geo = GeometryModule({});
const { Point } = geo;
const p = Point.Point2D({ x: 3, y: 4 });
console.log(p.x); // 3
console.log(p.y); // 4

// Exports are frozen — mutation throws at runtime
(geo as any).Point = null; // TypeError
```

Modules receive their dependencies at instantiation time:

```ts
const TypedListModule = module({}, ({ T }: { T: Function }) => ({
    List: data(({ Family }) => ({
        Nil:  {},
        Cons: { head: T, tail: Family }
    }))
}));

const NumList = TypedListModule({ T: Number });
const StrList = TypedListModule({ T: String });
```

Each call to a `ModuleDef` produces an independent instance — `body` is re-executed, so
every instantiation gets its own fresh ADT class:

```ts
const a = TypedListModule({ T: Number });
const b = TypedListModule({ T: String });
console.log(a.List !== b.List); // true — different ADT types
```

### Module Contracts

The first argument to `module()` is a **`ModuleSpec`** — an optional contract object with
three optional predicates and an optional `name`:

| Field | Purpose |
| --- | --- |
| `name` | Human-readable identifier included in contract error messages |
| `extend` | Parent `ModuleDef` whose exports are inherited and contracts composed (LSP rules) |
| `demands(deps)` | Precondition on supplied dependencies — checked before the body runs |
| `invariant(deps)` | Coherence constraint across dependencies — checked after `demands` passes |
| `ensures(exports)` | Postcondition on produced exports — checked after exports are built |

#### Naming modules for better error messages

When a system has many modules, contract errors that say `on ModuleDef` are hard to
diagnose. Supplying `name` adds the identifier to every error thrown during instantiation:

```ts
import { module, data, DemandsError } from '@lapis-lang/lapis-js';

const AuthModule = module(
    {
        name: 'AuthModule',
        demands: ({ db }: { db: unknown }) => db != null
    },
    ({ db }) => ({
        // ...
    })
);

AuthModule({ db: null });
// DemandsError: Precondition failed for operation 'module:instantiate' on ModuleDef 'AuthModule'
//   Demand: ({ db }) => db != null
```

Without `name`, the error reads `on ModuleDef`. `name` is purely advisory — it has no
effect on contract evaluation or module behaviour.

Violating a predicate throws the corresponding error class (`DemandsError`, `InvariantError`,
`EnsuresError` from `@lapis-lang/lapis-js`):

```ts
import { module, data, DemandsError } from '@lapis-lang/lapis-js';

const ValidatedListModule = module(
    {
        demands:   ({ T }: { T: Function }) => typeof T === 'function',
        ensures:   (exp: { List: unknown }) => 'List' in exp,
        invariant: ({ T }: { T: Function }) => T !== null
    },
    ({ T }: { T: Function }) => ({
        List: data(({ Family }) => ({
            Nil:  {},
            Cons: { head: T, tail: Family }
        }))
    })
);

ValidatedListModule({ T: Number });           // passes
ValidatedListModule({ T: null as any });      // InvariantError — T is null
```

Contracts fire in the order: `demands` → `invariant` → body → `ensures`.

### Module Extension with `extend`

A module's spec may include `extend: ParentModuleDef` to inherit the parent's exports.
Child exports are layered on top of the parent — child keys override parent keys.
Dependencies are shared: the same `deps` object is passed to both parent and child bodies:

```ts
import { module, data } from '@lapis-lang/lapis-js';

const Stack = data(({ Family }) => ({
    Empty: {},
    Push:  { top: Number, rest: Family }
}));

const BaseCollectionModule = module({}, () => ({ Stack }));

const ExtendedCollectionModule = module({ extend: BaseCollectionModule }, () => ({
    Queue: data(({ Family }) => ({          // add Queue
        Empty:   {},
        Enqueue: { front: Number, rest: Family }
    }))
}));

const coll = ExtendedCollectionModule({});
console.log('Stack' in coll); // true  (inherited)
console.log('Queue' in coll); // true  (own)

// Original module is unmodified
console.log('Queue' in BaseCollectionModule({})); // false
```

Extension chains are resolved depth-first, root-first — a grandparent's exports are
underlaid by the parent's, which are underlaid by the child's:

```ts
const TypeA = data(() => ({ A: {} }));
const TypeB = data(() => ({ B: {} }));
const TypeC = data(() => ({ C: {} }));

const A = module({}, () => ({ TypeA }));
const B = module({ extend: A }, () => ({ TypeB }));
const C = module({ extend: B }, () => ({ TypeC }));

const c = C({});
console.log('TypeA' in c); // true  (from A)
console.log('TypeB' in c); // true  (from B)
console.log('TypeC' in c); // true  (from C)
```

TypeScript infers the merged export type automatically — `c.TypeA`, `c.TypeB`, and `c.TypeC`
are all fully typed without any manual annotation.

### Contract Subcontracting in Modules

When modules are composed via `extend` in the spec, contracts are composed using
[Liskov Substitution Principle (LSP)](https://en.wikipedia.org/wiki/Liskov_substitution_principle)
subcontracting rules across the full ancestor chain:

| Contract | Composition rule | Meaning |
| --- | --- | --- |
| `demands` | OR-weakened (∨) | Either parent's or child's precondition is sufficient |
| `ensures` | AND-strengthened (∧) | Both parent's and child's postcondition must hold |
| `invariant` | AND-strengthened (∧) | Both parent's and child's invariant must hold |

```ts
const SharedADT = data(() => ({ Item: {} }));

const Strict = module(
    { demands: ({ T }: { T: Function }) => T === Number || T === String },
    ({ T: _T }: { T: Function }) => ({ Item: SharedADT })
);

const Relaxed = module(
    { extend: Strict, demands: ({ T }: { T: Function }) => typeof T === 'function' }, // weaker
    ({ T: _T }: { T: Function }) => ({
        ExtItem: data(() => ({ Ext: {} }))
    })
);

// T=Boolean: fails Strict (only Number|String) but passes Relaxed (any function) → OR → allowed
Relaxed({ T: Boolean }); // ok

// T=null: fails both → DemandsError
Relaxed({ T: null as any }); // throws DemandsError
```

### system() — Programs as Mealy Machines

`system(modules, wiring)` is the program entry point. It composes a set of module
definitions and returns a **Mealy machine**: `{ init, request, respond }`.

The distinction from plain module instantiation is intentional:

- **Library composition** — plain module calls: `const { MyType } = MyModule({ dep })`
- **IO programs** — `system()`: returns `{ init, request, respond }` for the platform runtime

```ts
import { module, system, data } from '@lapis-lang/lapis-js';

const ShapeModule = module({}, () => ({
    Shape: data(() => ({
        Circle: { radius: Number },
        Square: { side: Number }
    }))
}));

const app = system(
    { Shapes: ShapeModule },
    ({ Shapes }) => {
        const { Shape } = Shapes({});
        const init = Shape.Circle({ radius: 5 });
        return {
            init,
            request: (s: { radius: number }) => ({
                type: 'Write',
                message: `Circle area: ${(Math.PI * s.radius ** 2).toFixed(2)}`
            }),
            respond: (s: { radius: number }) => (_r: unknown) => s
        };
    }
);

console.log(app.request(app.init));
// { type: 'Write', message: 'Circle area: 78.54' }
```

The second argument — the `wiring` callback — receives the module *definitions* (not
instances). It is responsible for instantiating them with their dependencies and connecting
them together:

```ts
const TagModule = module({}, () => ({
    Tag: data(() => ({ Tag: { label: String } }))
}));

const WrappedModule = module(
    {},
    ({ TagClass }: { TagClass: object }) => ({
        Wrapped: data(() => ({ Wrapped: { source: TagClass } }))
    })
);

const app = system(
    { Tags: TagModule, Wrapped: WrappedModule },
    ({ Tags, Wrapped }) => {
        const { Tag } = Tags({});
        const { Wrapped: WrappedADT } = Wrapped({ TagClass: Tag });
        const t = Tag.Tag({ label: 'startup' });
        const init = WrappedADT.Wrapped({ source: t });
        return {
            init,
            request: (s: { source: { label: string } }) => ({ output: `INFO: ${s.source.label}` }),
            respond: (_s: unknown) => (_r: unknown) => init
        };
    }
);

console.log(app.request(app.init).output); // 'INFO: startup'
```

`system()` validates the return value — it throws `TypeError` if `init`, `request`, or
`respond` is missing or has the wrong shape.

The returned Mealy machine is driven by the platform runtime (e.g. `run()` from
`@lapis-lang/lapis-js/io`), which executes the IO loop until `IORequest.Done` is observed.

## References, Inspirations, and Further Reading

- [Algebraic Data Types in JavaScript (2008)](https://w3future.com/weblog/stories/2008/06/16/adtinjs.xml)
- [Brevity - Michael Haufe (2022)](https://github.com/mlhaufe/brevity)
- [Design by Contract - Wikipedia](https://en.wikipedia.org/wiki/Design_by_contract)
- [Decorator Contracts - Final Hill](https://github.com/final-hill/decorator-contracts)
- [From Object Algebras to Finally Tagless Interpreters - Oleksandr Manzyuk (2014)](https://web.archive.org/web/20181211210520/https://oleksandrmanzyuk.wordpress.com/2014/06/18/from-object-algebras-to-finally-tagless-interpreters-2/)
- [Extensibility for the Masses - Bruno C. d. S. Oliveira and William R. Cook (2012)](https://www.cs.utexas.edu/~wcook/Drafts/2012/ecoop2012.pdf)
- [Liskov Substitution Principle - Wikipedia](https://en.wikipedia.org/wiki/Liskov_substitution_principle)
- [Object-Oriented Software Construction - Bertrand Meyer (1997)](https://en.wikipedia.org/wiki/Object-Oriented_Software_Construction)
