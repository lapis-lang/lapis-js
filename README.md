# Lapis JS

An embedded DSL for experimentation of Lapis Semantics

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

## Usage

**Note:** Lapis JS is designed for use with TypeScript. TypeScript provides essential compile-time validation including reserved property name checking, exhaustiveness checking for pattern matching, and type inference. While the library can technically be used with plain JavaScript, doing so bypasses important safety checks.

Lapis JS provides a powerful `data` function for defining algebraic data types (ADTs) using a class-based enumeration pattern. ADTs support simple enumerated types, structured data with fields, subtyping, and predicate-based validation.

### Simple Enumerated Types

Define ADTs with simple variants (no data). Each variant creates a single value (singleton):

```ts
import { data } from '@lapis-lang/lapis-js';

const Color = data({ Red: [], Green: [], Blue: [] });

// Color is the data type; Red, Green, Blue are singleton variants
console.log(Color.Red instanceof Color); // true
console.log(Color.Green instanceof Color); // true

// Type checking with instanceof
if (Color.Red instanceof Color) {
    console.log("It's a Color!");
}
```

**Requirements:**

- Variant names must be **PascalCase** (start with uppercase letter)
- Values must be empty arrays `[]`

### Structured Data

Define variants with typed fields using an array of single-key objects. Each object maps a field name to its type. Structured variants are callable constructors (no `new` keyword needed):

```ts
const Point = data({
    Point2D: [{ x: Number }, { y: Number }],
    Point3D: [{ x: Number }, { y: Number }, { z: Number }]
});

// Named arguments (object form)
const p1 = Point.Point2D({ x: 10, y: 20 });
console.log(p1.x); // 10
console.log(p1.y); // 20

// Positional arguments (tuple form)
const p2 = Point.Point2D(10, 20);
console.log(p2.x); // 10
console.log(p2.y); // 20

// Both forms work with 'new' keyword if preferred
const p3 = new Point.Point3D({ x: 1, y: 2, z: 3 });
const p4 = new Point.Point3D(1, 2, 3);

// All variant values support type checking
console.log(p1 instanceof Point.Point2D); // true
console.log(p2 instanceof Point); // true
```

**Supported field types:**

- `Number` - field type is `number`
- `String` - field type is `string`
- `Boolean` - field type is `boolean`
- `Object` - field type is `object`
- `Array` - field type is `unknown[]`
- `Date` - field type is `Date`
- `RegExp` - field type is `RegExp`
- `Symbol` - field type is `symbol`
- `BigInt` - field type is `bigint`
- Other ADTs - field type is the ADT instance
- Predicates - custom validation functions with runtime checks

**Type validation:**

- Built-in types (Number, String, etc.) are validated at **compile-time** by TypeScript
- ADT instances are validated at **runtime** with `instanceof` checks
- Predicates are validated at **runtime** with custom logic

**Requirements:**

- Variant names must be **PascalCase**
- Property names must be **camelCase** (start with lowercase, no underscore prefix)
- Property names cannot be **reserved JavaScript names**: `constructor`, `prototype`, `__proto__`, `toString`, `valueOf`, `hasOwnProperty`, `isPrototypeOf`, `propertyIsEnumerable`, `toLocaleString`
- TypeScript enforces exact object shapes (all fields required, no extra fields allowed)

### Nested ADTs

Fields can reference other ADTs with full type checking:

```ts
const Color = data({ Red: [], Green: [], Blue: [] });

const ColorPoint = data({ 
    Point2: [{ x: Number }, { y: Number }, { color: Color }],
    Point3: [{ x: Number }, { y: Number }, { z: Number }, { color: Color }]
});

const p = ColorPoint.Point2({ x: 5, y: 10, color: Color.Red });
console.log(p.color instanceof Color); // true
console.log(p instanceof ColorPoint); // true
```

### Predicates

Use custom validation functions (predicates) for runtime field validation:

```ts
const isEven = (x: unknown): x is number => 
    typeof x === 'number' && x % 2 === 0;

const EvenPoint = data({ 
    Point2: [{ x: isEven }, { y: isEven }]
});

const p = EvenPoint.Point2({ x: 2, y: 4 }); // ✓ Valid
console.log(p.x); // 2
console.log(p.y); // 4

EvenPoint.Point2({ x: 3, y: 4 }); // ✗ Throws TypeError
// TypeError: Field 'x' failed predicate validation
```

**Predicates enable runtime validation that TypeScript cannot check at compile-time:**

```ts
// Range validation
const inRange = (min: number, max: number) => 
    (x: unknown): x is number => 
        typeof x === 'number' && x >= min && x <= max;

const Percentage = data({
    Value: [{ amount: inRange(0, 100) }]
});

// String validation
const isEmail = (s: unknown): s is string => 
    typeof s === 'string' && s.includes('@');

const User = data({
    RegisteredUser: [{ email: isEmail }, { username: String }]
});
```

### Mixed Variants

Combine simple and structured variants in the same ADT:

```ts
const Shape = data({
    Circle: [{ radius: Number }],
    Square: [{ side: Number }],
    Unknown: []  // Simple variant (singleton)
});

const circle = Shape.Circle({ radius: 5 });
console.log(circle instanceof Shape); // true

const unknown = Shape.Unknown; // Singleton variant
console.log(unknown instanceof Shape); // true
```

### Type Checking

The class-based pattern enables powerful runtime type checking:

```ts
const Color = data({ Red: [], Green: [], Blue: [] });
const Point = data({ 
    Point2D: [{ x: Number }, { y: Number }]
});

// Check against the data type
console.log(Color.Red instanceof Color); // true
console.log(Color.Green instanceof Color); // true

// Check against specific variants
const p = Point.Point2D({ x: 10, y: 20 });
console.log(p instanceof Point.Point2D); // true
console.log(p instanceof Point); // true

// Type guards work correctly
function isColor(value: unknown): value is typeof Color.Red {
    return value instanceof Color;
}
```

### Instance Identity

**Important:** Each call to a variant constructor creates a new instance. Standard JavaScript identity rules apply:

```ts
const Point = data({
    Point2D: [{ x: Number }, { y: Number }]
});

const p1 = Point.Point2D(1, 2);
const p2 = Point.Point2D(1, 2);
console.log(p1 === p2); // false - different instances

// Singletons are always the same instance
const Color = data({ Red: [], Green: [], Blue: [] });
const red1 = Color.Red;
const red2 = Color.Red;
console.log(red1 === red2); // true - same singleton instance
```

**Working with collections:** Use custom comparison for value equality when needed:

```ts
const Point = data({
    Point2D: [{ x: Number }, { y: Number }]
});

const points = [
    Point.Point2D(1, 2),
    Point.Point2D(3, 4),
    Point.Point2D(1, 2)  // Duplicate values, but different instance
];

// For deduplication by value, use custom logic:
const unique = points.filter((p, i, arr) => 
    arr.findIndex(q => p.x === q.x && p.y === q.y) === i
);
console.log(unique.length); // 2
```

### Recursive ADTs

Define recursive data structures using the callback form with `Family` to reference the ADT being defined:

```ts
// Peano numbers
const Peano = data(({ Family }) => ({ 
    Zero: [], 
    Succ: [{ pred: Family }] 
}));

const zero = Peano.Zero;
const one = Peano.Succ({ pred: zero });
const two = Peano.Succ({ pred: one });
console.log(two.pred.pred === zero); // true

// Recursive list
const List = data(({ Family }) => ({ 
    Nil: [], 
    Cons: [{ head: Number }, { tail: Family }] 
}));

const empty = List.Nil;
const list = List.Cons({ head: 1, 
    tail: List.Cons({ head: 2, 
        tail: List.Cons({ head: 3, tail: empty }) 
    }) 
});
console.log(list.head); // 1
console.log(list.tail.head); // 2

// Binary tree
const Tree = data(({ Family }) => ({
    Leaf: [{ value: Number }],
    Node: [{ left: Family }, { right: Family }, { value: Number }]
}));

const leaf1 = Tree.Leaf({ value: 1 });
const leaf2 = Tree.Leaf({ value: 2 });
const tree = Tree.Node({ left: leaf1, right: leaf2, value: 10 });
```

**Key points:**

- Use callback form: `data(({ Family }) => ({ ... }))`
- `Family` represents a recursive reference to the ADT being defined
- `Family` can also be called as `Family(T)` for documentation (both are equivalent)
- Non-parameterized recursive ADTs can be used directly without instantiation

### Parameterized ADTs

Define generic data structures with type parameters using `T`, `U`, `V`, `W`, `X`, `Y`, or `Z` in the callback:

```ts
// Generic Maybe type
const Maybe = data(({ T }) => ({
    Nothing: [],
    Just: [{ value: T }]
}));

const justNum = Maybe.Just({ value: 42 });
const justStr = Maybe.Just({ value: 'hello' });
const nothing = Maybe.Nothing;

// Generic Either type with two type parameters
const Either = data(({ U, V }) => ({
    Left: [{ value: U }],
    Right: [{ value: V }]
}));

// Heterogeneous Pair with different types
const Pair = data(({ T, U }) => ({
    MakePair: [{ first: T }, { second: U }]
}));

// Parameterized recursive list
const List = data(({ Family, T }) => ({
    Nil: [],
    Cons: [{ head: T }, { tail: Family(T) }]  // Family(T) or just Family
}));

const numList = List.Cons({ head: 1, 
    tail: List.Cons({ head: 2, tail: List.Nil }) 
});
const strList = List.Cons({ head: 'a', 
    tail: List.Cons({ head: 'b', tail: List.Nil }) 
});
```

**Type instantiation:**

For stricter type validation, instantiate parameterized ADTs with specific types:

```ts
const List = data(({ Family, T }) => ({
    Nil: [],
    Cons: [{ head: T }, { tail: Family(T) }]
}));

// Instantiate with Number
const NumList = List({ T: Number });
const nums = NumList.Cons({ head: 10, 
    tail: NumList.Cons({ head: 20, tail: NumList.Nil }) 
});

// Instantiate with String
const StrList = List({ T: String });
const strs = StrList.Cons({ head: 'hello', 
    tail: StrList.Cons({ head: 'world', tail: StrList.Nil }) 
});

// Type validation enforced at compile-time by TypeScript
NumList.Cons({ head: 'bad', tail: NumList.Nil }); 
// ✗ TypeScript compile error: Type 'string' is not assignable to type 'number'

// Multiple type parameters
const Pair = data(({ T, U }) => ({
    MakePair: [{ first: T }, { second: U }]
}));

const NumStrPair = Pair({ T: Number, U: String });
const pair = NumStrPair.MakePair({ first: 42, second: 'hello' });
```

**Key points:**

- Available type parameters: `T`, `U`, `V`, `W`, `X`, `Y`, `Z` (7 parameters total)
- Combine `Family` and type parameters for recursive parameterized types
- Without instantiation, accepts any type for type parameters
- With instantiation `ADT({ T: SomeType })`, validates types at compile-time by TypeScript
- Use multiple parameters for heterogeneous data structures (e.g., `Pair` with different types)

### Immutability

All ADT instances and the ADT itself are deeply frozen and immutable:

```ts
const Color = data({ Red: [], Green: [], Blue: [] });

Color.Red = []; // ✗ Throws Error (cannot modify)
Color.Yellow = []; // ✗ Throws Error (cannot add properties)

const Point = data({ Point2D: [{ x: Number }, { y: Number }] });
const p = Point.Point2D({ x: 10, y: 20 });
p.x = 30; // ✗ Throws Error (instance is frozen)
```

### ADT Extension (Subtyping)

Extend existing ADTs with new variants using the `.extend()` method. This enables open ADTs that can be incrementally extended while maintaining proper subtyping relationships:

```ts
// Base ADT
const Color = data({ Red: [], Green: [], Blue: [] });

// Extend with new variants
const ExtendedColor = Color.extend({ Yellow: [], Orange: [] });

// All variants accessible on extended ADT
console.log(ExtendedColor.Red);    // Inherited singleton
console.log(ExtendedColor.Yellow); // New singleton

// Proper subtyping: extended variants are instanceof base
console.log(ExtendedColor.Yellow instanceof Color); // true
console.log(ExtendedColor.Yellow instanceof ExtendedColor); // true

// But inherited variants maintain original type
console.log(ExtendedColor.Red instanceof Color); // true
console.log(ExtendedColor.Red instanceof ExtendedColor); // false

// Singleton identity preserved
console.log(ExtendedColor.Red === Color.Red); // true
```

**Extending structured variants:**

```ts
const Point = data({
    Point2D: [{ x: Number }, { y: Number }]
});

const Point3D = Point.extend({
    Point3D: [{ x: Number }, { y: Number }, { z: Number }]
});

// Create variant values
const p2 = Point3D.Point2D({ x: 10, y: 20 });
const p3 = Point3D.Point3D({ x: 1, y: 2, z: 3 });

// Proper subtyping relationships
console.log(p3 instanceof Point3D); // true
console.log(p3 instanceof Point);   // true

// Constructor identity preserved
console.log(Point3D.Point2D === Point.Point2D); // true

// Values from base ADT are not instanceof extended type
const p2Base = Point.Point2D({ x: 5, y: 10 });
console.log(p2Base instanceof Point);   // true
console.log(p2Base instanceof Point3D); // false
```

**Extending recursive ADTs:**

Use the callback style with `Family` to extend recursive ADTs. The `Family` reference in extended variants accepts instances from any level of the hierarchy:

```ts
// Base expression language
const IntExpr = data(({ Family }) => ({
    IntLit: [{ value: Number }],
    Add: [{ left: Family }, { right: Family }]
}));

// Extend with boolean operations
const IntBoolExpr = IntExpr.extend(({ Family }) => ({
    BoolLit: [{ value: Boolean }],
    LessThan: [{ left: Family }, { right: Family }]
}));

// Extend further with variables
const FullExpr = IntBoolExpr.extend(({ Family }) => ({
    Var: [{ name: String }],
    Let: [{ name: String }, { value: Family }, { body: Family }]
}));

// Build complex expressions
const five = FullExpr.IntLit({ value: 5 });
const x = FullExpr.Var({ name: 'x' });
const lessThan = FullExpr.LessThan({ left: x, right: five });

// Family accepts instances from any level
const letExpr = FullExpr.Let({ 
    name: 'x', 
    value: five,      // IntExpr variant
    body: lessThan    // IntBoolExpr variant
});

// Proper subtyping hierarchy
console.log(letExpr instanceof FullExpr);    // true
console.log(letExpr instanceof IntBoolExpr); // true
console.log(letExpr instanceof IntExpr);     // true

console.log(lessThan instanceof IntBoolExpr); // true
console.log(lessThan instanceof IntExpr);     // true
console.log(lessThan instanceof FullExpr);    // false

console.log(five instanceof IntExpr);     // true
console.log(five instanceof IntBoolExpr); // false
console.log(five instanceof FullExpr);    // false
```

**Key points about extension:**

- Extended ADTs have access to all parent variants (inheritance)
- New variants can be simple enumerations or structured
- Proper subtyping: values of extended variants are `instanceof` both extended and base ADTs
- Inherited variants maintain their original type (not `instanceof` extended ADT)
- Constructor and singleton identity is preserved across hierarchy
- `Family` references accept instances from any level of the hierarchy
- Variant name collisions throw errors
- Extended ADTs are also frozen and immutable
- Supports deep extension hierarchies (A → B → C → ...)

## Pattern Matching (Operations)

Lapis ADTs support defining operations through the `.match()` method, which provides non-recursive pattern matching on variant constructors. Operations are installed on variant class prototypes and support proper inheritance through the extension hierarchy.

### Basic Pattern Matching

Define operations that dispatch on variant types without recursing into structure:

```ts
const Color = data({ Red: [], Green: [], Blue: [] })
    .match('toHex', { out: String }, {
        Red() { return '#FF0000'; },
        Green() { return '#00FF00'; },
        Blue() { return '#0000FF'; }
    });

console.log(Color.Red.toHex());   // '#FF0000'
console.log(Color.Green.toHex()); // '#00FF00'
console.log(Color.Blue.toHex());  // '#0000FF'
```

### Pattern Matching on Structured Variants

Handlers use **named destructuring** to access variant fields:

```ts
const Point = data({
    Point2D: [{ x: Number }, { y: Number }],
    Point3D: [{ x: Number }, { y: Number }, { z: Number }]
}).match('quadrant', { out: String }, {
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
});

const p = Point.Point2D({ x: 5, y: 10 });
console.log(p.quadrant()); // 'Q1'

const p3d = Point.Point3D({ x: -1, y: 2, z: 3 });
console.log(p3d.quadrant()); // 'Octant(false, true, true)'
```

**Handler parameter form:**

- Handlers use **named form only**: `Variant({ field1, field2 }) => ...`
- Partial destructuring allowed: `Point3D({ x, y }) => ...` (ignoring `z`)
- Singleton variants have no parameters: `Red() => ...`

### Wildcard Handlers

Use the `_` wildcard to handle unknown or unspecified variants:

```ts
const Color = data({ Red: [], Green: [], Blue: [] })
    .match('toHex', { out: String }, {
        Red() { return '#FF0000'; },
        _(instance) { return '#UNKNOWN'; }
    });

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

TypeScript enforces **exhaustive pattern matching** at compile-time:

#### Option 1: All handlers required (no wildcard)

```ts
// ✓ Compiles - all variants handled
const Color = data({ Red: [], Green: [], Blue: [] })
    .match('toHex', { out: String }, {
        Red() { return '#FF0000'; },
        Green() { return '#00FF00'; },
        Blue() { return '#0000FF'; }
    });

// ✗ TypeScript Error - Green and Blue handlers missing
const Incomplete = data({ Red: [], Green: [], Blue: [] })
    .match('toHex', { out: String }, {
        Red() { return '#FF0000'; }
        // Error: Property '_' is missing
    });
```

#### Option 2: Partial handlers with wildcard

```ts
// ✓ Compiles - wildcard handles unspecified variants
const Color = data({ Red: [], Green: [], Blue: [] })
    .match('toHex', { out: String }, {
        Red() { return '#FF0000'; },
        _(instance) { return '#UNKNOWN'; }
    });
```

**Key points:**

- Without a wildcard `_`, **all variants must have handlers**
- With a wildcard `_`, handlers are optional (wildcard catches unhandled cases)
- TypeScript catches missing handlers at **compile-time**
- Extends to all variant types: simple enumerations, structured data, recursive ADTs, and extended ADTs

### Multiple Operations

Chain `.match()` calls to define multiple operations on the same ADT:

```ts
const Color = data({ Red: [], Green: [], Blue: [] })
    .match('toHex', { out: String }, {
        Red() { return '#FF0000'; },
        Green() { return '#00FF00'; },
        Blue() { return '#0000FF'; }
    })
    .match('toRGB', { out: String }, {
        Red() { return 'rgb(255, 0, 0)'; },
        Green() { return 'rgb(0, 255, 0)'; },
        Blue() { return 'rgb(0, 0, 255)'; }
    });

console.log(Color.Red.toHex()); // '#FF0000'
console.log(Color.Red.toRGB()); // 'rgb(255, 0, 0)'
```

### Callback Form

For consistency with recursive ADTs, `.match()` supports a callback form that receives the `Family` reference:

```ts
const List = data(({ Family }) => ({
    Nil: [],
    Cons: [{ head: Number }, { tail: Family }]
})).match('isEmpty', { out: Boolean }, (Family) => ({
    Nil() { return true; },
    Cons({ head: _head, tail: _tail }) { return false; }
}));

console.log(List.Nil.isEmpty()); // true
console.log(List.Cons({ head: 1, tail: List.Nil }).isEmpty()); // false
```

### Integration with ADT Extension

Operations defined on a base ADT are inherited by extended ADTs:

```ts
const Color = data({ Red: [], Green: [], Blue: [] })
    .match('toHex', { out: String }, {
        Red() { return '#FF0000'; },
        Green() { return '#00FF00'; },
        Blue() { return '#0000FF'; }
    });

const ExtendedColor = Color.extend({ Yellow: [], Orange: [] });

// Inherited variants have the operation
console.log(ExtendedColor.Red.toHex()); // '#FF0000'

// New variants without handlers throw error
ExtendedColor.Yellow.toHex(); // ✗ Error: No handler for variant 'Yellow'
```

**Use wildcard for open extension:**

```ts
const Color = data({ Red: [], Green: [], Blue: [] })
    .match('toHex', { out: String }, {
        Red() { return '#FF0000'; },
        _(instance) { return '#UNKNOWN'; }
    });

const ExtendedColor = Color.extend({ Yellow: [], Orange: [] });

console.log(ExtendedColor.Red.toHex());    // '#FF0000'
console.log(ExtendedColor.Yellow.toHex()); // '#UNKNOWN' (wildcard)
```

**Add operations to extended ADTs:**

```ts
const ExtendedColor = Color.extend({ Yellow: [], Orange: [] })
    .match('isWarm', { out: Boolean }, {
        Red() { return true; },
        Green() { return false; },
        Blue() { return false; },
        Yellow() { return true; },
        Orange() { return true; }
    });

// Both operations available
console.log(ExtendedColor.Red.toHex());  // '#FF0000' (inherited)
console.log(ExtendedColor.Red.isWarm()); // true (new operation)
console.log(ExtendedColor.Yellow.isWarm()); // true
```

### Extending Match Operations

Use `.extendMatch()` to add handlers for new variants in extended ADTs while inheriting parent behavior:

```ts
const Color = data({ Red: [], Green: [], Blue: [] })
    .match('toHex', { out: String }, {
        Red() { return '#FF0000'; },
        Green() { return '#00FF00'; },
        Blue() { return '#0000FF'; }
    });

const ExtendedColor = Color.extend({ Yellow: [], Orange: [] })
    .extendMatch('toHex', {
        Yellow() { return '#FFFF00'; },
        Orange() { return '#FFA500'; }
    });

// Inherited variants use parent handlers
console.log(ExtendedColor.Red.toHex()); // '#FF0000'

// New variants use extended handlers
console.log(ExtendedColor.Yellow.toHex()); // '#FFFF00'
```

**Override parent handlers:**

```ts
const ExtendedColor = Color.extend({ Yellow: [] })
    .extendMatch('toHex', {
        Yellow() { return '#FFFF00'; },
        Red(parent) { return parent().replace('FF', 'EE'); } // Use parent
    });

// Note: Override only affects NEW instances created after extendMatch
// Due to constructor identity preservation, Color.Red still uses original handler
console.log(Color.Red.toHex()); // '#FF0000' (unchanged)
console.log(ExtendedColor.Red.toHex()); // '#FF0000' (same constructor, uses parent)
```

**Replacing parent handlers (ignoring parent):**

```ts
const ExtendedColor = Color.extend({ Yellow: [] })
    .extendMatch('toHex', {
        Yellow() { return '#FFFF00'; },
        Red() { return '#EE0000'; } // Ignore parent parameter, replace completely
    });
```

**Wildcard inheritance:**

```ts
const Color = data({ Red: [], Green: [] })
    .match('toHex', { out: String }, {
        Red() { return '#FF0000'; },
        _(_instance) { return '#UNKNOWN'; } // Wildcard for undefined variants
    });

const ExtendedColor = Color.extend({ Blue: [] })
    .extendMatch('toHex', {
        // Blue not specified - inherits wildcard from parent
    });

console.log(ExtendedColor.Blue.toHex()); // '#UNKNOWN' (wildcard from parent)
```

**Overriding wildcard handler:**

When you override a wildcard handler, it receives the `parent` parameter first (like any other override):

```ts
const ExtendedColor = Color.extend({ Blue: [] })
    .extendMatch('toHex', {
        _({ instance, [parent]: _parent }) {
            return `#EXTENDED-${instance.constructor.name}`;
        }
    });

console.log(ExtendedColor.Blue.toHex()); // '#EXTENDED-Blue'
```

**Key points about extendMatch:**

- Automatically inherits all parent handlers
- Only need to specify handlers for **new variants**
- **Overriding parent handlers**: When you override an existing variant, the handler receives a `fields` object containing the optional `parent` symbol (accessed as `fields[parent]`)
- You can ignore the `fields[parent]` property if you don't need it
- Wildcard handlers are inherited from parent
- **Only one extendMatch per operation per ADT level**: Calling `.extendMatch('foo', ...)` twice on the same operation throws an error. To override again, use `.extend()` to create a new ADT level first.
- Due to constructor identity preservation, overrides only affect new instances
- Supports both object and callback form: `.extendMatch('op', handlers)` or `.extendMatch('op', (Family) => handlers)`

### Error Handling

**Missing handler:**

```ts
const Color = data({ Red: [], Green: [], Blue: [] })
    .match('toHex', { out: String }, {
        Red() { return '#FF0000'; }
        // No handler for Green or Blue, no wildcard
    });

Color.Green.toHex(); 
// ✗ Error: No handler for variant 'Green' in match operation 'toHex'
```

**Name collision with variant fields:**

```ts
const Point = data({
    Point2D: [{ x: Number }, { y: Number }]
});

Point.match('x', { out: Number }, {
    Point2D({ x, y }) { return x; }
});
// ✗ Error: Operation name 'x' conflicts with field 'x' in variant 'Point2D'
```

### Key Points

- `.match()` performs **non-recursive** pattern matching (does not recurse into fields)
- Handlers use **named form only** for clarity and partial destructuring
- Operations are installed on **variant class prototypes** (callable on variant instances)
- Wildcard handler `_` receives the full variant instance
- Operations are inherited by extended ADTs
- New variants in extended ADTs inherit parent operations
- Name collision detection prevents conflicts with variant fields
- Chaining supported: `.match(...).match(...)` or `.extend(...).match(...)`

### Extending Operations with `.extendMatch()`

When extending an ADT, use `.extendMatch()` to add operations to new variants or override operations for inherited variants. This enables specialization and customization of behavior in extended ADTs.

**Basic usage:**

```ts
import { data, parent } from '@lapis-lang/lapis-js';

const Color = data({ Red: [], Green: [], Blue: [] })
    .match('brightness', { out: Number }, {
        Red() { return 100; },
        Green() { return 150; },
        Blue() { return 50; }
    });

// Extend with new variants
const ExtendedColor = Color.extend({ Yellow: [], Orange: [] })
    .extendMatch('brightness', {
        Yellow() { return 200; },  // New variant handler
        Orange() { return 180; }   // New variant handler
    });

console.log(ExtendedColor.Yellow.brightness()); // 200
console.log(ExtendedColor.Red.brightness());    // 100 (inherited)
```

**Override with parent access:**

Use the `parent` symbol to access the parent handler when overriding. The parent callback is provided in the `fields` object:

```ts
import { data, parent } from '@lapis-lang/lapis-js';

const Color = data({ Red: [], Green: [], Blue: [] })
    .match('brightness', { out: Number }, {
        Red() { return 100; },
        Green() { return 150; },
        Blue() { return 50; }
    });

const ExtendedColor = Color.extend({ Yellow: [], Orange: [] })
    .extendMatch('brightness', {
        Yellow() { return 200; },
        Orange() { return 180; },
        // Override inherited variant
        Red(fields) { 
            const parentValue = fields[parent]!();
            return parentValue * 1.5;  // 150 (brighter red)
        }
    });

console.log(ExtendedColor.Red.brightness()); // 150 (overridden)
console.log(Color.Red.brightness());         // 100 (original unchanged)
```

**Override structured variants:**

For structured variants, the `parent` symbol is included alongside the field destructuring:

```ts
import { data, parent } from '@lapis-lang/lapis-js';

const Point = data({
    Point2D: [{ x: Number }, { y: Number }]
})
    .match('magnitude', { out: Number }, {
        Point2D({ x, y }) { return Math.sqrt(x * x + y * y); }
    });

const Point3D = Point.extend({
    Point3D: [{ x: Number }, { y: Number }, { z: Number }]
})
    .extendMatch('magnitude', {
        Point3D({ x, y, z }) { 
            return Math.sqrt(x * x + y * y + z * z); 
        },
        // Override with scaling
        Point2D(fields) { 
            const baseValue = fields[parent]!();
            return baseValue * 10;  // Scale by 10
        }
    });

const p2 = Point.Point2D({ x: 3, y: 4 });
const p2Extended = Point3D.Point2D({ x: 3, y: 4 });

console.log(p2.magnitude());         // 5 (base)
console.log(p2Extended.magnitude()); // 50 (overridden and scaled)
```

**Key differences from `.match()`:**

- **Import required:** Must import `parent` symbol: `import { data, parent } from '@lapis-lang/lapis-js'`
- **Parent access:** Override handlers receive `fields[parent]` callback to invoke parent behavior
- **Singleton handlers:** For singletons, `fields` is `{ [parent]: () => R }`
- **Structured handlers:** For structured, `fields` includes both field destructuring and `[parent]`
- **Constructor copying:** Overridden variants get new constructors (breaks constructor identity)
- **Instance dispatch:** Extended ADT instances use override handlers; base ADT instances use original handlers

**Override behavior:**

When you override a variant, instances created from the extended ADT use the override:

```ts
// Base instances use base handlers
const baseRed = Color.Red;
console.log(baseRed.brightness()); // 100

// Extended instances use overrides
const extendedRed = ExtendedColor.Red;
console.log(extendedRed.brightness()); // 150

// Constructor identity broken for overridden variants
console.log(ExtendedColor.Red === Color.Red); // false (overridden)
console.log(ExtendedColor.Blue === Color.Blue); // true (not overridden)
```

**Mixing new and override handlers:**

```ts
const ExtendedColor = Color.extend({ Yellow: [], Orange: [] })
    .extendMatch('brightness', {
        Yellow() { return 200; },      // New variant
        Orange() { return 180; },      // New variant
        Red(fields) {                  // Override
            return fields[parent]!() + 50;
        }
    });
```

### Key Points Summary

**Pattern Matching:**

- `.match()` performs **non-recursive** pattern matching (does not recurse into fields)
- Handlers use **named form only** for clarity and partial destructuring
- Operations are installed on **variant class prototypes** (callable on variant instances)
- Wildcard handler `_` receives the full variant instance
- Operations are inherited by extended ADTs
- Name collision detection prevents conflicts with variant fields
- Chaining supported: `.match(...).match(...)` or `.extend(...).match(...)`

**Operation Extension:**

- `.extendMatch()` adds operations to new variants and overrides operations for inherited variants
- Override handlers access parent behavior via `fields[parent]!()`
- Must import `parent` symbol: `import { data, parent } from '@lapis-lang/lapis-js'`
- Overridden variants get new constructors (constructor identity broken)
- Base ADT instances unaffected by overrides in extended ADTs

