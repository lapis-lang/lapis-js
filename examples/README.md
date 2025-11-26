# Lapis JS Examples

This directory contains canonical usage examples of common ADTs (Algebraic Data Types) and their operations using Lapis JS.

## Running Examples

Each example is a standalone executable module that can be run directly via Node.js:

```bash
node examples/color.mjs
node examples/point.mjs
node examples/peano.mjs
node examples/list.mjs
node examples/stack.mjs
```

Or run all examples:

```bash
for f in examples/*.mjs; do node "$f"; echo; done
```

## Examples

### color.mjs

Simple enumeration ADT demonstrating:

- Basic variant definition (`Red`, `Green`, `Blue`)
- Multiple fold operations (`toHex`, `toRGB`, `isWarm`)
- ADT extension with new variants (`Yellow`, `Orange`, `Purple`)
- Fold operation extension for new variants
- Type checking with `instanceof`
- Object literal form for fold handlers

**Demonstrates:** Simple enumerations, ADT extension, fold operations

### point.mjs

Structured data ADT demonstrating:

- Multiple variants with different fields (`Point2D`, `Point3D`)
- Named and positional argument construction
- Fold operations on structured data (`distanceFromOrigin`, `quadrant`)
- Field access on variant instances
- Type checking for specific variants

**Demonstrates:** Structured data, field validation, multiple variant types

### peano.mjs

Recursive ADT demonstrating:

- Recursive type definition using `Family`
- Manual construction of recursive structures
- Fold operations as catamorphisms (`toValue`, `add`)
- Unfold operations as anamorphisms (`FromValue`)
- Stack-safe recursion on large structures (1000 levels)
- Recursive structure navigation

**Demonstrates:** Recursive ADTs, catamorphisms, anamorphisms, stack safety

### list.mjs

Parameterized recursive ADT demonstrating:

- Type parameters (`T`) and recursive families
- Multiple fold operations (`sum`, `length`, `product`)
- Map operations for type transformations (`increment`, `double`, `square`)
- Unfold operations for generation (`Range`)
- Merge operations for deforestation (`Factorial`, `sumOfSquares`)
- Operations defined on instantiated parameterized types
- Stack safety with large lists (1000 elements)

**Demonstrates:** Parameterized ADTs, map operations, deforestation, hylomorphisms

### stack.mjs

Parameterized stack ADT demonstrating:

- Stack data structure with `Empty` and `Push` variants
- Fold operations (`size`, `peek`, `toArray`)
- Direct field access for stack operations (`.rest`)
- Unfold from arrays (`FromArray`)
- Multiple type instantiations (`Stack(Number)`, `Stack(String)`)
- Incremental stack building

**Demonstrates:** Stack data structure, unfold from collections, field access

## Key Concepts Illustrated

All examples demonstrate:

- **Object literal fold handlers**: Handlers can be plain objects instead of requiring callback functions
- **Type safety**: Guards validate field types at construction time
- **Immutability**: All variant instances are deeply frozen
- **Instanceof checks**: Proper type hierarchy support
- **Stack safety**: Fold operations use iterative traversal for deep structures
