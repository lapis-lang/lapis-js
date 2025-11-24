# Lapis JS

Lapis JS is an embedded DSL for experimentation of the semantics for the upcoming Lapis programming language.
This is best described informally as a Bialgebraic programming language with support for Algebraic Data Types (ADTs), Subtyping, Codata, Protocols, Effects, and Contracts.

This should feel familiar to users of functional programming languages like Haskell, OCaml, F#, and Scala, but here
there is an emphasis on the Bird-Meertens Formalism (BMF) (Squiggol) of making programs by combining data and codata through folds and unfolds (and their various duals and combinations).

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

## Algebraic Data Types (ADTs)

### Simple Enumerated Types

Data types like simple enumerations can be defined as such:

```ts
import { data } from '@lapis-lang/lapis-js';

const Color = data({ Red: {}, Green: {}, Blue: {} });

// Color is the data type; Red, Green, Blue are singleton variants
console.log(Color.Red instanceof Color); // true
console.log(Color.Green instanceof Color); // true

// Type checking with instanceof
if (Color.Red instanceof Color)
    console.log("It's a Color!");
```

- Variant names, being constructors, must be **PascalCase** (start with uppercase letter)
- Variant definitions use empty object literals `{}` to indicate simple singleton variants

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
const Point = data({
    Point2D: { x: Number, y: Number },
    Point3D: { x: Number, y: Number, z: Number }
});
```

- Variant names must be **PascalCase**
- Field names must be **camelCase** (start with lowercase letter, no underscore prefix)
- Field values specify the Guard of the field (e.g., `Number`, `String`, other ADTs, or predicates).
  - Guards are described below.

Variants can be constructed by calling them as functions with named arguments (object form) or positional arguments (tuple form):

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

In the above, `Family` is a reserved special reference to the ADT being defined, allowing recursive references. `Family` references are validated at **runtime** with `instanceof` checks against the ADT family. Since the `Peano` ADT is not parameterized, it can be used directly without instantiation.
In other words `Family` is equivalent to `Family()` for non-parameterized recursive ADTs.

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

Extend existing ADTs with new variants using the `.extend()` method. This enables open ADTs that can be incrementally extended while maintaining proper subtyping relationships.

Like `data()`, `.extend()` supports both object literal and callback forms:

```ts
// Base ADT
const Color = data({ Red: {}, Green: {}, Blue: {} });

// Object literal form (for simple extensions without Family/type parameters)
const ExtendedColor1 = Color.extend({ Yellow: {}, Orange: {} });

// Callback form (required when using Family for recursive ADTs)
const ExtendedColor2 = Color.extend(() => ({ Yellow: {}, Orange: {} }));

// Inherited variants accessible on extended ADT
console.log(ExtendedColor1.Red);    // Inherited singleton
console.log(ExtendedColor1.Yellow); // New singleton

// Proper subtyping
console.log(ExtendedColor1.Yellow instanceof Color); // true (new variants are instanceof base)
console.log(ExtendedColor1.Red instanceof ExtendedColor1); // false (inherited variants maintain original type)
console.log(ExtendedColor1.Red === Color.Red); // true (singleton identity preserved)
```

### Extending recursive ADTs

Use the callback style with `Family` to extend recursive ADTs. The `Family` reference in extended variants accepts instances from any level of the hierarchy:

```ts
// Base expression language
const IntExpr = data(({ Family }) => ({
    IntLit: { value: Number },
    Add: { left: Family, right: Family }
}));

// Extend with boolean operations
const IntBoolExpr = IntExpr.extend(({ Family }) => ({
    BoolLit: { value: Boolean },
    LessThan: { left: Family, right: Family }
}));

// Extend further with variables
const FullExpr = IntBoolExpr.extend(({ Family }) => ({
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

A fold is a way to define operations on ADTs that support pattern matching and structural recursion (catamorphisms). Unlike folds you may have seen in other languages, Lapis ADT folds unify both pattern matching and structural recursion into a single mechanism and are more declarative.
For non-recursive ADTs, folds perform simple pattern matching. For recursive ADTs, folds automatically recurse into `Family` fields, replacing constructors with functions. Operations are installed on variant class prototypes and support proper inheritance through the extension hierarchy.

Semantically you can think of folds as creating methods on each variant class that dispatch based on the variant type and recursively process fields as needed.

### Basic Fold Operations

Define operations that dispatch on variant types without recursing into structure:

```ts
const Color = data(() => ({ Red: {}, Green: {}, Blue: {} }))
    .fold('toHex', { out: String }, () => ({
        Red() { return '#FF0000'; },
        Green() { return '#00FF00'; },
        Blue() { return '#0000FF'; }
    }));

console.log(Color.Red.toHex());   // '#FF0000'
console.log(Color.Green.toHex()); // '#00FF00'
console.log(Color.Blue.toHex());  // '#0000FF'
```

### Specs

The second parameter to `.fold()` is the **operation spec** that describes the operation's signature. The spec is an object with the following properties:

- `out`: The return guard of the operation (e.g., `String`, `Number`, etc.)
- `in`: The input guard for parameters (not used in basic folds)

If the guards are not provided, they default to `any` (no validation). The object literal still
needs to be provided if empty: `{}`.

### Fold on Structured Variants

Handlers use **named destructuring** to access variant fields:

```ts
const Point = data(() => ({
    Point2D: { x: Number, y: Number },
    Point3D: { x: Number, y: Number, z: Number }
}).fold('quadrant', { out: String }, () => ({
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
}));

const p = Point.Point2D({ x: 5, y: 10 }));
console.log(p.quadrant()); // 'Q1'

const p3d = Point.Point3D({ x: -1, y: 2, z: 3 }));
console.log(p3d.quadrant()); // 'Octant(false, true, true)'
```

**Handler parameter form:**

- Handlers use **named form only**: `Variant({ field1, field2 }) => ...`
- Partial destructuring allowed: `Point3D({ x, y }) => ...` (ignoring `z`)
- Singleton variants have no parameters: `Red() => ...`

### Wildcard Handlers

Use the `_` wildcard to handle unknown or unspecified variants:

```ts
const Color = data(() => ({ Red: {}, Green: {}, Blue: {} }))
    .fold('toHex', { out: String }, () => ({
        Red() { return '#FF0000'; },
        _(instance) { return '#UNKNOWN'; }
    }));

console.log(Color.Red.toHex());   // '#FF0000'
console.log(Color.Green.toHex()); // '#UNKNOWN' (wildcard)
console.log(Color.Blue.toHex());  // '#UNKNOWN' (wildcard)
```

**Wildcard handler signature:**

```ts
_(instance) {
    // Access variant information
    console.log(instance.constructor.name); // Variant name
    return someValue;
}
```

### Exhaustiveness Checking

Exhaustive handler coverage is enforced at runtime:

#### Option 1: All handlers required (no wildcard)

```ts
// Valid - all variants handled
const Color = data(() => ({ Red: {}, Green: {}, Blue: {} }))
    .fold('toHex', { out: String }, () => ({
        Red() { return '#FF0000'; },
        Green() { return '#00FF00'; },
        Blue() { return '#0000FF'; }
    }));

// Runtime Error - Green and Blue handlers missing
const Incomplete = data(() => ({ Red: {}, Green: {}, Blue: {} }))
    .fold('toHex', { out: String }, () => ({
        Red() { return '#FF0000'; }
        // Missing handlers - will throw at runtime when Green or Blue is encountered
    }));

// Color.Red.toHex() works fine
// Color.Green.toHex() throws: Error: No handler for variant 'Green' in operation 'toHex'
```

#### Option 2: Partial handlers with wildcard

```ts
// Valid - wildcard handles unspecified variants
const Color = data(() => ({ Red: {}, Green: {}, Blue: {} }))
    .fold('toHex', { out: String }, () => ({
        Red() { return '#FF0000'; },
        _(instance) { return '#UNKNOWN'; }
    }));

// Color.Green.toHex() returns '#UNKNOWN' (wildcard handler)
```

#### Extended ADTs and Exhaustiveness

**When extending an existing operation**: Only new variants need handlers (parent provides inherited handlers)

```ts
const Color = data(() => ({ Red: {}, Green: {}, Blue: {} }))
    .fold('toHex', { out: String }, () => ({
        Red() { return '#FF0000'; },
        Green() { return '#00FF00'; },
        Blue() { return '#0000FF'; }
    }));

// Valid - only new variants (Yellow, Orange) need handlers
const ExtendedColor = Color.extend(() => ({ Yellow: {}, Orange: {} }))
    .fold('toHex', { out: String }, () => ({
        Yellow() { return '#FFFF00'; },
        Orange() { return '#FFA500'; }
    }));
```

**When adding a new operation to an extended ADT**: All variants (parent + new) need handlers OR wildcard

```ts
// Runtime Error - Yellow and Orange handlers missing
const ExtendedColor = Color.extend(() => ({ Yellow: {}, Orange: {} }))
    .fold('toRGB', { out: String }, () => ({
        Red() { return 'rgb(255,0,0)'; },
        Green() { return 'rgb(0,255,0)'; },
        Blue() { return 'rgb(0,0,255)'; }
        // Missing Yellow and Orange - will throw at runtime when encountered
    }));

// ExtendedColor.Yellow.toRGB() throws: Error: No handler for variant 'Yellow' in operation 'toRGB'

// All 5 variants handled
const Complete = Color.extend(() => ({ Yellow: {}, Orange: {} }))
    .fold('toRGB', { out: String }, () => ({
        Red() { return 'rgb(255,0,0)'; },
        Green() { return 'rgb(0,255,0)'; },
        Blue() { return 'rgb(0,0,255)'; },
        Yellow() { return 'rgb(255,255,0)'; },
        Orange() { return 'rgb(255,165,0)'; }
    }));

// Or use wildcard for unhandled variants
const WithWildcard = Color.extend(() => ({ Yellow: {}, Orange: {} }))
    .fold('toRGB', { out: String }, () => ({
        Red() { return 'rgb(255,0,0)'; },
        Green() { return 'rgb(0,255,0)'; },
        Blue() { return 'rgb(0,0,255)'; },
        _(instance) { return 'rgb(128,128,128)'; } // Handles Yellow, Orange
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

Chain `.fold()` calls to define multiple operations on the same ADT:

```ts
const Color = data(() => ({ Red: {}, Green: {}, Blue: {} }))
    .fold('toHex', { out: String }, () => ({
        Red() { return '#FF0000'; },
        Green() { return '#00FF00'; },
        Blue() { return '#0000FF'; }
    }))
    .fold('toRGB', { out: String }, () => ({
        Red() { return 'rgb(255, 0, 0)'; },
        Green() { return 'rgb(0, 255, 0)'; },
        Blue() { return 'rgb(0, 0, 255)'; }
    }));

console.log(Color.Red.toHex()); // '#FF0000'
console.log(Color.Red.toRGB()); // 'rgb(255, 0, 0)'
```

### Structural Recursion (Catamorphisms)

For recursive ADTs, `.fold()` performs **catamorphisms** - structural recursion from leaves to root. The framework automatically recurses into `Family` fields, passing already-folded values to handlers.

**Stack Safety:** Fold operations are implemented using iterative post-order traversal with an explicit work stack, making them stack-safe even for deeply nested structures. This avoids the stack overflow issues that would occur with naive recursive implementations.

```ts
const Peano = data(({ Family }) => ({
    Zero: {},
    Succ: { pred: Family }
}))
.fold('toValue', { out: Number }, () => ({
    Zero() { return 0; },
    Succ({ pred }) { return 1 + pred; }  // pred is already folded to number
}));

const three = Peano.Succ({ pred: Peano.Succ({ pred: Peano.Succ({ pred: Peano.Zero }) }) });
console.log(three.toValue()); // 3

// For lists: right fold (processes tail to head)
const List = data(({ Family }) => ({
    Nil: {},
    Cons: { head: Number, tail: Family }
}))
.fold('sum', { out: Number }, () => ({
    Nil() { return 0; },
    Cons({ head, tail }) { return head + tail; }  // tail is the sum of remaining elements
}));

const list = List.Cons({ head: 1,
    tail: List.Cons({ head: 2,
        tail: List.Cons({ head: 3, tail: List.Nil })
    })
});
console.log(list.sum()); // 6 (1 + (2 + (3 + 0)))

// For trees: processes from leaves to root
const Tree = data(({ Family }) => ({
    Leaf: { value: Number },
    Node: { left: Family, right: Family, value: Number }
}))
.fold('sum', { out: Number }, () => ({
    Leaf({ value }) { return value; },
    Node({ left, right, value }) { return left + right + value; }
}));
```

**Note:** The callback form `() => ({ ... })` is **required** for all fold operations.

### Integration with ADT Extension

Operations defined on a base ADT are inherited by extended ADTs:

```ts
const Color = data(() => ({ Red: {}, Green: {}, Blue: {} }))
    .fold('toHex', { out: String }, () => ({
        Red() { return '#FF0000'; },
        Green() { return '#00FF00'; },
        Blue() { return '#0000FF'; }
    }));
const ExtendedColor = Color.extend(() => ({ Yellow: {}, Orange: {} }));

// Inherited variants have the operation
console.log(ExtendedColor.Red.toHex()); // '#FF0000'

// New variants without handlers throw error
ExtendedColor.Yellow.toHex(); // ✗ Error: No handler for variant 'Yellow'
```

**Use wildcard for open extension:**

```ts
const Color = data(() => ({ Red: {}, Green: {}, Blue: {} }))
    .fold('toHex', { out: String }, () => ({
        Red() { return '#FF0000'; },
        _(instance) { return '#UNKNOWN'; }
    }));

const ExtendedColor = Color.extend(() => ({ Yellow: {}, Orange: {} }));

console.log(ExtendedColor.Red.toHex());    // '#FF0000'
console.log(ExtendedColor.Yellow.toHex()); // '#UNKNOWN' (wildcard)
```

**Add operations to extended ADTs:**

```ts
const ExtendedColor = Color.extend(() => ({ Yellow: {}, Orange: {} }))
    .fold('isWarm', { out: Boolean }, () => ({
        Red() { return true; },
        Green() { return false; },
        Blue() { return false; },
        Yellow() { return true; },
        Orange() { return true; }
    }));

// Both operations available
console.log(ExtendedColor.Red.toHex());  // '#FF0000' (inherited)
console.log(ExtendedColor.Red.isWarm()); // true (new operation)
console.log(ExtendedColor.Yellow.isWarm()); // true
```

### Extending Fold Operations

When calling `.fold()` on an extended ADT with an operation that exists on the parent, extend mode is automatically activated with **polymorphic recursion**.

```ts
const Color = data(() => ({ Red: {}, Green: {}, Blue: {} }))
    .fold('toHex', { out: String }, () => ({
        Red() { return '#FF0000'; },
        Green() { return '#00FF00'; },
        Blue() { return '#0000FF'; }
    }));

// .fold() auto-detects extend mode because parent has 'toHex' operation
const ExtendedColor = Color.extend(() => ({ Yellow: {}, Orange: {} }))
    .fold('toHex', () => ({
        Yellow() { return '#FFFF00'; },
        Orange() { return '#FFA500'; }
    }));

// Inherited variants use parent handlers
console.log(ExtendedColor.Red.toHex()); // '#FF0000'

// New variants use extended handlers
console.log(ExtendedColor.Yellow.toHex()); // '#FFFF00'
```

**Override parent handlers:**

When extending an operation, you can override parent handlers while still accessing the parent's implementation. The `parent` symbol is a unique key that accesses the parent handler when used in the `fields` parameter:

```ts
import { data, parent } from '@lapis-lang/lapis-js';

const ExtendedColor = Color.extend(() => ({ Yellow: {} }))
    .fold('toHex', () => ({
        Yellow() { return '#FFFF00'; },
        Red(fields) {
            // fields[parent]!() calls the parent's Red handler
            return fields[parent]!().replace('FF', 'EE');
        }
    }));

console.log(ExtendedColor.Red.toHex()); // '#EE0000' (overridden)
```

**Replacing parent handlers (ignoring parent):**

```ts
const ExtendedColor = Color.extend(() => ({ Yellow: {} }))
    .fold('toHex', () => ({
        Yellow() { return '#FFFF00'; },
        Red() { return '#EE0000'; } // Replace handler completely (no parent access)
    }));
```

**Wildcard inheritance:**

```ts
const Color = data(() => ({ Red: {}, Green: {} }))
    .fold('toHex', { out: String }, () => ({
        Red() { return '#FF0000'; },
        _(_instance) { return '#UNKNOWN'; } // Wildcard for undefined variants
    }));

const ExtendedColor = Color.extend(() => ({ Blue: {} }))
    .fold('toHex', () => ({
        // Blue not specified - inherits wildcard from parent
    }));

console.log(ExtendedColor.Blue.toHex()); // '#UNKNOWN' (wildcard from parent)
```

**Overriding wildcard handler:**

When you override a wildcard handler, it receives the `parent` parameter first (like any other override):

```ts
const ExtendedColor = Color.extend(() => ({ Blue: {} }))
    .fold('toHex', () => ({
        _({ instance, [parent]: _parent }) {
            return `#EXTENDED-${instance.constructor.name}`;
        }
    }));

console.log(ExtendedColor.Blue.toHex()); // '#EXTENDED-Blue'
```

**Key points:**

- Handlers use **named destructuring**: `Variant({ field1, field2 }) => ...`
- Wildcard `_` receives the variant instance for unhandled cases
- Without wildcard: all variants must have handlers (runtime error if missing)
- With wildcard: handlers are optional (wildcard catches unhandled cases)
- **Extending existing operations**: Only new/overridden variants need handlers
- **New operations on extended ADTs**: All variants need handlers OR wildcard
- Override handlers access parent via `fields[parent]!()`
- Import `parent` symbol: `import { data, parent } from '@lapis-lang/lapis-js'`
- Only one `.fold()` per operation per ADT level
- Operations inherited by extended ADTs
- Chaining supported: `.fold(...).fold(...)`

### Polymorphic Recursion in Extended Folds

When extending fold operations on recursive ADTs, recursive calls use the **extended operation** with new handlers:

```ts
import { data } from '@lapis-lang/lapis-js';

const IntExpr = data(({ Family }) => ({
    IntLit: { value: Number },
    Add: { left: Family, right: Family }
}))
.fold('eval', { out: Number }, () => ({
    IntLit({ value }) { return value; },
    Add({ left, right }) { return left + right; }
}));

// Extend with multiplication - inherited Add works with new Mul
const ExtendedExpr = IntExpr.extend(({ Family }) => ({
    Mul: { left: Family, right: Family }
}))
.fold('eval', () => ({
    Mul({ left, right }) { return left * right; }
}));

// Expression: (2 + 3) * 4
const product = ExtendedExpr.Mul({
    left: ExtendedExpr.Add({
        left: ExtendedExpr.IntLit({ value: 2 }),
        right: ExtendedExpr.IntLit({ value: 3 })
    }),
    right: ExtendedExpr.IntLit({ value: 4 })
});
console.log(product.eval()); // 20
```

**Override parent handlers:**

```ts
import { data, parent } from '@lapis-lang/lapis-js';

const Peano = data(({ Family }) => ({
    Zero: {},
    Succ: { pred: Family }
}))
.fold('toValue', { out: Number }, () => ({
    Zero() { return 0; },
    Succ({ pred }) { return 1 + pred; }
}));

const ExtendedPeano = Peano.extend(({ Family }) => ({
    NegSucc: { pred: Family }
}))
.fold('toValue', () => ({
    NegSucc({ pred }) { return -1 + pred; },
    Succ(fields) {
        const parentResult = fields[parent]!() as number;
        return parentResult * 10;  // Override: scale by 10
    }
}));

console.log(ExtendedPeano.Succ({ pred: ExtendedPeano.Zero }).toValue()); // 10
console.log(Peano.Succ({ pred: Peano.Zero }).toValue()); // 1 (original)
```

## Type Parameter Transformations with Map

`.map()` transforms type parameter values while preserving ADT structure, unlike `.fold()` which collapses structures.

```ts
const List = data(({ Family, T }) => ({
    Nil: {},
    Cons: { head: T, tail: Family(T) }
}))
.map('increment', {}, { T: (x) => x + 1 })
.map('stringify', (Family) => ({ out: Family(String) }), { T: (x) => String(x) });

const list = List.Cons({
    head: 1,
    tail: List.Cons({ head: 2, tail: List.Cons({ head: 3, tail: List.Nil }) })
});

const incremented = list.increment();
console.log(incremented.head); // 2 (structure preserved)

const strings = list.stringify();
console.log(typeof strings.head); // 'string' (type changed)

// Multiple type parameters
const Pair = data(({ T, U }) => ({
    MakePair: { first: T, second: U }
}))
.map('transform', {}, {
    T: (x) => x * 2,
    U: (s) => s.toUpperCase()
});

// Map with arguments
const List2 = data(({ Family, T }) => ({
    Nil: {},
    Cons: { head: T, tail: Family }
}))
.map('scale', (Family) => ({ out: Family }), { T: (x, factor) => x * factor });

const scaled = list.scale(10); // All values multiplied by 10
```

**Key points:**

- Syntax: `.map(name, spec, { T: fn, U: fn })`
- Spec parameter options:
  - `{}` - No validation
  - `{ out: ADT }` - Validates return type against fixed ADT
  - `(Family) => ({ out: Family })` - Callback form for recursive ADTs, returns same family type with transformed parameters
  - `(Family) => ({ out: Family(String) })` - Callback form specifying concrete type parameters for output validation
- Returns new instances with same variant constructors
- Transform functions can accept arguments (passed through recursive calls)
- Partial transforms allowed (missing transforms leave values unchanged)
- Operation names must be camelCase

## Unfold Operations (Corecursion/Anamorphisms)

`.unfold()` generates ADT instances through corecursion (anamorphisms), the dual of fold. While fold consumes structures bottom-up, unfold produces structures top-down from a seed value.

```js
const List = data(({ Family }) => ({
    Nil: {},
    Cons: { head: Number, tail: Family }
}))
.unfold('Range', (List) => ({ in: Number, out: List }), {
    Nil: (n) => (n <= 0 ? {} : null),
    Cons: (n) => (n > 0 ? { head: n, tail: n - 1 } : null)
});

const countdown = List.Range(5);
// Creates: List.Cons(5, List.Cons(4, List.Cons(3, List.Cons(2, List.Cons(1, List.Nil)))))

// Works with parameterized ADTs - operation installed on specific instantiation
const GenericList = data(({ Family, T }) => ({
    Nil: {},
    Cons: { head: T, tail: Family }
}));

const NumList = GenericList(Number)
    .unfold('Range', (NumList) => ({ in: Number, out: NumList }), {
        Nil: (n) => (n <= 0 ? {} : null),
        Cons: (n) => (n > 0 ? { head: n, tail: n - 1 } : null)
    });

// Operation only available on NumList, not on GenericList or GenericList(String)
const nums = NumList.Range(3);  // Works
// GenericList(String).Range(3);  // Error: Range not defined
```

**Key points:**

- Syntax: `.unfold(name, spec, handlers)` where handlers return `{ field: value, ... }` or `null`
- Spec: `(ADT) => ({ in: Guard, out: ADT })` specifies input and output types
- Handlers return field object or `null` to terminate generation
- Unfold creates static methods (PascalCase required)
- Dual to fold: fold consumes (catamorphism), unfold produces (anamorphism)
- State can be passed through recursive calls via tuple `[nextInput, nextState]`
- When called on parameterized ADT instantiation (e.g., `List(Number)`), operation is installed only on that specific instantiation

## Merge Operations (Deforestation)

`.merge()` composes multiple operations (fold, map, unfold) into a single fused operation, eliminating intermediate allocations.

### Recursion Schemes

| Scheme | Operations | Direction | Use Case |
|--------|-----------|-----------|----------|
| **Catamorphism** | `.fold()` | Bottom-up (leaves → root) | Consume/reduce structures |
| **Anamorphism** | `.unfold()` | Top-down (seed → structure) | Generate/produce structures |
| **Hylomorphism** | `.unfold()` + `.fold()` | Generate then consume | Transform without intermediate structure |
| **Paramorphism** | `.map()` + `.fold()` | Transform then consume | Process with transformations |
| **Apomorphism** | `.unfold()` + `.map()` | Generate then transform | Produce with transformations |

### Example

```js
const List = data(({ Family }) => ({
    Nil: {},
    Cons: { head: Number, tail: Family }
}))
.unfold('Range', (List) => ({ in: Number, out: List }), {
    Nil: (n) => (n <= 0 ? {} : null),
    Cons: (n) => (n > 0 ? { head: n, tail: n - 1 } : null)
})
.fold('product', { out: Number }, () => ({
    Nil() { return 1; },
    Cons({ head, tail }) { return head * tail; }
}))
.merge('Factorial', ['Range', 'product']);

console.log(List.Factorial(5)); // 120 (5 * 4 * 3 * 2 * 1) - no intermediate list created
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
.merge('name', ['unfold1', 'fold1'])           // ✓ hylomorphism
.merge('name', ['map1', 'fold1'])              // ✓ paramorphism
.merge('name', ['unfold1', 'map1'])            // ✓ apomorphism
.merge('name', ['map1', 'map2', 'fold1'])      // ✓ multiple maps
.merge('name', ['unfold1', 'map1', 'fold1'])   // ✓ full pipeline

// Invalid compositions
.merge('name', ['fold1'])                      // ✗ Error: need at least 2 operations
.merge('name', [])                             // ✗ Error: empty array
.merge('name', ['unfold1', 'unfold2'])         // ✗ Error: multiple unfolds
.merge('name', ['fold1', 'fold2'])             // ✗ Error: multiple folds
.merge('name', ['unfold1', 'unfold2', 'fold1']) // ✗ Error: multiple unfolds
```

**Naming Conventions:**

Merged operations follow specific naming rules:

- Static methods (with unfold): Must be PascalCase (e.g., `'Factorial'`, `'Range'`)
- Instance methods (without unfold): Must be camelCase (e.g., `'doubleSum'`, `'sumOfSquares'`)

## References, Inspirations, and Further Reading

- [Algebraic Data Types in JavaScript (2008)](https://w3future.com/weblog/stories/2008/06/16/adtinjs.xml)
- [Brevity - Michael Haufe (2022)](https://github.com/mlhaufe/brevity)
- [From Object Algebras to Finally Tagless Interpreters - Oleksandr Manzyuk (2014)](https://web.archive.org/web/20181211210520/https://oleksandrmanzyuk.wordpress.com/2014/06/18/from-object-algebras-to-finally-tagless-interpreters-2/)
- [Extensibility for the Masses - Bruno C. d. S. Oliveira and William R. Cook (2012)](https://www.cs.utexas.edu/~wcook/Drafts/2012/ecoop2012.pdf)
