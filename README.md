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

Lapis JS provides a powerful `data` function for defining algebraic data types (ADTs) using a class-based enumeration pattern. ADTs support simple enumerated types, structured data with fields, subtyping, and predicate-based validation.

### Simple Enumerated Types

Define ADTs with simple variants (no data). Each variant is a singleton instance of its own class:

```ts
import { data } from '@lapis-lang/lapis-js';

const Color = data({ Red: [], Green: [], Blue: [] });

// Each variant is an instance
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

// All instances have proper type checking
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

const unknown = Shape.Unknown; // Singleton instance
console.log(unknown instanceof Shape); // true
```

### Type Checking

The class-based pattern enables powerful runtime type checking:

```ts
const Color = data({ Red: [], Green: [], Blue: [] });
const Point = data({ 
    Point2D: [{ x: Number }, { y: Number }]
});

// Check against the ADT base class
console.log(Color.Red instanceof Color); // true
console.log(Color.Green instanceof Color); // true

// Check against specific variant constructors
const p = Point.Point2D({ x: 10, y: 20 });
console.log(p instanceof Point.Point2D); // true
console.log(p instanceof Point); // true

// Type guards work correctly
function isColor(value: unknown): value is typeof Color.Red {
    return value instanceof Color;
}
```

### Strict Equality (Object Pooling)

Both singleton and structured variants support strict equality (`===`) comparisons. Variants with identical field values return the same instance through object pooling:

```ts
const Color = data({ Red: [], Green: [], Blue: [] });

// Singletons always have strict equality
const red = Color.Red;
const red2 = Color.Red;
console.log(red === red2); // true

const Point = data({
    Point2D: [{ x: Number }, { y: Number }],
    Point3D: [{ x: Number }, { y: Number }, { z: Number }]
});

// Structured variants with same values are strictly equal
const p1 = Point.Point2D(1, 2);
const p2 = Point.Point2D(1, 2);
console.log(p1 === p2); // true

// Works with both named and positional arguments
const p3 = Point.Point2D({ x: 1, y: 2 });
console.log(p1 === p3); // true

// Different values create different instances
const p4 = Point.Point2D(3, 4);
console.log(p1 === p4); // false
```

**Benefits:**

- **Native Collections:** Variants work seamlessly with `Set`, `Map`, `Array` methods (`includes`, `indexOf`)
- **Efficient Deduplication:** Use `Set` to remove duplicates based on structural equality
- **Memory Efficiency:** Identical values share the same instance
- **Predictable Behavior:** Consistent with how singleton variants work

**Examples with collections:**

```ts
const Point = data({ Point2D: [{ x: Number }, { y: Number }] });

// Works with Set for deduplication
const points = new Set([
    Point.Point2D(1, 2),
    Point.Point2D(3, 4),
    Point.Point2D(1, 2)  // Duplicate, automatically removed
]);
console.log(points.size); // 2

// Works with Map as keys
const pointMap = new Map();
pointMap.set(Point.Point2D(1, 2), 'origin');
console.log(pointMap.get(Point.Point2D(1, 2))); // 'origin'

// Works with Array methods
const arr = [Point.Point2D(1, 2), Point.Point2D(3, 4)];
console.log(arr.includes(Point.Point2D(1, 2))); // true
console.log(arr.indexOf(Point.Point2D(3, 4))); // 1
```

**Object pooling details:**

- Uses `WeakMap` for object field values (enables garbage collection)
- Uses `Map` for primitive field values (number, string, boolean, bigint, symbol)
- Equality is based on field value identity for objects (same reference)
- Equality is based on value equality for primitives
- Each variant has its own pool (scoped to the variant constructor via closure)

**Memory considerations:**

The pool accumulates all unique instances created during the ADT's lifetime. While the ADT remains in scope, instances with primitive-valued fields are retained indefinitely (unlike object-valued instances which can be garbage collected via `WeakMap`). This is typically not a concern because:

- Most ADTs have bounded domains (e.g., game coordinates, database IDs, configuration values)
- When the ADT goes out of scope, the entire pool is garbage collected
- The memory cost equals what you'd use if keeping references to instances anyway

⚠️ **Caution for long-running processes:** If your ADT remains in scope indefinitely (e.g., global variable in a server) and creates unbounded unique primitive values (e.g., UUIDs, timestamps, streaming data), the pool will grow without bound. For high-cardinality scenarios, consider whether strict equality benefits outweigh memory growth.

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

// Create instances
const p2 = Point3D.Point2D({ x: 10, y: 20 });
const p3 = Point3D.Point3D({ x: 1, y: 2, z: 3 });

// Proper subtyping relationships
console.log(p3 instanceof Point3D); // true
console.log(p3 instanceof Point);   // true

// Constructor identity preserved
console.log(Point3D.Point2D === Point.Point2D); // true

// Base instances are not instanceof extended type
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
- Proper subtyping: extended variant instances are `instanceof` both extended and base ADTs
- Inherited variants maintain their original type (not `instanceof` extended ADT)
- Constructor and singleton identity is preserved across hierarchy
- `Family` references accept instances from any level of the hierarchy
- Variant name collisions throw errors
- Extended ADTs are also frozen and immutable
- Supports deep extension hierarchies (A → B → C → ...)
