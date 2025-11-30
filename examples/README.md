# Lapis JS Examples

This directory contains canonical usage examples of common ADTs (Algebraic Data Types) and their operations using Lapis JS.

## Running Examples

Each example is a standalone executable module that can be run directly via Node.js:

```bash
# ADT (Data) examples
node examples/color.mjs
node examples/point.mjs
node examples/peano.mjs
node examples/list.mjs
node examples/stack.mjs

# Codata examples
node examples/codata-stream.mjs
node examples/codata-set.mjs
node examples/rose-tree.mjs
node examples/parametric-observers.mjs
```

Or run all examples:

```bash
for f in examples/*.mjs; do node "$f"; echo; done
```

## ADT (Data) Examples

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

## Codata Examples

### codata-stream.mjs

Infinite streams and lazy evaluation demonstrating:

- Basic stream with simple observers (`head`) and continuations (`tail`)
- Multiple unfold constructors (`From`, `Constant`, `Range`)
- Parametric observers for random access (`nth`)
- Fibonacci stream with complex seed transformations
- Infinite binary tree
- Lazy evaluation and memoization behavior
- Effect-like codata (Console IO)
- Power streams with multiple seed values

**Demonstrates:** Codata basics, lazy evaluation, memoization, parametric observers, infinite structures

### codata-set.mjs

Infinite sets as codata interfaces demonstrating:

- Infinite sets defined by membership functions (`Evens`, `Odds`, `Multiples`)
- Prime number set with primality testing
- Range sets (intervals) 
- Characteristic functions (`Squares`, `Positive`, `Fibonacci`)
- Parametric observers for set operations (`lookup`, `contains`)
- Multiple unfold constructors for different set types
- Interface-based set representation

**Demonstrates:** Infinite sets, membership testing, multiple constructors, characteristic functions

### rose-tree.mjs

Lazy multi-way trees demonstrating:

- Rose trees with lazy children generation
- N-ary trees with variable number of children
- File system tree (directories and files)
- Game trees (move exploration)
- Factor trees (prime factorization)
- Expression trees with evaluation
- On-demand structure generation
- Recursive tree traversal

**Demonstrates:** Lazy trees, dynamic children, recursive structures, practical tree applications

### parametric-observers.mjs

Advanced parametric observer patterns demonstrating:

- Stream with `nth`, `take`, and `drop` parametric observers
- Parametric observers returning continuations (`drop: { in: Number, out: Self(T) }`)
- Infinite grid/matrix with 2D indexing
- Lazy sequence with window operations
- Dictionary/map as codata
- Time series with interpolation
- Graph as codata with adjacency queries
- Memoization behavior of parametric observer functions

**Demonstrates:** Advanced parametric observers, continuations from parametric observers, memoization

## Key Concepts Illustrated

All examples demonstrate:

- **Object literal fold handlers**: Handlers can be plain objects instead of requiring callback functions
- **Type safety**: Guards validate field types at construction time
- **Immutability**: All variant instances are deeply frozen
- **Instanceof checks**: Proper type hierarchy support
- **Stack safety**: Fold operations use iterative traversal for deep structures

### Codata-Specific Concepts

Codata examples additionally demonstrate:

- **Observer-based definition**: Codata defined by how it's observed, not constructed
- **Lazy evaluation**: Observers computed on access via Proxy
- **Memoization**: Continuations (`Self`) are memoized, simple observers are not
- **Parametric observers**: Functions that take input and return output
- **Infinite structures**: Streams, trees, sets that extend indefinitely
- **Effect representation**: IO and stateful operations as codata
