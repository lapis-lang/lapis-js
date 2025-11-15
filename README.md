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

Lapis JS provides a powerful `data` function for defining algebraic data types (ADTs) using a class-based enumeration pattern. ADTs support simple enumerated types, structured data with fields, and predicate-based validation.

### Simple Enumerated Types

Define ADTs with simple variants (no data). Each variant is a singleton instance of its own class:

```ts
import { data } from '@lapis-lang/lapis-js';

const Color = data({ Red: {}, Green: {}, Blue: {} });

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
- Values must be empty objects `{}`

### Structured Data

Define variants with typed fields. Structured variants are callable constructors (no `new` keyword needed):

```ts
const Point = data({
    Point2D: { x: Number, y: Number },
    Point3D: { x: Number, y: Number, z: Number }
});

// Callable without 'new'
const p2 = Point.Point2D({ x: 10, y: 20 });
console.log(p2.x); // 10
console.log(p2.y); // 20
console.log(p2 instanceof Point.Point2D); // true
console.log(p2 instanceof Point); // true

// Also works with 'new' keyword if preferred
const p3 = new Point.Point3D({ x: 1, y: 2, z: 3 });
console.log(p3 instanceof Point); // true
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
const Color = data({ Red: {}, Green: {}, Blue: {} });

const ColorPoint = data({ 
    Point2: { x: Number, y: Number, color: Color },
    Point3: { x: Number, y: Number, z: Number, color: Color }
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
    Point2: { x: isEven, y: isEven }
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
    Value: { amount: inRange(0, 100) }
});

// String validation
const isEmail = (s: unknown): s is string => 
    typeof s === 'string' && s.includes('@');

const User = data({
    RegisteredUser: { email: isEmail, username: String }
});
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

const unknown = Shape.Unknown; // Singleton instance
console.log(unknown instanceof Shape); // true
```

### Type Checking

The class-based pattern enables powerful runtime type checking:

```ts
const Color = data({ Red: {}, Green: {}, Blue: {} });
const Point = data({ 
    Point2D: { x: Number, y: Number }
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

### Immutability

All ADT instances and the ADT itself are deeply frozen and immutable:

```ts
const Color = data({ Red: {}, Green: {}, Blue: {} });

Color.Red = {}; // ✗ Throws Error (cannot modify)
Color.Yellow = {}; // ✗ Throws Error (cannot add properties)

const Point = data({ Point2D: { x: Number, y: Number } });
const p = Point.Point2D({ x: 10, y: 20 });
p.x = 30; // ✗ Throws Error (instance is frozen)
```
