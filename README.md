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

**Runtime Validation:** The library performs runtime validation for variant names (PascalCase), field names (camelCase), reserved property names, predicates, ADT instances, and Family references. Type parameters (T, U, V, etc.) accept any values and are not validated at runtime for non-instantiated ADTs; however, when ADTs are instantiated with concrete types (e.g., `List({ T: Number })` or `List(Number)`), type parameters are validated at runtime.

### Simple Enumerated Types

Define ADTs with simple variants (no data). Each variant creates a single value (singleton). For simple ADTs without recursive types or type parameters, you can use direct object literal syntax:

```ts
import { data } from '@lapis-lang/lapis-js';

// Direct object literal syntax (recommended for simple ADTs)
const Color = data({ Red: {}, Green: {}, Blue: {} });

// Alternative: Callback syntax (use when you need Family or type parameters)
const ColorAlt = data(() => ({ Red: {}, Green: {}, Blue: {} }));

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
- Values must be empty objects `{}`

### Structured Data

Define variants with typed fields using object literals. Each key-value pair maps a field name to its type. Structured variants are callable constructors (no `new` keyword needed):

```ts
// Direct object literal syntax (for non-recursive ADTs)
const Point = data({
    Point2D: { x: Number, y: Number },
    Point3D: { x: Number, y: Number, z: Number }
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

- `Number` - field type is `number` (primitive, not wrapper object)
- `String` - field type is `string` (primitive, not wrapper object)
- `Boolean` - field type is `boolean` (primitive, not wrapper object)
- `Object` - field type is `object`
- `Array` - field type is `unknown[]`
- `Date` - field type is `Date`
- `RegExp` - field type is `RegExp`
- `Symbol` - field type is `symbol` (primitive)
- `BigInt` - field type is `bigint` (primitive)
- Other ADTs - field type is the ADT instance
- Predicates - custom validation functions with runtime checks
- `Family` - recursive reference to the ADT being defined (for recursive ADTs only)

**Type validation:**

- Built-in primitive types (Number, String, Boolean, BigInt, Symbol) map to primitive types (`number`, `string`, `boolean`, `bigint`, `symbol`) - validated at **runtime** with `typeof` checks
- Built-in object types (Object, Array, Date, RegExp) - validated at **runtime** with `instanceof` or `typeof` checks
- ADT instances are validated at **runtime** with `instanceof` checks
- Predicates are validated at **runtime** with custom predicate functions
- `Family` references are validated at **runtime** with `instanceof` checks against the ADT family
- Type parameters (T, U, V, etc.) **without instantiation** - not validated at runtime, accept any values
- Type parameters (T, U, V, etc.) **with instantiation** (e.g., `List(Number)`) - validated at runtime against the instantiated type

**Requirements:**

- Variant names must be **PascalCase** (validated at runtime)
- Property names must be **camelCase** (start with lowercase, no underscore prefix, validated at runtime)
- Property names cannot be **reserved JavaScript names**: `constructor`, `prototype`, `__proto__`, `toString`, `valueOf`, `hasOwnProperty`, `isPrototypeOf`, `propertyIsEnumerable`, `toLocaleString` (validated at runtime)

### Nested ADTs

Fields can reference other ADTs with full type checking:

```ts
const Color = data(() => ({ Red: {}, Green: {}, Blue: {} }));

const ColorPoint = data(() => ({ 
    Point2: { x: Number, y: Number, color: Color },
    Point3: { x: Number, y: Number, z: Number, color: Color }
}));

const p = ColorPoint.Point2({ x: 5, y: 10, color: Color.Red }));  
console.log(p.color instanceof Color); // true
console.log(p instanceof ColorPoint); // true
```

### Predicates

Use custom validation functions (predicates) for runtime field validation:

```ts
const isEven = (x: unknown): x is number => 
    typeof x === 'number' && x % 2 === 0;

const EvenPoint = data(() => ({ 
    Point2: { x: isEven , y: isEven }
}));

const p = EvenPoint.Point2({ x: 2, y: 4 }));  // ✓ Valid
console.log(p.x); // 2
console.log(p.y); // 4

EvenPoint.Point2({ x: 3, y: 4 }));  // ✗ Throws TypeError at runtime
// TypeError: Field 'x' failed predicate validation
```

**Predicates enable custom runtime validation:**

```ts
// Range validation
const inRange = (min: number, max: number) => 
    (x: unknown): x is number => 
        typeof x === 'number' && x >= min && x <= max;

const Percentage = data(() => ({
    Value: { amount: inRange(0, 100)  }
}));  // String validation
const isEmail = (s: unknown): s is string => 
    typeof s === 'string' && s.includes('@');

const User = data(() => ({
    RegisteredUser: { email: isEmail , username: String }
}));  
```

### Mixed Variants

Combine simple and structured variants in the same ADT:

```ts
const Shape = data({
    Circle: { radius: Number },
    Square: { side: Number },
    Unknown: {}  // Simple variant (singleton)
});

const circle = Shape.Circle({ radius: 5 });
console.log(circle instanceof Shape); // true

const unknown = Shape.Unknown; // Singleton variant
console.log(unknown instanceof Shape); // true
```

### Type Checking

The class-based pattern enables powerful runtime type checking:

```ts
const Color = data({ Red: {}, Green: {}, Blue: {} });
const Point = data({ 
    Point2D: { x: Number, y: Number }
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
const Point = data(() => ({
    Point2D: { x: Number, y: Number }
}));  
const p1 = Point.Point2D(1, 2);
const p2 = Point.Point2D(1, 2);
console.log(p1 === p2); // false - different instances

// Singletons are always the same instance
const Color = data(() => ({ Red: {}, Green: {}, Blue: {} }));
const red1 = Color.Red;
const red2 = Color.Red;
console.log(red1 === red2); // true - same singleton instance
```

**Working with collections:** Use custom comparison for value equality when needed:

```ts
const Point = data(() => ({
    Point2D: { x: Number, y: Number }
}));  
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
    Zero: {}, 
    Succ: { pred: Family } 
}));

const zero = Peano.Zero;
const one = Peano.Succ({ pred: zero }));  
const two = Peano.Succ({ pred: one }));  
console.log(two.pred.pred === zero); // true

// Recursive list
const List = data(({ Family }) => ({ 
    Nil: {}, 
    Cons: { head: Number, tail: Family } 
}));

const empty = List.Nil;
const list = List.Cons({ head: 1, 
    tail: List.Cons({ head: 2, 
        tail: List.Cons({ head: 3, tail: empty }) 
    }) 
}));  
console.log(list.head); // 1
console.log(list.tail.head); // 2

// Binary tree
const Tree = data(({ Family }) => ({
    Leaf: { value: Number },
    Node: { left: Family, right: Family, value: Number }
}));

const leaf1 = Tree.Leaf({ value: 1 }));  
const leaf2 = Tree.Leaf({ value: 2 }));  
const tree = Tree.Node({ left: leaf1, right: leaf2, value: 10 }));  
```

**Key points:**

- Use callback form: `data(({ Family }) => ({ ... }))`
- `Family` represents a recursive reference to the ADT being defined
- `Family` can also be called as `Family(T)` for documentation (both are equivalent)
- Non-parameterized recursive ADTs can be used directly without instantiation

### Parameterized ADTs

Define generic data structures with type parameters using **arbitrary parameter names** in the destructured callback:

```ts
// Generic Maybe type - parameter name can be anything
const Maybe = data(({ T }) => ({
    Nothing: {},
    Just: { value: T }
}));

const justNum = Maybe.Just({ value: 42 });  
const justStr = Maybe.Just({ value: 'hello' });  
const nothing = Maybe.Nothing;

// Use descriptive parameter names
const Result = data(({ ErrorType, ValueType }) => ({
    Error: { error: ErrorType },
    Success: { value: ValueType }
}));

// Parameterized recursive list
const List = data(({ Family, ItemType }) => ({
    Nil: {},
    Cons: { head: ItemType, tail: Family }  // Family or Family(ItemType)
}));

const numList = List.Cons({ head: 1, 
    tail: List.Cons({ head: 2, tail: List.Nil }) 
});  
const strList = List.Cons({ head: 'a', 
    tail: List.Cons({ head: 'b', tail: List.Nil }) 
});  
```

**Type instantiation with runtime validation:**

Instantiate parameterized ADTs with specific types to enable **runtime type validation**:

```ts
const List = data(({ Family, T }) => ({
    Nil: {},
    Cons: { head: T, tail: Family }
}));

// Positional syntax: List(Number)
const NumList = List(Number);  
const nums = NumList.Cons(10, NumList.Cons(20, NumList.Nil)); 
// ✓ Valid: all numbers

// Object syntax: List({ T: String })
const StrList = List({ T: String });  
const strs = StrList.Cons('hello', StrList.Cons('world', StrList.Nil));
// ✓ Valid: all strings

// Runtime validation catches type errors
NumList.Cons('bad', NumList.Nil);
// ✗ TypeError: Field 'head' must be an instance of Number

StrList.Cons(42, StrList.Nil);
// ✗ TypeError: Field 'head' must be an instance of String

// Multiple type parameters
const Pair = data(({ T, U }) => ({
    MakePair: { first: T, second: U }
}));

// Both positional and object syntax work
const NumStrPair = Pair(Number, String);
const pair1 = NumStrPair.MakePair(42, 'hello'); // ✓

const StrBoolPair = Pair({ T: String, U: Boolean });
const pair2 = StrBoolPair.MakePair('test', true); // ✓
```

**Key points:**

- **Arbitrary type parameter names**: Use any descriptive names like `ItemType`, `ValueType`, `ErrorType` (not limited to T, U, V)
- **Runtime type validation**: When instantiated with types (e.g., `List(Number)`), all fields of that type parameter are validated
- **Dual instantiation syntax**: Both positional `List(Number)` and object `List({ T: Number })` forms supported
- Combine `Family` and type parameters for recursive parameterized types
- Use multiple parameters for heterogeneous data structures (e.g., `Pair` with different types)

### Immutability

Lapis JS provides immutability through two mechanisms:

**Variant instances** are deeply frozen and cannot be modified:

```ts
const Point = data(() => ({ Point2D: { x: Number, y: Number } }));
const p = Point.Point2D({ x: 10, y: 20 });
p.x = 30; // ✗ Throws Error (instance is frozen)
```

**ADT objects** use non-writable properties to prevent mutation in strict mode while allowing fold extensions:

```ts
const Color = data(() => ({ Red: {}, Green: {}, Blue: {} }));

// In strict mode, variant properties cannot be reassigned
Color.Red = []; // ✗ Throws Error in strict mode (cannot assign to read-only property)

// However, properties are configurable to support fold operation extensions
// The ADT itself is not sealed/frozen to allow shadow variant assignment
```

This design follows the **"open for extension, closed for modification"** principle: variant properties are protected from casual mutation, but the implementation can extend operations through the `.fold()` mechanism.

### ADT Extension (Subtyping)

Extend existing ADTs with new variants using the `.extend()` method. This enables open ADTs that can be incrementally extended while maintaining proper subtyping relationships.

Like `data()`, `.extend()` supports both object literal and callback forms:

```ts
// Base ADT
const Color = data({ Red: {}, Green: {}, Blue: {} });

// Object literal form (for simple extensions without Family/type parameters)
const ExtendedColor1 = Color.extend({ Yellow: {}, Orange: {} });

// Callback form (required when using Family for recursive ADTs)
const ExtendedColor2 = Color.extend(() => ({ Yellow: {}, Orange: {} }));

// Both forms create the same result
// All variants accessible on extended ADT
console.log(ExtendedColor1.Red);    // Inherited singleton
console.log(ExtendedColor1.Yellow); // New singleton

// Proper subtyping: extended variants are instanceof base
console.log(ExtendedColor.Yellow instanceof Color); // true
console.log(ExtendedColor.Yellow instanceof ExtendedColor); // true

// But inherited variants maintain original type
console.log(ExtendedColor1.Red instanceof Color); // true
console.log(ExtendedColor1.Red instanceof ExtendedColor1); // false

// Singleton identity preserved
console.log(ExtendedColor1.Red === Color.Red); // true
```

**Extending structured variants:**

```ts
const Point = data({
    Point2D: { x: Number, y: Number }
});

// Object literal form (no Family needed)
const Point3D = Point.extend({
    Point3D: { x: Number, y: Number, z: Number }
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

// Build complex expressions
const five = FullExpr.IntLit({ value: 5 }));  
const x = FullExpr.Var({ name: 'x' }));  
const lessThan = FullExpr.LessThan({ left: x, right: five }));  // Family accepts instances from any level
const letExpr = FullExpr.Let({ 
    name: 'x', 
    value: five,      // IntExpr variant
    body: lessThan    // IntBoolExpr variant
}));  // Proper subtyping hierarchy
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
- Variant instances are deeply frozen (immutable)
- ADT objects use non-writable configurable properties for controlled mutability
- Supports deep extension hierarchies (A → B → C → ...)

## Fold Operations

Lapis ADTs support defining operations through the `.fold()` method, which provides a unified approach to both pattern matching and structural recursion (catamorphisms). For non-recursive ADTs, fold performs simple pattern matching. For recursive ADTs, fold automatically recurses into `Family` fields, replacing constructors with functions. Operations are installed on variant class prototypes and support proper inheritance through the extension hierarchy.

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
// ✓ Valid - all variants handled
const Color = data(() => ({ Red: {}, Green: {}, Blue: {} }))
    .fold('toHex', { out: String }, () => ({
        Red() { return '#FF0000'; },
        Green() { return '#00FF00'; },
        Blue() { return '#0000FF'; }
    }));

// ✗ Runtime Error - Green and Blue handlers missing
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
// ✓ Valid - wildcard handles unspecified variants
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

// ✓ Only new variants (Yellow, Orange) need handlers
const ExtendedColor = Color.extend(() => ({ Yellow: {}, Orange: {} }))
    .fold('toHex', { out: String }, () => ({
        Yellow() { return '#FFFF00'; },
        Orange() { return '#FFA500'; }
    }));
```

**When adding a new operation to an extended ADT**: All variants (parent + new) need handlers OR wildcard

```ts
// ✗ Runtime Error - Yellow and Orange handlers missing
const ExtendedColor = Color.extend(() => ({ Yellow: {}, Orange: {} }))
    .fold('toRGB', { out: String }, () => ({
        Red() { return 'rgb(255,0,0)'; },
        Green() { return 'rgb(0,255,0)'; },
        Blue() { return 'rgb(0,0,255)'; }
        // Missing Yellow and Orange - will throw at runtime when encountered
    }));

// ExtendedColor.Yellow.toRGB() throws: Error: No handler for variant 'Yellow' in operation 'toRGB'

// ✓ All 5 variants handled
const Complete = Color.extend(() => ({ Yellow: {}, Orange: {} }))
    .fold('toRGB', { out: String }, () => ({
        Red() { return 'rgb(255,0,0)'; },
        Green() { return 'rgb(0,255,0)'; },
        Blue() { return 'rgb(0,0,255)'; },
        Yellow() { return 'rgb(255,255,0)'; },
        Orange() { return 'rgb(255,165,0)'; }
    }));

// ✓ Or use wildcard for unhandled variants
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

### Callback Form

`.fold()` always uses a callback form that returns the handler object. For recursive ADTs, the callback receives the `Family` reference:

```ts
const List = data(({ Family }) => ({
    Nil: {},
    Cons: { head: Number, tail: Family }
})).fold('isEmpty', { out: Boolean }, (Family) => ({
    Nil() { return true; },
    Cons({ head: _head, tail: _tail }) { return false; }
}));

console.log(List.Nil.isEmpty()); // true
console.log(List.Cons({ head: 1, tail: List.Nil }).isEmpty()); // false
```

**Note:** The callback form is **required** - object literals are not supported. For non-recursive ADTs, use `() => ({ ... })`. For recursive ADTs, use `(Family) => ({ ... })`.

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

When calling `.fold()` on an extended ADT with an operation that already exists on the parent, `.fold()` automatically enters **extend mode** and inherits parent behavior:

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

```ts
const ExtendedColor = Color.extend(() => ({ Yellow: {} }))
    .fold('toHex', () => ({
        Yellow() { return '#FFFF00'; },
        Red(fields) { return fields[parent]!().replace('FF', 'EE'); } // Use parent
    }));

// Note: Override only affects NEW instances created via ExtendedColor
// Overriding breaks constructor identity: Color.Red uses the original handler, but ExtendedColor.Red is a new shadow constructor with the override.
console.log(Color.Red.toHex()); // '#FF0000' (unchanged)
console.log(ExtendedColor.Red.toHex()); // '#FF0000' (shadow constructor, uses parent)
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

**Key points about fold in extend mode:**

- `.fold()` automatically detects extend mode when parent has the same operation
- Automatically inherits all parent handlers
- **Extending existing operations**: Only need to specify handlers for **new variants** or **variants to override** (partial handlers allowed)
- **New operations on extended ADTs**: Must provide handlers for **all variants** (parent + new) OR use wildcard (runtime enforces exhaustiveness)
- **Overriding parent handlers**: When you override an existing variant, the handler receives a `fields` object containing the optional `parent` symbol (accessed as `fields[parent]`)
- You can ignore the `fields[parent]` property if you don't need it
- Wildcard handlers are inherited from parent
- **ParentFamily parameter**: When extending an operation, callback receives `(Family, ParentFamily)` where `ParentFamily` provides access to parent handlers for reuse
- **Only one .fold() per operation per ADT level**: Calling `.fold('foo', ...)` twice on the same operation throws an error. To override again, use `.extend()` to create a new ADT level first.
- Overridden variants get new shadow constructors (constructor identity is broken)
- Uses callback form only: `.fold('op', () => handlers)` or `.fold('op', (Family, ParentFamily) => handlers)`

### Error Handling

**Missing handler:**

```ts
const Color = data(() => ({ Red: {}, Green: {}, Blue: {} }))
    .fold('toHex', { out: String }, () => ({
        Red() { return '#FF0000'; }
        // No handler for Green or Blue, no wildcard
    }));

Color.Green.toHex(); 
// ✗ Error: No handler for variant 'Green' in fold operation 'toHex'
```

**Name collision with variant fields:**

```ts
const Point = data(() => ({
    Point2D: { x: Number, y: Number }
}));  
Point.fold('x', { out: Number }, () => ({
    Point2D({ x, y }) { return x; }
}));
// ✗ Error: Operation name 'x' conflicts with field 'x' in variant 'Point2D'
```

### Key Points

- `.fold()` performs pattern matching on non-recursive ADTs and structural recursion (catamorphisms) on recursive ADTs
- Handlers use **named form only** for clarity and partial destructuring
- Operations are installed on **variant class prototypes** (callable on variant instances)
- Wildcard handler `_` receives the full variant instance
- Operations are inherited by extended ADTs
- New variants in extended ADTs inherit parent operations
- Name collision detection prevents conflicts with variant fields
- Chaining supported: `.fold(...).fold(...)` or `.extend(...).fold(...)`

## Structural Recursion with Fold

For recursive ADTs (those containing `Family` references), `.fold()` provides **catamorphisms** - structural recursion that replaces constructors with functions. Fold automatically recurses into `Family` fields, passing already-folded values to your handlers.

### Basic Fold (Catamorphism)

Define operations that recursively consume ADT structures from leaves to root:

```ts
const Peano = data(({ Family }) => ({ 
    Zero: {}, 
    Succ: { pred: Family } 
}))
.fold('toValue', { out: Number }, () => ({
    Zero() { return 0; },
    Succ({ pred }) { return 1 + pred; }  // pred is already folded to number
}));

const three = Peano.Succ({ pred: Peano.Succ({ pred: Peano.Succ({ pred: Peano.Zero }) }) }));  
console.log(three.toValue()); // 3
```

### Fold on Lists

For list structures, fold is a **right fold** (processes from tail to head):

```ts
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
}));  
console.log(list.sum()); // 6
// Evaluation structure: 1 + (2 + (3 + 0)) - right-associative
// Actual order (bottom-up from Nil): Nil→0, Cons(3,Nil)→3+0=3, Cons(2,...)→2+3=5, Cons(1,...)→1+5=6
```

### Fold on Trees

For tree structures, fold is a **catamorphism** (processes from leaves to root):

```ts
const Tree = data(({ Family }) => ({
    Leaf: { value: Number },
    Node: { left: Family, right: Family, value: Number }
}))
.fold('sum', { out: Number }, () => ({
    Leaf({ value }) { return value; },
    Node({ left, right, value }) { 
        // Both left and right are already folded to numbers
        return left + right + value; 
    }
}));

const tree = Tree.Node({ 
    left: Tree.Leaf({ value: 1 }), 
    right: Tree.Leaf({ value: 2 }), 
    value: 10 
}));  
console.log(tree.sum()); // 13
```

### Chaining Multiple Fold Operations

Chain `.fold()` calls to define multiple operations:

```ts
const List = data(({ Family }) => ({ 
    Nil: {}, 
    Cons: { head: Number, tail: Family } 
}))
.fold('length', { out: Number }, () => ({
    Nil() { return 0; },
    Cons({ tail }) { return 1 + tail; }
}))
.fold('sum', { out: Number }, () => ({
    Nil() { return 0; },
    Cons({ head, tail }) { return head + tail; }
}))
.fold('product', { out: Number }, () => ({
    Nil() { return 1; },
    Cons({ head, tail }) { return head * tail; }
}));

const list = List.Cons({ head: 2, 
    tail: List.Cons({ head: 3, 
        tail: List.Cons({ head: 4, tail: List.Nil }) 
    }) 
}));  
console.log(list.length());  // 3
console.log(list.sum());     // 9
console.log(list.product()); // 24
```

### Fold Callback Form

For consistency with recursive ADTs, `.fold()` supports a callback form:

```ts
const List = data(({ Family }) => ({
    Nil: {},
    Cons: { head: Number, tail: Family }
}))
.fold('length', { out: Number }, (Family) => ({
    Nil() { return 0; },
    Cons({ tail }) { return 1 + tail; }
}));
```

### Fold Wildcard Handlers

Use `_` wildcard to handle unknown variants:

```ts
const Peano = data(({ Family }) => ({ 
    Zero: {}, 
    Succ: { pred: Family },
    NegSucc: { pred: Family }
}))
.fold('toValue', { out: Number }, () => ({
    Zero() { return 0; },
    _(instance) { 
        console.log(`Unknown variant: ${instance.constructor.name}`);
        return -999; 
    }
}));

console.log(Peano.Zero.toValue()); // 0
console.log(Peano.Succ({ pred: Peano.Zero }).toValue()); // -999 (wildcard)
```

### Integration with Multiple Fold Operations

Multiple fold operations work together on the same ADT:

```ts
const List = data(({ Family }) => ({ 
    Nil: {}, 
    Cons: { head: Number, tail: Family } 
}))
.fold('isEmpty', { out: Boolean }, () => ({
    Nil() { return true; },
    Cons() { return false; }
}))
.fold('length', { out: Number }, () => ({
    Nil() { return 0; },
    Cons({ tail }) { return 1 + tail; }
}));

const list = List.Cons({ head: 1, tail: List.Nil });
console.log(list.isEmpty()); // false (non-recursive check)
console.log(list.length());  // 1 (recursive computation)
```

### Handler Parameter Form

**Fold handlers use named form only** (destructure fields):

```ts
// ✓ Correct - named destructuring
Cons({ head, tail }) { return head + tail; }

// ✓ Can ignore unused fields
Cons({ tail }) { return 1 + tail; }

// Singleton variants have no parameters
Nil() { return 0; }
```

### What is Catamorphism?

A **catamorphism** is the general pattern of structural recursion:

- Processes data structures **bottom-up** (leaves to root)
- Handlers receive **already-processed** recursive fields
- Replaces constructors with functions

**Terminology:**

- **For lists**: This is a **right fold** (`foldr`) - processes from tail to head
- **For trees**: This is a **catamorphism** - processes from leaves to root
- **General**: Structural recursion that consumes data structures

**Key insight:** The implementation automatically identifies `Family` fields and applies the operation recursively before calling your handler. You don't manually recurse - the framework does it for you.

### Fold Operation Summary

**Pattern Matching (`.fold()`):**

- `.fold()` performs pattern matching on non-recursive ADTs and structural recursion (catamorphisms) on recursive ADTs
- Available on **all ADTs** (both recursive and non-recursive)
- Handlers receive raw field values (not processed)
- Operations are installed on **variant class prototypes** (callable on variant instances)
- Wildcard handler `_` receives the full variant instance
- Operations are inherited by extended ADTs
- Name collision detection prevents conflicts with variant fields
- Chaining supported: `.fold(...).fold(...)` or `.extend(...).fold(...)`

**Structural Recursion (`.fold()`):**

- `.fold()` performs **catamorphism** (structural recursion from leaves to root)
- Available on all ADTs; for recursive ADTs (those with `Family` references), handlers receive **already-folded values** for `Family` fields
- For lists, behaves as **right fold** (right-associative, processes tail first)
- For trees, processes from leaves to root (both subtrees evaluated before parent)
- Automatic recursion - framework handles traversal
- Wildcard handler `_` for unknown variants
- Name collision detection prevents conflicts with variant fields
- Chaining supported: `.fold(...).fold(...)` or `.fold(...).fold(...)`

**Operation Extension:**

- `.fold()` automatically enters extend mode when called on an extended ADT with an operation that exists on the parent
- In extend mode, inherits parent handlers and allows adding/overriding variants
- Override handlers access parent behavior via `fields[parent]!()`
- Must import `parent` symbol: `import { data, parent } from '@lapis-lang/lapis-js'`
- Overridden variants get new constructors (constructor identity broken)
- Base ADT instances unaffected by overrides in extended ADTs

### Extending Fold Operations (Recursive ADTs)

When calling `.fold()` on an extended recursive ADT with an operation that exists on the parent, `.fold()` enters **extend mode** with **polymorphic recursion** - recursive calls automatically use the extended operation.

**Basic usage - adding handlers for new variants:**

```ts
import { data } from '@lapis-lang/lapis-js';

// Base expression language with integers
const IntExpr = data(({ Family }) => ({
    IntLit: { value: Number },
    Add: { left: Family, right: Family }
}))
    .fold('eval', { out: Number }, () => ({
        IntLit({ value }) { return value; },
        Add({ left, right }) { return left + right; }
    }));

// Extend with boolean operations - .fold() auto-detects extend mode
const IntBoolExpr = IntExpr.extend(({ Family }) => ({
    BoolLit: { value: Boolean },
    LessThan: { left: Family, right: Family }
}))
    .fold('eval', () => ({
        BoolLit({ value }) { return value ? 1 : 0; },
        LessThan({ left, right }) { return left < right ? 1 : 0; }
    }));

// Inherited variants work
const sum = IntBoolExpr.Add({
    left: IntBoolExpr.IntLit({ value: 5 }),
    right: IntBoolExpr.IntLit({ value: 3 })
}));  
console.log(sum.eval()); // 8

// New variants work
const lessThan = IntBoolExpr.LessThan({
    left: IntBoolExpr.IntLit({ value: 3 }),
    right: IntBoolExpr.IntLit({ value: 5 })
}));  
console.log(lessThan.eval()); // 1 (true)
```

**Override with parent access:**

Use the `parent` symbol to access the parent handler when overriding fold operations:

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

// Override Succ to scale parent result
const ExtendedPeano = Peano.extend(({ Family }) => ({
    NegSucc: { pred: Family }
}))
    .fold('toValue', () => ({
        NegSucc({ pred }) { return -1 + pred; },
        Succ(fields) {
            const parentResult = fields[parent]!() as number;
            return parentResult * 10;  // Scale by 10
        }
    }));

const one = ExtendedPeano.Succ({ pred: ExtendedPeano.Zero }));  
console.log(one.toValue()); // 10 (instead of 1)

// Base instances use base handlers
const baseOne = Peano.Succ({ pred: Peano.Zero }));  
console.log(baseOne.toValue()); // 1 (original)
```

**Polymorphic recursion:**

The key power of `.fold()` in extend mode is **polymorphic recursion** - when fold recursively evaluates `Family` fields, it uses the **extended operation**, not the parent operation. This means inherited variants automatically benefit from new functionality:

```ts
const IntExpr = data(({ Family }) => ({
    IntLit: { value: Number },
    Add: { left: Family, right: Family }
}))
    .fold('eval', { out: Number }, () => ({
        IntLit({ value }) { return value; },
        Add({ left, right }) { return left + right; }
    }));

// Extend with multiplication
const ExtendedExpr = IntExpr.extend(({ Family }) => ({
    Mul: { left: Family, right: Family }
}))
    .fold('eval', () => ({
        Mul({ left, right }) { return left * right; }
    }));

// Create expression: (2 + 3) * 4
// The Add operation (inherited) can now work with Mul (new)
// because polymorphic recursion evaluates children using extended eval
const sum = ExtendedExpr.Add({
    left: ExtendedExpr.IntLit({ value: 2 }),
    right: ExtendedExpr.IntLit({ value: 3 })
});  
const product = ExtendedExpr.Mul({ left: sum, right: ExtendedExpr.IntLit({ value: 4 }) });  
console.log(product.eval()); // 20 ((2 + 3) * 4)
```

**Multiple extension levels:**

Fold operations can be extended across multiple levels of ADT hierarchy:

```ts
const L1 = data(({ Family }) => ({
    IntLit: { value: Number },
    Add: { left: Family, right: Family }
}))
    .fold('eval', { out: Number }, () => ({
        IntLit({ value }) { return value; },
        Add({ left, right }) { return left + right; }
    }));
const L2 = L1.extend(({ Family }) => ({
    Sub: { left: Family, right: Family }
}))
    .fold('eval', () => ({
        Sub({ left, right }) { return left - right; }
    }));

const L3 = L2.extend(({ Family }) => ({
    Mul: { left: Family, right: Family }
}))
    .fold('eval', () => ({
        Mul({ left, right }) { return left * right; }
    }));

// Create expression: (10 + 5) - (4 * 2)
const expr = L3.Sub({
    left: L3.Add({ left: L3.IntLit({ value: 10 }), right: L3.IntLit({ value: 5 }) }),
    right: L3.Mul({ left: L3.IntLit({ value: 4 }), right: L3.IntLit({ value: 2 }) })
}));  
console.log(expr.eval()); // 7 ((10 + 5) - (4 * 2))
```

**Key points about fold in extend mode (recursive ADTs):**

- `.fold()` automatically detects extend mode when parent has the same operation
- Automatically inherits all parent handlers
- Only need to specify handlers for **new variants** or **variants to override**
- Override handlers receive `fields[parent]!()` to access parent behavior
- Polymorphic recursion: recursive calls use the **extended operation**
- Constructor identity preserved for non-overridden variants
- Constructor identity broken for overridden variants (new shadow constructors created)
- Base ADT instances unaffected by extended ADT overrides
- **Only one .fold() per operation per ADT level**: Calling `.fold('op', ...)` twice on the same operation throws an error. To override again, use `.extend()` to create a new ADT level first.
- Uses callback form only: `.fold('op', () => handlers)` or `.fold('op', (Family, ParentFamily) => handlers)` with ParentFamily parameter for extend mode

## Type Parameter Transformations with Map

For parameterized ADTs with type parameters (`T`, `U`, `V`, etc.), `.map()` provides structure-preserving transformations that change type parameter values while maintaining the ADT's shape. Unlike `.fold()` which can collapse structures, `.map()` returns a new instance of the same variant type with transformed type parameter fields.

### Basic Map

Transform type parameter values across an entire ADT structure:

```ts
const List = data(({ Family, T }) => ({
    Nil: {},
    Cons: { head: T, tail: Family(T) }
}))
.map('increment', {}, { T: (x) => x + 1 });

const list = List.Cons({
    head: 1,
    tail: List.Cons({
        head: 2,
        tail: List.Cons({ head: 3, tail: List.Nil })
    })
});

const incremented = list.increment();
console.log(incremented.head); // 2
console.log(incremented.tail.head); // 3
console.log(incremented.tail.tail.head); // 4
console.log(incremented instanceof List.Cons); // true - same structure
```

### Map on Trees

Map recursively transforms type parameters in tree structures:

```ts
const Tree = data(({ Family, T }) => ({
    Leaf: { value: T },
    Node: { left: Family(T), right: Family(T), value: T }
}))
.map('increment', {}, { T: (x) => x + 1 });

const tree = Tree.Node({
    left: Tree.Leaf({ value: 1 }),
    right: Tree.Leaf({ value: 2 }),
    value: 10
});

const incremented = tree.increment();
console.log(incremented.value); // 11
console.log(incremented.left.value); // 2
console.log(incremented.right.value); // 3
```

### Multiple Type Parameters

Transform each type parameter independently with different functions:

```ts
const Pair = data(({ T, U }) => ({
    MakePair: { first: T, second: U }
}))
.map('transform', {}, {  // Empty spec - no validation
    T: (x) => x * 2,
    U: (s) => s.toUpperCase()
});

const pair = Pair.MakePair({ first: 5, second: 'hello' });
const transformed = pair.transform();
console.log(transformed.first); // 10
console.log(transformed.second); // 'HELLO'
```

### Type Changing Maps

Map can change the type of parameters, creating a new parameterization:

```ts
const List = data(({ Family, T }) => ({
    Nil: {},
    Cons: { head: T, tail: Family }
}))
.map('stringify', (Family) => ({ out: Family }), { T: (x) => String(x) });

const numbers = List.Cons({
    head: 42,
    tail: List.Cons({ head: 100, tail: List.Nil })
});

const strings = numbers.stringify();
console.log(typeof strings.head); // 'string'
console.log(strings.head); // '42'
console.log(typeof strings.tail.head); // 'string'
console.log(strings.tail.head); // '100'
```

### Map Callback Form

For consistency with other operations, `.map()` supports a callback form:

```ts
const List = data(({ Family, T }) => ({
    Nil: {},
    Cons: { head: T, tail: Family }
}))
.map('double', (Family) => ({ out: Family }), { T: (x) => x * 2 });

const list = List.Cons({ head: 5, tail: List.Cons({ head: 10, tail: List.Nil }) });
const doubled = list.double();
console.log(doubled.head); // 10
console.log(doubled.tail.head); // 20
```

### Chaining Map Operations

Chain multiple `.map()` operations to compose transformations:

```ts
const List = data(({ Family, T }) => ({
    Nil: {},
    Cons: { head: T, tail: Family }
}))
.map('increment', (Family) => ({ out: Family }), { T: (x) => x + 1 })
.map('double', (Family) => ({ out: Family }), { T: (x) => x * 2 })
.map('stringify', (Family) => ({ out: Family }), { T: (x) => String(x) });

const list = List.Cons({ head: 5, tail: List.Cons({ head: 10, tail: List.Nil }) });
const result = list.increment().double().stringify();

// ((5 + 1) * 2).toString() = "12"
// ((10 + 1) * 2).toString() = "22"
console.log(result.head); // '12'
console.log(result.tail.head); // '22'
```

### Map with Arguments

Transform functions can accept arguments, enabling parameterized transformations:

```ts
const List = data(({ Family, T }) => ({
    Nil: {},
    Cons: { head: T, tail: Family }
}))
.map('scale', (Family) => ({ out: Family }), { T: (x, factor) => x * factor })
.map('add', (Family) => ({ out: Family }), { T: (x, offset) => x + offset });

const list = List.Cons({ head: 2, tail: List.Cons({ head: 3, tail: List.Nil }) });

// Scale by 10
const scaled = list.scale(10);
console.log(scaled.head); // 20
console.log(scaled.tail.head); // 30

// Add 100
const shifted = scaled.add(100);
console.log(shifted.head); // 120
console.log(shifted.tail.head); // 130

// Arguments are passed through recursive calls
const tree = Tree.Node({
    left: Tree.Leaf({ value: 5 }),
    right: Tree.Leaf({ value: 10 }),
    value: 15
}).scale(2); // All values multiplied by 2
```

### Map vs Fold

**When to use `.map()`:**

- Transform type parameter values while **preserving structure**
- Change parameter types (e.g., `number` → `string`)
- Compose transformations via chaining
- Need instances of the **same variant type**

**When to use `.fold()`:**

- **Collapse or reduce** structures to different types
- Compute aggregate values (sum, length, etc.)
- Pattern match and branch on variant types
- Flexible handler logic with wildcard support

**Comparison:**

```ts
const List = data(({ Family, T }) => ({
    Nil: {},
    Cons: { head: T, tail: Family }
}))
.map('increment', (Family) => ({ out: Family }), { T: (x) => x + 1 })
.fold('sum', { out: Number }, () => ({
    Nil() { return 0; },
    Cons({ head, tail }) { return head + tail; }
}));

const list = List.Cons({ head: 1, tail: List.Cons({ head: 2, tail: List.Nil }) });

// Map: transforms and preserves structure
const incremented = list.increment(); // List.Cons({ head: 2, tail: List.Cons({ head: 3, tail: List.Nil }) })
console.log(incremented instanceof List.Cons); // true

// Fold: collapses structure to a value
const sum = list.sum(); // 3
console.log(typeof sum); // 'number'
```

### Map Operation Summary

**Type Parameter Transformations (`.map()`):**

- `.map()` transforms type parameter values while **preserving ADT structure**
- Available on **all ADTs** (works on both parameterized and non-parameterized ADTs)
- Syntax: `.map(name, spec, { T: fn, U: fn })` - spec object required, `out` property optional
- Spec with validation: `{ out: ADT }` - validates return values against ADT type
- Empty spec: `{}` - no validation performed
- Spec callback form: `(Family) => ({ out: Family })` - use when Family reference needed
- Transform callback form: `.map(name, spec, (Family) => ({ T: fn, U: fn }))`
- Runtime validation: when `spec.out` provided, enforces type constraints on return values
- **Transform functions can accept arguments**: `.map('scale', {}, { T: (x, factor) => x * factor })` then call `instance.scale(10)`
- **Recursively handles `Family` fields** - arguments passed through to recursive calls
- Returns new instances with **same variant constructors**
- Operation names must be **camelCase** (unlike `.fold()` which accepts any case)
- Name collision detection prevents conflicts with variant fields and reserved names
- Multiple operations supported: `.map('op1', ...).map('op2', ...)` defines separate methods
- Operations installed on **variant class prototypes** (callable on variant instances)
- **Partial transforms allowed**: missing transforms leave values unchanged
- Non-parameterized ADTs: map operations work but act as identity on non-type-parameter fields
- Immutability: creates new instances, original instances unchanged

## Merge Operations (Deforestation)

The `.merge()` operation composes multiple operations (fold, map, unfold) into a single fused operation that eliminates intermediate data structure allocations. This optimization technique, known as **deforestation**, improves performance by avoiding the creation of temporary structures.

### Basic Composition

Merge takes a name and an array of operation names to compose:

```js
const List = data(({ Family }) => ({
    Nil: {},
    Cons: { head: Number, tail: Family }
}))
.unfold('Range', (List) => ({ in: Number, out: List }), {
    Nil: (n) => (n <= 0 ? {} : null),
    Cons: (n) => (n > 0 ? { head: n, tail: n - 1 } : null)
})
.fold('sum', { out: Number }, () => ({
    Nil() { return 0; },
    Cons({ head, tail }) { return head + tail; }
}))
.merge('Triangular', ['Range', 'sum']);

// Computes triangular numbers without creating intermediate list
console.log(List.Triangular(5)); // 15 (1+2+3+4+5)
```

### Morphism Types

Merge supports several recursion scheme patterns:

#### Hylomorphism (unfold + fold)

Combines generation and consumption - builds and immediately consumes a structure:

```js
const List = data(({ Family }) => ({
    Nil: {},
    Cons: { head: Number, tail: Family }
}))
.unfold('Counter', (List) => ({ in: Number, out: List }), {
    Nil: (n) => (n <= 0 ? {} : null),
    Cons: (n) => (n > 0 ? { head: n, tail: n - 1 } : null)
})
.fold('product', { out: Number }, () => ({
    Nil() { return 1; },
    Cons({ head, tail }) { return head * tail; }
}))
.merge('Factorial', ['Counter', 'product']);

// Factorial without creating intermediate list structure
console.log(List.Factorial(5)); // 120 (5*4*3*2*1)
```

#### Paramorphism (map + fold)

Transforms then consumes - applies transformations before folding:

```js
const List = data(({ Family, T }) => ({
    Nil: {},
    Cons: { head: T, tail: Family }
}));

const NumList = List({ T: Number })
    .map('double', (Family) => ({ out: Family }), {
        T: (x) => x * 2
    })
    .fold('sum', { out: Number }, () => ({
        Nil() { return 0; },
        Cons({ head, tail }) { return head + tail; }
    }))
    .merge('doubleSum', ['double', 'sum']);

const list = NumList.Cons(1, NumList.Cons(2, NumList.Cons(3, NumList.Nil)));
console.log(list.doubleSum()); // 12 ((1*2)+(2*2)+(3*2))
```

#### Apomorphism (unfold + map)

Generates then transforms - creates structure with transformations applied:

```js
const List = data(({ Family, T }) => ({
    Nil: {},
    Cons: { head: T, tail: Family }
}));

const NumList = List({ T: Number })
    .unfold('CountDown', (List) => ({ in: Number, out: List }), {
        Nil: (n) => (n <= 0 ? {} : null),
        Cons: (n) => (n > 0 ? { head: n, tail: n - 1 } : null)
    })
    .map('square', (Family) => ({ out: Family }), {
        T: (x) => x * x
    })
    .merge('Squares', ['CountDown', 'square']);

const squares = NumList.Squares(5);
// Creates List.Cons(25, List.Cons(16, List.Cons(9, List.Cons(4, List.Cons(1, List.Nil)))))
```

#### Complex Pipelines

Combine multiple operations in sequence:

```js
const List = data(({ Family, T }) => ({
    Nil: {},
    Cons: { head: T, tail: Family }
}));

const NumList = List({ T: Number })
    .unfold('Range', (List) => ({ in: Number, out: List }), {
        Nil: (n) => (n <= 0 ? {} : null),
        Cons: (n) => (n > 0 ? { head: n, tail: n - 1 } : null)
    })
    .map('square', (Family) => ({ out: Family }), {
        T: (x) => x * x
    })
    .fold('sum', { out: Number }, () => ({
        Nil() { return 0; },
        Cons({ head, tail }) { return head + tail; }
    }))
    .merge('SumOfSquares', ['Range', 'square', 'sum']);

// Computes sum of squares without allocating intermediate structures
console.log(NumList.SumOfSquares(5)); // 55 (25+16+9+4+1)
```

### Composition Rules

The merge operation validates composition to ensure correctness:

- **Minimum 2 operations**: At least two operations required for meaningful composition
- **Maximum 1 unfold**: At most one generator operation
- **Maximum 1 fold**: At most one consumption operation
- **Any number of maps**: Multiple transformations allowed
- **Left-to-right composition**: Operations applied in array order

```js
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

### Naming Conventions

Merged operations follow specific naming rules:

- **Static methods (with unfold)**: Must be **PascalCase** (e.g., `'Factorial'`, `'Range'`)
- **Instance methods (without unfold)**: Must be **camelCase** (e.g., `'doubleSum'`, `'sumOfSquares'`)

```js
// Static method (unfold present) - PascalCase required
.merge('Factorial', ['Counter', 'product']);  // ✓ PascalCase
.merge('factorial', ['Counter', 'product']);  // ✗ Error: must be PascalCase

// Instance method (no unfold) - camelCase required
.merge('doubleSum', ['double', 'sum']);       // ✓ camelCase
.merge('DoubleSum', ['double', 'sum']);       // ✗ Error: must be camelCase
```

### Collision Detection

Merge validates operation names to prevent conflicts:

```js
const Point = data({
    Point2D: { x: Number, y: Number }
})
.map('scale', {}, { x: (n) => n * 2, y: (n) => n * 2 })
.fold('magnitude', { out: Number }, () => ({
    Point2D({ x, y }) { return Math.sqrt(x * x + y * y); }
}));

// Error: 'x' conflicts with field name
Point.merge('x', ['scale', 'magnitude']);  // ✗ throws error

// Error: 'Point2D' conflicts with variant name
Point.merge('Point2D', ['scale', 'magnitude']);  // ✗ throws error
```

### Spec Inference

Merged operations automatically infer their type specification from component operations:

```js
// No need to specify return type - inferred from 'sum' fold
.merge('Triangular', ['Range', 'sum']);

// Input type inferred from 'Range' unfold
// Output type inferred from 'sum' fold
```

### Performance Benefits

Deforestation eliminates intermediate allocations:

```js
// Without merge: allocates entire list
const list = List.Range(1000000);  // Allocates 1M nodes
const result = list.sum();         // Traverses 1M nodes

// With merge: no intermediate list
const result = List.Triangular(1000000);  // No allocation, direct computation
```

### Working with Extended ADTs

Merge operations work seamlessly with ADT extension:

```js
const BaseList = data(({ Family }) => ({
    Nil: {},
    Cons: { head: Number, tail: Family }
}))
.unfold('Counter', (List) => ({ in: Number, out: List }), {
    Nil: (n) => (n <= 0 ? {} : null),
    Cons: (n) => (n > 0 ? { head: n, tail: n - 1 } : null)
})
.fold('sum', { out: Number }, () => ({
    Nil() { return 0; },
    Cons({ head, tail }) { return head + tail; }
}));

const ExtendedList = BaseList.extend(({ Family }) => ({
    Single: { value: Number }
}))
.fold('sum', { out: Number }, () => ({
    Single({ value }) { return value; }
}))
.merge('Triangular', ['Counter', 'sum']);

// Merged operation includes extended variant handlers
console.log(ExtendedList.Triangular(5)); // 15
```

### Merge Operation Summary

**Operation Composition (`.merge()`):**

- Combines multiple operations into single fused operation (deforestation)
- Eliminates intermediate data structure allocations for performance
- Syntax: `.merge(name, [operation1, operation2, ...])`
- Composition rules: minimum 2 operations, max 1 unfold, max 1 fold, any number of maps
- Left-to-right composition: operations applied in array order
- Static methods (with unfold): requires **PascalCase** names
- Instance methods (without unfold): requires **camelCase** names
- Automatic spec inference from component operations
- Collision detection: prevents conflicts with variant/field names
- Supports morphisms: hylomorphism, paramorphism, apomorphism
- Returns ADT for fluent chaining: `.merge(...).merge(...)`
- Works with extended ADTs and inherited operations
- Stack-safe: uses same iterative fold implementation
- Transform composition: map transforms applied before fold handlers
- Validation: runtime checks for composition rules and naming conventions

