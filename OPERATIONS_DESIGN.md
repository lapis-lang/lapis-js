# ADT Operations Design Document

**Status**: Planning Phase  
**Last Updated**: 2025-11-16  
**Related Issue**: TBD

---

## Table of Contents

1. [Overview](#overview)
2. [Core Operations](#core-operations)
3. [Design Challenges](#design-challenges)
4. [Syntax Design](#syntax-design)
5. [Implementation Strategy](#implementation-strategy)
6. [Open Questions](#open-questions)
7. [Product Backlog Items](#product-backlog-items)

---

## Overview

This document tracks the design and implementation of algebraic operations (fold, unfold, map, merge) for Lapis ADTs. Our ADTs support **open extension via subtyping**, which fundamentally changes how these operations must work compared to closed ADTs.

**Current Implementation Status** (as of 2025-11-22):

- ✅ **fold** - Unified operation for both pattern matching and catamorphism/structural recursion (PBI-2, PBI-4, PBI-5)
- 🚧 **unfold** - Anamorphism/structure generation (PBI-6 - planned)
- 🚧 **map** - Functor/type parameter transformation (PBI-7 - planned)
- 🚧 **merge** - Deforestation/operation fusion (PBI-8 - planned)

**Test Coverage**: 242 tests passing (100% pass rate)

### Semantic Differences from w3future adt.js

While inspired by w3future's excellent work, our operations have different semantics due to our design goals:

| Aspect | w3future adt.js | Lapis JS |
|--------|----------------|----------|
| **ADT Model** | Closed (fixed variants) | Open (extensible via `.extend()`) |
| **Operation Style** | Functions that transform instances | Methods installed on instances |
| **map** | `ADT.map(transforms, instance)` → new instance | `instance.mapOperation()` → new instance |
| **fold** | `ADT.fold(algebra)` → function | `instance.foldOperation()` → result (unified for all ADTs) |
| **merge** | Automatic fusion via transformers | Same (inherited concept) |
| **Subtyping** | Not supported | Core feature |
| **Wildcards** | Not needed | Essential for extensibility |
| **Immutability** | Not specified | Non-writable configurable properties (open for extension) |

**Key Insight**: w3future's operations are **functions** that act on instances. Ours are **operation definitions** that install methods on instances. Both approaches use the transformer abstraction internally for merge/fusion.

### Inspiration

Based on the 2008 [adt.js library](https://w3future.com/weblog/stories/2008/06/16/adtinjs.xml) by Sjoerd Visscher, adapted for modern TypeScript and open ADTs.

### Bird-Meertens Formalism Connection

| Operation | Category Theory Name        | What it does                   |
| --------- | --------------------------- | ------------------------------ |
| `fold`    | catamorphism (unified)      | pattern matching + recursive consumption |
| `unfold`  | anamorphism                 | recursive generation           |
| `map`     | functor map                 | structure-preserving transform |
| `merge`   | algebra product             | combine multiple operations    |

**Key Insight**: Everything else (paramorphisms, histomorphisms, zygomorphisms, hylomorphisms) can be built from these five primitives.

**Derived Morphisms via Merge**:

| Derived Operation | Merge Combination | What it does |
|-------------------|-------------------|--------------|
| **Hylomorphism** | `unfold + fold` | Generate then consume in one pass (e.g., factorial) |
| **Paramorphism** | `fold + map(id)` | Fold with access to original substructure |
| **Apomorphism** | `map(id) + unfold` | Unfold with early termination |
| **Histomorphism** | `fold + fold` | ❌ Not directly supported (needs course-of-values) |
| **Zygomorphism** | `fold + fold` | ❌ Not directly supported (mutual recursion needed) |

**Note**: Histomorphisms and zygomorphisms require extending the merge rules to support auxiliary folds, which is deferred to future work.

**Fold-Fusion Laws**: The theoretical foundation for `merge` comes from the fold-fusion law (also called the acid rain theorem):

```haskell
fold g ∘ fold f = fold h
```

This law states that composing two folds can be fused into a single fold, eliminating the intermediate data structure. Our `merge` operation is a **generalization** of this law to include unfolds and maps:

| Fusion Law | Lapis Merge Equivalent | Example |
|------------|------------------------|---------|
| `fold g ∘ fold f = fold h` | ❌ Not directly supported (only 1 fold allowed) | Would need auxiliary folds |
| `fold f ∘ unfold g = h` | ✅ `.merge('h', ['unfold_g', 'fold_f'])` | `factorial = counter.merge(product)` |
| `map f ∘ map g = map (f ∘ g)` | ✅ `.merge('combined', ['map_g', 'map_f'])` | Multiple map transformations fuse |
| `fold f ∘ map g = fold (f ∘ g)` | ✅ `.merge('result', ['map_g', 'fold_f'])` | Transform then consume |

**Key Insight**: Classic fold-fusion applies to **composing multiple folds**, but our merge rules restrict to **one fold maximum**. This is because:

1. **Single-pass guarantee**: One unfold generates, N maps transform, one fold consumes
2. **Deforestation scope**: We eliminate the intermediate **data structure**, not arbitrary function composition
3. **Practical applicability**: Most real-world use cases follow the unfold→map*→fold pipeline pattern

The fold-fusion law for composing two folds (`fold g ∘ fold f`) would require auxiliary data passing between folds, which is exactly what histomorphisms and zygomorphisms provide. These are deferred to future work.

**Relationship to Deforestation**: Wadler's deforestation theorem shows that any pipeline of producers and consumers over the same data structure can be fused. Our merge operation implements this principle with explicit composition rules rather than automatic whole-program analysis.

---

## Core Operations

### Implementation Order

**Phase 1**: ✅ `fold` (unified pattern matching and catamorphism with automatic extend mode) - **COMPLETED**  
**Phase 2**: `unfold` (anamorphism/generation)  
**Phase 3**: `map` (structure transformation)  
**Phase 4**: `merge` (deforestation)

### 1. **fold** (Unified Pattern Matching and Catamorphism) ✅ IMPLEMENTED

**Definition**: Structural recursion that replaces constructors with functions.

**Definition**: Unified operation for both pattern matching (on non-recursive ADTs) and structural recursion/catamorphism (on recursive ADTs).

**Status**: ✅ Completed (2025-11-21)

**Implementation Notes**:

- Implemented in `src/index.mts` and `src/Transformer.mts`
- Comprehensive test suite in `src/tests/fold.test.mts` (26 tests, all passing)
- Additional test coverage in `src/tests/extend-fold.test.mts` and `src/tests/extend-fold-nonrecursive.test.mts`
- Documentation added to README.md
- **Breaking change**: Removed `.match()` and `.extendMatch()` - fold is now the canonical operation for all ADTs

**Key Design Decision**: Originally, `.match()` handled non-recursive pattern matching and `.fold()` handled recursive catamorphisms. These have been unified into a single `.fold()` operation that:

- On non-recursive ADTs: performs simple pattern matching (no recursion)
- On recursive ADTs: performs structural recursion (catamorphism)
- This simplifies the type system to a single FoldHandlers type with automatic extend detection

**Implemented Syntax** (non-recursive):

```typescript
// Direct object literal syntax (recommended for simple ADTs)
const Color = data({ Red: {}, Green: {}, Blue: {} })
.fold('toHex', { out: String }, () => ({
    Red() { return '#FF0000' },
    Green() { return '#00FF00' },
    Blue() { return '#0000FF' }
}))

Color.Red.toHex() // '#FF0000'
```

**Implemented Syntax** (recursive):

```typescript
const Peano = data(({ Family }) => ({ 
    Zero: {}, 
    Succ: { pred: Family } 
}))
.fold('toValue', { out: Number }, () => ({
    Zero() { return 0 },
    Succ({ pred }) { return 1 + pred }  // pred is already folded to number
}))

const two = Peano.Succ({ pred: Peano.Succ({ pred: Peano.Zero }) })
two.toValue() // 2
```

**Key Implementation Detail**: The fold implementation automatically detects `Family` fields (using stored field specs) and recursively applies the operation **before** calling the handler. Handlers receive already-folded values for recursive fields. For non-recursive ADTs, handlers simply receive the raw field values.

**Traversal Order**:

- **For lists**: Right fold (foldr) - processes from tail to head, right-associative
- **For trees**: Catamorphism - processes from leaves to root, both subtrees before parent
- **General**: Bottom-up structural recursion

**Type Signature** (conceptual):

```typescript
ADT.fold<R>(
    name: string,
    spec: { out: Type },
    algebra: (Family: ADT) => { [Variant]: (fields) => R, _?: (instance) => R }
): ADT & { [name](): R }
```

**Object form** (for non-recursive operations):

```typescript
ADT.fold<R>(
    name: string,
    spec: { out: Type },
    algebra: { [Variant]: (fields) => R, _?: (instance) => R }
): ADT & { [name](): R }
```

**Handler Form**: Handlers use **named form only** for clarity and safety

**With Subtyping**:

```typescript
const ExtendedPeano = Peano.extend(({ Family }) => ({
    Pred: { succ: Family }  // Inverse operation
}))
.fold('toValue', (Family) => ({
    // Inherits Zero and Succ cases from parent (automatic extend mode)
    Pred({ succ }) { return succ.toValue() - 1 }
}))
```

### 2. **unfold** (Anamorphism)

**Definition**: Corecursion that generates structure from a seed value.

**Proposed Syntax**:

```typescript
const List = data(({ Family, T }) => ({
    Nil: {},
    Cons: { head: T, tail: Family }
}))
.unfold('counter', { in: Number, out: List(Number) }, ({ Cons, Nil }) => {
    return (n: number) => n > 0 ? Cons(n, n - 1) : Nil  // Stand-in constructors support both forms
})

List.counter(5) // Cons(5, Cons(4, Cons(3, Cons(2, Cons(1, Nil)))))

// Note: Stand-in CONSTRUCTORS still accept both named and positional (like regular construction)
// Cons(n, n - 1)              // Positional: head, tail
// Cons({ head: n, tail: n-1}) // Named: {head, tail}
// But operation HANDLERS use named form only
```

**Type Signature** (conceptual):

```typescript
ADT.unfold<S, R>(
    name: string,
    spec: { in: Type, out: Type },
    coalgebra: (Family: ADT) => (seed: S) => R
): ADT & { [name](seed: S): R }
```

**Note**: Destructure constructors directly from `Family`: `({ Cons, Nil }) => ...`. These are stand-in constructors that handle recursion automatically.

**Note**: Unfold receives both `Family` (the ADT type) and `constructors` (the stand-in constructors for recursion).

### 3. **map** (Functor)

**Definition**: Transform type parameters while preserving structure.

**Proposed Syntax**:

```typescript
const List = data(({ Family, T }) => ({
    Nil: {},
    Cons: { head: T, tail: Family }
}))
.map('increment', { T: (x: number) => x + 1 })

const nums = List.Cons(1, List.Cons(2, List.Cons(3, List.Nil)))
nums.increment() // Cons(2, Cons(3, Cons(4, Nil)))
```

**Type Signature** (conceptual):

```typescript
ADT.map<TIn, TOut>(
    name: string,
    transforms: { [TypeParam]: (value: TIn) => TOut } |
               ((Family: ADT) => { [TypeParam]: (value: TIn) => TOut })
): ADT & { [name](): ADT }
```

**Note**: Family is less commonly needed for map, but provided for consistency and edge cases.

### 5. **merge** (Deforestation/Fusion)

**Definition**: Compose operations to eliminate intermediate structures. This is the key optimization that makes recursion schemes practical.

**Composition Rules**: You can merge **one fold**, **one unfold**, **one match**, and **any number of maps**, as long as they are defined on the same ADT.

**Valid merge combinations**:

- `unfold + fold` → Generator composed with consumer (e.g., factorial)
- `unfold + map + fold` → Generator with transformations
- `map + fold` → Transform then consume
- `match + map` → Dispatch with transformation
- `unfold + map + map + fold` → Multiple transformations in pipeline

**Invalid merge combinations**:

- ❌ `fold + fold` → Only one fold allowed
- ❌ `unfold + unfold` → Only one unfold allowed
- ❌ `match + fold` → Only one consumer (match or fold, not both)
- ❌ Operations from different ADTs → Must be same ADT family

**The Problem Without Merge**:

```typescript
const counter = List.counter(5)  // Builds: Cons(5, Cons(4, Cons(3, Cons(2, Cons(1, Nil)))))
const result = counter.product()  // Destroys list to compute: 5 * 4 * 3 * 2 * 1
// Two traversals, intermediate list allocated and garbage collected
```

**The Solution With Merge**:

```typescript
const List = data(({ Family, T }) => ({
    Nil: {},
    Cons: { head: T, tail: Family }
}))
.unfold('counter', { in: Number, out: List(Number) }, ({ Cons, Nil }) => {
    return (n: number) => n > 0 ? Cons(n, n - 1) : Nil
})) .fold('product', { out: Number }, (Family) => ({
    Nil() { return 1 },
    Cons({ head, tail }) { return head * tail.product() }
}))
.merge('factorial', ['counter', 'product'])

// No intermediate list created! Single pass from 5 to 120.
List.factorial(5) // 120
```

**How It Works**: Instead of calling the `Cons` constructor, the merged function directly calls the `Cons` handler from `product`. The data structure is never materialized.

**Type Signature** (conceptual):

```typescript
ADT.merge(
    name: string,
    operations: string[]
): ADT & { [name](...args): ReturnType }
```

---

## Design Challenges

### 1. **Exhaustiveness with Open ADTs**

**Problem**: Subtyping means we can't statically know all variants at runtime, but TypeScript provides compile-time exhaustiveness checking.

**Exhaustiveness Rules**:

1. **Base ADTs**: All handlers OR wildcard required
2. **Extending existing operations**: Only new variants need handlers (parent provides inherited handlers)
3. **New operations on extended ADTs**: All variants (parent + new) need handlers OR wildcard

**Traditional Solution** (Closed ADTs):

```typescript
// TypeScript enforces this is exhaustive
type Handler = {
    Zero: () => number,
    Succ: (pred: Peano) => number
}
```

**Our Implementation**:

```typescript
// Base ADT - exhaustiveness enforced
const Peano = data(({ Family }) => ({ 
    Zero: {},
    Succ: { pred: Family }
}))
.fold('toValue', { out: Number }, () => ({
    Zero() { return 0 },
    Succ({ pred }) { return 1 + pred.toValue() }
}))
// ✓ All handlers provided

// Extending the operation - only new variants need handlers
const ExtendedPeano = Peano.extend(() => ({ 
    Pred: { succ: Family } 
})) .fold('toValue', { out: Number }, (Family, ParentFamily) => ({
    Pred({ succ }) { return succ.toValue() - 1 }
    // ✓ Only Pred needs a handler, Zero and Succ inherited from parent
}))

// New operation on extended ADT - all variants need handlers
ExtendedPeano.fold('isZero', { out: Boolean }, () => ({
    Zero() { return true },
    Succ() { return false },
    Pred() { return false }
    // ✓ All three variants handled
}))

// Or use wildcard for partial coverage
ExtendedPeano.fold('isPositive', { out: Boolean }, () => ({
    Succ() { return true },
    _(instance) { return false } // Handles Zero and Pred
}))
```

**Solution**: TypeScript compile-time exhaustiveness checking combined with optional wildcard handlers.

```typescript
// Without wildcard - TypeScript error if handlers missing
.fold('toValue', { out: Number }, () => ({
    Zero() { return 0 },
    Succ({ pred }) { return 1 + pred.toValue() }
}))
// ✓ Compiles - all handlers provided
// ExtendedPeano.Pred.toValue() → Runtime error: No handler for variant 'Pred'

// With wildcard - compiles with partial handlers
.fold('toValue', { out: Number }, () => ({
    Zero() { return 0 },
    Succ({ pred }) { return 1 + pred.toValue() },
    _(variant) { 
        // Custom error message or fallback behavior
        return 0 // Or throw custom error, log, etc.
    }
}))
// ✓ Compiles - wildcard covers missing handlers
// ExtendedPeano.Pred.toValue() → Returns 0 (wildcard handler)
})
```

### 2. **Method Dispatch vs Constructor Dispatch**

**Problem**: Where should operation results live?

**Solution**: Instance methods with careful prototype chain management.

```typescript
const two = Peano.Succ({ pred: Peano.Succ({ pred: Peano.Zero }) })
two.toValue() // Instance method
```

**Rationale**:

- Better ergonomics (`.toValue()` reads naturally)
- Natural inheritance across subtyping hierarchy
- Follows JavaScript conventions
- Better autocomplete/discoverability

**Trade-offs Accepted**: More complex prototype chain management compared to static functions, but this is essential for supporting subtyping and the Open-Closed Principle.

### 3. **Type Parameter Variance**

**Problem**: Subtyping + parameterization = variance headaches.

**Example**:

```typescript
const List = data(({ Family, T }) => ({ ... }))

// Is this valid?
type AnimalList = List(Animal)
type DogList = List(Dog) // where Dog extends Animal

// Does DogList <: AnimalList?
```

**Variance Rules**:

| Position | Variance | Subtyping Rule | Example |
|----------|----------|----------------|---------|
| Output only (return type) | Covariant | `F<Dog> <: F<Animal>` | `() => Dog` is subtype of `() => Animal` |
| Input only (parameter type) | Contravariant | `F<Animal> <: F<Dog>` | `(Animal) => void` is subtype of `(Dog) => void` |
| Both input and output | Invariant | No subtyping | `Array<T>` has both `get(): T` and `set(T)` |

**For ADTs**: Type parameters appear in **constructor fields**, which act as both input (when constructing) and output (when pattern matching/folding).

**Comparison with Haskell GADTs**:

Haskell GADTs allow **phantom type parameters** (types that don't appear in constructor fields) and **variance annotations**:

```haskell
-- Phantom parameter (covariant)
data Expr a where
  LitInt  :: Int -> Expr Int
  LitBool :: Bool -> Expr Bool
  -- 'a' only appears in return position → covariant

-- Our approach: concrete parameters
const Expr = data(({ Family, T }) => ({
  LitInt: { value: Number },      // T appears nowhere
  LitBool: { value: Boolean }     // T appears nowhere
}))
// But we can't specialize T per variant!
```

#### Future Consideration: Default Type Parameters

Default type parameters like `data(() => ({Family, T = Number})` would provide **default instantiation**, not per-variant specialization:

```typescript
// Default parameter (orthogonal to per-variant types)
const List = data(({ Family, T = Number }) => ({
    Nil: {},
    Cons: { head: T, tail: Family }
}))

// T defaults to Number if not specified
const nums = List.Nil           // List<Number>
const strs = List(String).Nil   // List<String> - explicit override

// Still can't do GADT-style per-variant refinement:
// ❌ Can't make Nil have different T than Cons
// ❌ Can't refine T based on which variant you construct
```

This is **orthogonal** to GADT-style type refinement because:

- **Defaults**: `T = Number` means "if user doesn't specify, use Number" (applies to whole ADT)
- **Refinement**: `LitInt :: Expr Int` means "this variant forces type to Int" (varies per variant)

To achieve GADT-like behavior, we'd need **per-variant type parameters**, which is a much larger feature:

```typescript
// Hypothetical GADT-style syntax (not currently supported)
const Expr = data(({ Family }) => ({
    LitInt: { T: Number }  { value: Number },    // Forces T=Number
    LitBool: { T: Boolean } { value: Boolean },  // Forces T=Boolean
    Add: { T: Number } { left: Family<Number> , right: Family<Number>  }
}))
// Would enable: Expr<T> where T is refined by variant
```

**Current Thinking**: Defaults are useful and tractable. Per-variant specialization is much more complex and deferred.

**Key Differences**:

| Aspect | Haskell GADTs | Lapis ADTs |
|--------|---------------|------------|
| **Phantom types** | Supported (`Expr a` where `a` not in fields) | Not supported |
| **Variance** | Can be covariant/contravariant via phantom types | Always invariant (fields = both positions) |
| **Type refinement** | `LitInt :: Expr Int` refines the type | All variants share same type parameter |
| **Subtyping** | Via newtype/coercion, not inheritance | Via `.extend()` with structural subtyping |

**Why we're invariant**: Our type parameters appear in **actual data fields** that can be both read (pattern matching) and written (construction). Haskell's phantom types exist only at the type level, never in runtime values, so they can be safely covariant.

**Current Thinking**: **Invariant** by default. Type parameters do NOT induce subtyping.

```typescript
List(Number) NOT <: List(Object)
List(Object) NOT <: List(Number)
```

### 5. **Unfold Constructor Signatures**

**Problem**: When a subtype adds constructors, can inherited unfolds use them?

**Solution**: No mitigation needed. Unfolds are naturally scoped to the constructors they're defined with:

```typescript
// SkipList inherits List.counter, still only produces Nil and Cons
SkipList.counter(5) // Works fine - produces regular list

// To use Skip2, write a new unfold
SkipList.unfold('skipCounter', { in: Number, out: SkipList(Number) },
    ({ Skip2, Cons, Nil }) => {
        return (n: number) => {
            if (n > 1) return Skip2(n, n-1, n-2)  // Consume 2 from seed
            if (n === 1) return Cons(1, 0)        // Fallback
            return Nil
        }
    }
)
```

**Rationale**: Type safety comes from the `out` type declaration - TypeScript enforces that the unfold produces the declared output type.

**Verdict**: The "problem" was based on a misunderstanding. Unfolds naturally only use the constructors they're written for. Type safety comes from `out: List(Number)` - the unfold must produce the declared output type, and TypeScript will enforce that the returned value matches.

### 6. **Override vs Extend Semantics**

**Problem**: When a subtype defines the same operation, what happens?

**Solution**: Operations are inherited and extended by default. A unified `.extendMatch()` method supports both adding new handlers and overriding parent handlers. Override is detected by checking if a handler exists in the parent - if it wants access to the parent value, it includes a `parent` parameter:

```typescript
// Extend - add new cases, inherit parent cases
.extendMatch('op', {
    B() { return 3 }
})

// Override with parent access - handler includes parent parameter
.extendMatch('op', {
    A(parent) { return parent() + 1 }  // Can call original
})

// Override without parent access - same arity as original
.extendMatch('op', {
    A() { return 5 }  // Completely replace
})

// Both - extend and override simultaneously
.extendMatch('op', {
    B() { return 3 },           // New case
    A(parent) { return parent() * 2 }  // Override with access to parent
})
```

---

## Syntax Design

### Proposed API Fluent Chain

```typescript
data(declaration)
    .fold(name, spec, algebra)
    .unfold(name, spec, coalgebra)
    .map(name, transforms)
    .match(name, spec, handlers)
    .merge(name, operations)
    .extend(newVariants)
        // Extend inherited operations (detect override by parent handler existence)
        .fold(name, spec, handlers)  // Auto-detects extend mode
        .extendUnfold(name, handlers)
        .extendMap(name, transforms)
        .extendMatch(name, handlers)
```

### Type Specification Format

```typescript
// Simple output type
{ out: Number }

// Input and output types
{ in: Number, out: List(Number) }

// Type parameter transforms
{ T: Number => String }
```

**Note on Handler Forms**:

**Operation handlers use named form only** (destructure fields):

```typescript
// Handler form (REQUIRED)
Cons({ head, tail }) { return head + tail }  // Named: self-documenting
Cons({ head }) { return head * 2 }           // Can ignore unused fields

// Variant CONSTRUCTION still supports both forms:
const list1 = List.Cons(1, List.Nil)                    // Positional
const list2 = List.Cons({ head: 1, tail: List.Nil })    // Named

// Handlers always destructure fields regardless of how variant was constructed
```

**Rationale**: Named form in handlers provides clarity, prevents parameter order errors, and allows partial destructuring.

---

## Implementation Architecture

### Transformer Abstraction (Inspired by w3future adt.js)

**Key Insight**: All operations (fold, unfold, map, case, merge) are special cases of a generalized **transformer**.

**Transformer Components**:

```typescript
interface Transformer<In, Out> {
    name: string
    
    // How to generate values (unfold)
    // Receives Family (destructure to get stand-in constructors)
    generator?: (Family: ADT) => (seed: In) => Out
    
    // How to transform constructors (fold/match)
    getCtorTransform?: (ctor: Constructor) => Function
    
    // How to transform type parameters (map)
    getParamTransform?: (paramName: string) => Function
    
    // How to transform non-algebraic values (atoms)
    getAtomTransform?: (ctor: Constructor) => Function
}
```

**Example - How `fold` becomes a transformer**:

```typescript
List.fold('product', { out: Number }, (Family) => ({
    Nil() { return 1 },
    Cons({ head, tail }) { return head * tail.product() }
}))

// Internally becomes:
{
    name: 'product',
    getCtorTransform: (ctor) => {
        if (ctor.name === 'Nil') return () => 1
        if (ctor.name === 'Cons') return ({ head, tail }) => head * tail.product()
        return undefined // No transform for other constructors
    }
}

// Note: Handlers use named form only for clarity and consistency
```

**Example - How `merge` composes transformers**:

```typescript
List.merge('factorial', ['counter', 'product'])

// Internally:
// 1. Get counter transformer (unfold - has generator)
// 2. Get product transformer (fold - has getCtorTransform)
// 3. Compose them: when counter.Cons is called, invoke product.Cons instead of Cons constructor
```

**Benefits**:

- Single implementation for operation composition
- Merge works uniformly across fold/unfold/map
- Deforestation happens automatically
- Extensible to new operation types

**Implementation Strategy**: Build transformer infrastructure first, then implement each operation as a transformer factory.

**Comparison with w3future approach**:

| Aspect | w3future adt.js | Our Approach |
|--------|----------------|--------------|
| **Language** | JavaScript 1.8 (expression closures) | TypeScript (modern) |
| **Subtyping** | Not supported | Core feature via `.extend()` |
| **Wildcards** | Not needed (closed ADTs) | Essential (open ADTs) |
| **Merge** | Automatic transformer composition | Same principle + subtyping |
| **Type safety** | Runtime only | Compile-time + runtime |

**Key Differences**:

- w3future's transformers don't need to handle inheritance
- Our `.fold()` must compose transformers across prototype chain when in extend mode
- Wildcard handlers add a dispatch layer not present in original

---

## Implementation Strategy

### Phase 1: Unified Fold Operation ✅ COMPLETED

**Goals**:

- [x] Design transformer abstraction (based on w3future)
- [x] Add operation registry to ADT class
- [x] Implement prototype method installation
- [x] Implement unified `.fold()` for both non-recursive and recursive ADTs
- [x] Automatic extend mode detection with polymorphic recursion
- [x] Wildcard handler support for open extensibility

**Deliverables**:

- Transformer interface and base implementation
- Updated `data()` function signature
- Unified `.fold()` method replacing separate match/fold operations
- Automatic extend mode when parent has operation
- Comprehensive tests (242 tests, 100% pass rate)
- Full documentation in README.md

**Implementation Notes (2025-11-18 to 2025-11-22)**:

Extracted shared logic into helper functions to eliminate ~500 lines of duplication:

- `collectVariantTypes()` - Collects variant type information
- `mergeHandlersWithParent()` - Merges handlers with parent callback injection
- `createShadowVariants()` - Creates shadow variants for overrides
- `installExtendedOperation()` - Installs operations on appropriate variants

**Immutability Design Decision (2025-11-22)**:

Implemented "open for extension, closed for modification" semantics:

- Variant properties are **non-writable** (`writable: false`) - prevents direct assignment in strict mode
- Variant properties are **configurable** (`configurable: true`) - allows `Object.defineProperty` to redefine for fold extensions
- ADT objects are **not sealed/frozen** - allows shadow variant assignment during fold extension
- Variant instances remain **deeply frozen** - immutable data

This provides the right balance between immutability and extensibility for fold operations.

### Phase 2: Unfold & Map (Future)

**Goals**:

- [ ] Implement unfold with constructor stand-ins
- [ ] Implement map for parameterized ADTs
- [ ] Handle type parameter transformations

**Deliverables**:

- `.unfold()`, `.map()` methods
- Tests for generation and transformation
- Examples: factorial, tree transformations

### Phase 3: Merge & Fusion (Future)

**Goals**:

- [ ] Implement operation composition
- [ ] Optimize to eliminate intermediate structures
- [ ] Handle merged operations across hierarchy

**Deliverables**:

- `.merge()` method
- Performance benchmarks
- Deforestation examples

### Phase 4: Polish & Documentation (Future)

**Goals**:

- [ ] Error messages
- [ ] TypeScript type inference
- [ ] README updates
- [ ] Migration guide

**Deliverables**:

- Complete API documentation
- Tutorial examples
- Breaking change guide (if any)

---

## Open Questions

### Q1: Should operations return new instances or mutate?

**Context**: All ADT instances are frozen/immutable. Operations that transform structure must return new instances.

**Answer**: Always return new instances. Never mutate.

### Q2: How do we handle `merge` across different ADT types?

**Example**:

```typescript
const List = data(...)
const Tree = data(...)

// Can we merge List.fold with Tree.fold?
// Probably not, but what about:
const ListOfTrees = List(Tree)
```

**Current Thinking**: Merge only works within same ADT family.

### Q3: Should we support multi-argument folds?

**Example** (mutual recursion):

```typescript
const Expr = data(...)
const Stmt = data(...)

// Fold both simultaneously?
Expr.fold('eval', Stmt.fold('exec', ...))
```

**Current Thinking**: Defer to Phase 6 (advanced features).

### Q4: How do we infer return types?

**Challenge**: TypeScript can't easily infer the return type of a fold from the algebra.

```typescript
.fold('toValue', { out: Number }, () => ({
    Zero() { return 0 },          // infers number
    Succ({ pred }) { return 1 + pred.toValue() } // infers number
}))
```

**Solution**: Require explicit `out` spec and validate consistency with TypeScript's inferred return type.

### Q5: What about non-terminating unfolds?

**Current Thinking**: Allow it. Document termination as user responsibility. TypeScript can't prevent infinite recursion in unfolds any more than it can prevent `while(true)` loops. The `out` type declares intent, but runtime termination is the user's responsibility.

### Q6: Should operations be namespaced?

**Problem**: Name collisions between operations and instance fields.

```typescript
// Direct object literal syntax for non-recursive ADT
const Point = data({ 
    Point2D: { x: Number, y: Number } 
})) .fold('x', { out: Number }, () => ({ ... })) // Collision with field 'x'!
```

**Solution**: Error on collision to prevent shadowing.

---

### Q7: Single-argument operations - feature or limitation?

**Observation**: Bird-Meertens Formalism (BMF) gives us operations that are either zero-argument (fold, map, match) or single-argument (unfold, merged unfolds). There are no multi-argument operation calls in the core primitives.

**Current signatures:**

- `instance.toValue()` - fold, no args
- `instance.increment()` - map, no args
- `instance.toHex()` - match, no args
- `List.counter(5)` - unfold, single seed
- `List.factorial(5)` - merged unfold+fold, single seed

**Question**: Is this simplicity a **welcome feature** (fewer concerns about argument forms) or an **insufficiency** (limits expressiveness)?

**Current Thinking**: Defer to practical usage. If multi-argument operations are needed, we can address the named/positional question at that time. For now, the BMF primitives don't require it.

---

## Product Backlog Items

The following PBIs provide an iterative implementation plan for ADT operations. Each item is independently valuable and builds upon previous work.

### Epic: ADT Operations Foundation

**Goal**: Enable algebraic operations (fold, unfold, map, match, merge) on Lapis ADTs with full subtyping support.

---

### PBI-1: Transformer Infrastructure

**Title**: Implement transformer abstraction for operation composition

**Description**:
As a library developer, I need a unified transformer abstraction so that all operations (fold, unfold, map, match, merge) can be composed uniformly.

**Acceptance Criteria**:

- [ ] Define `Transformer<In, Out>` interface with:
  - `generator?: (Family: ADT) => (seed: In) => Out`
  - `getCtorTransform?: (ctor: Constructor) => Function`
  - `getParamTransform?: (paramName: string) => Function`
  - `getAtomTransform?: (ctor: Constructor) => Function`
- [ ] Implement transformer registry on ADT instances
- [ ] Support transformer lookup by operation name
- [ ] Add tests for transformer registration and retrieval
- [ ] Document transformer abstraction in README.md
- [ ] Add TypeScript type definitions

**Dependencies**: None

**Estimated Effort**: 3-5 days

---

### PBI-2: Unified Fold Operation ✅ COMPLETED

**Title**: Implement unified `.fold()` operation for pattern matching and structural recursion

**Description**:
As a developer using Lapis ADTs, I want to define fold operations that work uniformly on both non-recursive and recursive ADTs, with automatic extend mode detection.

**Status**: ✅ Completed (2025-11-22)

**Implementation Notes**:

- Unified operation replaces separate `.match()` and `.fold()` methods
- On non-recursive ADTs: performs simple pattern matching (no recursion)
- On recursive ADTs: performs catamorphism (structural recursion from leaves to root)
- Automatic extend mode detection when parent has operation
- Polymorphic recursion: recursive calls use extended operation
- Automatic recursion on `Family` fields - handlers receive already-folded values
- For lists: behaves as right fold (foldr)
- For trees: processes both subtrees before parent node
- Comprehensive test coverage: 242 tests (100% pass rate)
- Full TypeScript type safety and inference
- Immutability via non-writable configurable properties

**Acceptance Criteria**:

- [x] Implement `ADT.fold(name, spec, algebra)` method
- [x] Support callback form: `(Family) => algebra` for all ADTs
- [x] Automatic extend mode detection when parent has operation
- [x] Install operation as zero-argument instance method
- [x] Handlers use named form only: `Variant({ field1, field2 }) => ...`
- [x] Non-recursive ADTs: simple pattern matching (no recursion)
- [x] Recursive ADTs: automatic recursion on `Family` fields (handlers receive folded values)
- [x] Support wildcard handler for unknown variants
- [x] Inherit parent handlers automatically in extend mode
- [x] Support `parent` symbol for access to parent handler in overrides
- [x] Polymorphic recursion: recursive calls use extended operation
- [x] Detect name collisions with variant fields
- [x] Create transformer representation for fold operations
- [x] Add TypeScript type signatures with inference
- [x] Infer handler parameter types and validate return type matches `out` spec
- [x] Document pattern matching, catamorphisms, and extension patterns
- [x] Tests:
  - [x] Simple enumeration (Color.toHex)
  - [x] Structured variants (Point.quadrant)
  - [x] Peano.toValue (recursive)
  - [x] List.length, List.sum, List.product (recursive lists)
  - [x] Binary tree height and sum (multiple recursive fields)
  - [x] Parameterized ADTs (List with type parameter)
  - [x] Wildcard handlers for extensibility
  - [x] Name collision detection
  - [x] Type safety for handlers
  - [x] Deeply nested structures (100+ elements)
  - [x] Extension with new handlers
  - [x] Override parent handler with parent access
  - [x] Multiple levels of extension
  - [x] Polymorphic recursion correctness

**Examples**:

```typescript
// Non-recursive ADT (pattern matching)
const Color = data({ Red: {}, Green: {}, Blue: {} })
.fold('toHex', { out: String }, () => ({
  Red() { return '#FF0000' },
  Green() { return '#00FF00' },
  Blue() { return '#0000FF' }
}))

Color.Red.toHex() // '#FF0000'

// Recursive ADT (catamorphism)
const Peano = data(({ Family }) => ({ 
  Zero: {}, 
  Succ: { pred: Family } 
}))
.fold('toValue', { out: Number }, () => ({
  Zero() { return 0 },
  Succ({ pred }) { return 1 + pred }  // pred is already folded to number
}))

const two = Peano.Succ({ pred: Peano.Succ({ pred: Peano.Zero }) })
two.toValue() // 2

// Extension with automatic extend mode
const IntExpr = data(({ Family }) => ({
  IntLit: { value: Number },
  Add: { left: Family, right: Family }
}))
.fold('eval', { out: Number }, () => ({
  IntLit({ value }) { return value },
  Add({ left, right }) { return left + right }
}))

// Automatic extend mode detected - only new variants need handlers
const IntBoolExpr = IntExpr.extend(({ Family }) => ({
  BoolLit: { value: Boolean }
}))
.fold('eval', () => ({
  BoolLit({ value }) { return value ? 1 : 0 }  // Inherits IntLit and Add from parent
}))
```

**Key Implementation Details**:

- The `installOperationOnVariant` function detects `Family` fields using stored `_fieldSpecs` metadata
- Automatically applies the operation recursively before invoking the handler
- Enables bottom-up structural recursion without manual traversal code
- Extend mode detected by checking if parent ADT has the operation
- Helper functions eliminate code duplication:
  - `collectVariantTypes()` - Determine singleton vs structured variants
  - `mergeHandlersWithParent()` - Merge parent/child handlers with parent callback injection
  - `createShadowVariants()` - Create shadow variants for overridden inherited variants
  - `installExtendedOperation()` - Install operation on appropriate variants

**Dependencies**: PBI-1 (Transformer Infrastructure) ✅

**Actual Effort**: 3 days (2025-11-18 to 2025-11-22)

---

### PBI-6: Unfold Operation (Anamorphism)

**Title**: Implement `.unfold()` operation for structure generation

**Description**:
As a developer using Lapis ADTs, I want to define unfold operations so that I can generate ADT structures from seed values.

**Acceptance Criteria**:

- [ ] Implement `ADT.unfold(name, spec, coalgebra)` method
- [ ] Provide stand-in constructors to coalgebra: `({ Cons, Nil }) => ...`
- [ ] Stand-in constructors accept both named and positional forms
- [ ] Stand-in constructors handle recursion automatically
- [ ] Install operation as static method on ADT: `ADT.operationName(seed)`
- [ ] Operation takes single seed argument: `{ in: Type, out: Type }`
- [ ] Detect name collisions with variant fields
- [ ] Create transformer representation for unfold operations
- [ ] Add TypeScript type signatures with inference
- [ ] Infer seed type and output type, validate coalgebra signature
- [ ] Document anamorphisms and generation patterns
- [ ] Document termination responsibility
- [ ] Tests:
  - [ ] List.counter (countdown)
  - [ ] List.range (with step)
  - [ ] Tree.unfold (binary tree generation)
  - [ ] Termination check (base case reached)
  - [ ] Name collision detection
  - [ ] Type safety for seed and output

**Example**:

```typescript
const List = data(({ Family, T }) => ({
  Nil: {},
  Cons: { head: T, tail: Family }
}))
.unfold('counter', { in: Number, out: List(Number) }, ({ Cons, Nil }) => {
  return (n: number) => n > 0 ? Cons(n, n - 1) : Nil
})

List.counter(5) // Cons(5, Cons(4, Cons(3, Cons(2, Cons(1, Nil)))))
```

**Dependencies**: PBI-2 (Unified Fold Operation) ✅

**Estimated Effort**: 8-10 days

---

### PBI-3: Map Operation (Functor) ✅ **COMPLETED**

**Title**: Implement `.map()` operation for type parameter transformation

**Description**:
As a developer using parameterized ADTs, I want to define map operations so that I can transform type parameters while preserving structure.

**Acceptance Criteria**:

- [x] Implement `ADT.map(name, transforms)` method
- [x] Support transform spec: `{ T: (value: TIn) => TOut }`
- [x] Support callback form: `(Family) => transforms` for edge cases
- [x] Support arguments in transform functions for parameterized transformations
- [x] Return new instance with transformed parameters
- [x] Preserve structure exactly (same constructors/recursion)
- [x] Detect name collisions with variant fields
- [x] Create transformer representation for map operations
- [x] Tests:
  - [x] List.increment (number transformation)
  - [x] List.stringify (type change)
  - [x] Tree.map (recursive structure)
  - [x] Multiple type parameters
  - [x] Name collision detection
  - [x] Non-parameterized ADTs
  - [x] Arguments passed to transform functions

**Example**:

```typescript
const List = data(({ Family, T }) => ({
  Nil: {},
  Cons: { head: T, tail: Family(T) }
}))
.map('increment', {}, { T: (x) => x + 1 })
.map('scale', {}, { T: (x, factor) => x * factor })

List.Cons({ head: 1, tail: List.Cons({ head: 2, tail: List.Nil }) }).increment()
// Cons({ head: 2, tail: Cons({ head: 3, tail: Nil }) })

List.Cons({ head: 2, tail: List.Cons({ head: 3, tail: List.Nil }) }).scale(10)
// Cons({ head: 20, tail: Cons({ head: 30, tail: Nil }) })
```

**Implementation Notes**:

- Signature: `ADT.map(name, spec, transforms)` where `spec = { out: ADT }` (optional, defaults to the ADT)
- Runtime validation: validates return values against `spec.out` if provided
- Uses `TypeParamSymbol` and `_fieldSpecs` for runtime type parameter metadata
- Transform functions receive `(value, ...args)` - supports parameterized transformations
- Recursively transforms `Family` fields via `fieldValue[opName](...args)` - arguments passed through
- Non-type-parameter fields pass through unchanged
- Works on non-parameterized ADTs (acts as identity on non-type-parameter fields)
- Operation names must be camelCase (validated at runtime)
- Collision detection checks against variant field names and reserved properties
- Immutable: creates fresh instances, never modifies original values

**Dependencies**: PBI-2 (Unified Fold Operation) ✅

**Completion Date**: 2025-01-15

---

### PBI-4: Merge Operation (Deforestation)

**Title**: Implement `.merge()` operation for composition and fusion

**Description**:
As a developer optimizing ADT operations, I want to merge multiple operations so that intermediate structures are eliminated (deforestation).

**Acceptance Criteria**:

- [ ] Implement `ADT.merge(name, operations)` method
- [ ] Compose transformers from named operations
- [ ] Enforce composition rules:
  - [ ] Maximum 1 fold
  - [ ] Maximum 1 unfold
  - [ ] Maximum 1 match
  - [ ] Any number of maps
  - [ ] All operations from same ADT family
- [ ] Validate composition is legal before creating merged operation
- [ ] Install merged operation with appropriate signature:
  - [ ] If includes unfold: `ADT.operationName(seed)`
  - [ ] Otherwise: `instance.operationName()`
- [ ] Eliminate intermediate data structure construction (deforestation)
- [ ] Detect name collisions with variant fields
- [ ] Add TypeScript type signatures with inference
- [ ] Infer merged operation signature from composed operations
- [ ] Document deforestation, fusion laws, and composition rules
- [ ] Document derived morphisms (hylomorphism, paramorphism, apomorphism)
- [ ] Performance benchmark: validate deforestation eliminates intermediate structures
- [ ] Tests:
  - [ ] unfold + fold (hylomorphism - factorial)
  - [ ] fold + map (paramorphism)
  - [ ] map + unfold (apomorphism)
  - [ ] unfold + map + fold (complex pipeline)
  - [ ] Invalid compositions (error messages)
  - [ ] Name collision detection
  - [ ] Performance: merged vs separate (should show significant improvement)
  - [ ] Memory: no intermediate allocation in merged operations

**Example**:

```typescript
const List = data(({ Family, T }) => ({
  Nil: {},
  Cons: { head: T, tail: Family }
}))
.unfold('counter', { in: Number, out: List(Number) }, ({ Cons, Nil }) => {
  return (n: number) => n > 0 ? Cons(n, n - 1) : Nil
})) .fold('product', { out: Number }, () => ({
  Nil() { return 1 },
  Cons({ head, tail }) { return head * tail.product() }
}))
.merge('factorial', ['counter', 'product'])

List.factorial(5) // 120 (no intermediate list!)
```

**Dependencies**: PBI-3 (Map Operation)

**Estimated Effort**: 10-13 days

---

### PBI-5: Operation Name Collision Detection

**Title**: Detect and prevent operation name collisions with fields

**Description**:
As a library developer, I want to detect when operation names collide with variant field names so that users get clear error messages instead of shadowing bugs.

**Acceptance Criteria**:

- [ ] Check operation name against all variant field names
- [ ] Throw descriptive error if collision detected
- [ ] Error message shows:
  - [ ] Operation name
  - [ ] Conflicting variant(s)
  - [ ] Conflicting field name(s)
- [ ] Tests:
  - [ ] Collision with single variant field
  - [ ] Collision across multiple variants
  - [ ] No collision (success case)

**Dependencies**: PBI-4 (Merge Operation)

**Estimated Effort**: 2-3 days

---

### Stretch Goals (Future Iterations)

#### PBI-6: Histomorphisms and Zygomorphisms

**Title**: Support operations requiring multiple folds

**Description**: Extend merge rules to support auxiliary folds needed for histomorphisms (course-of-values recursion) and zygomorphisms (mutual recursion).

**Dependencies**: PBI-4 (Merge Operation)

**Estimated Effort**: TBD (requires design iteration)

---

## References

- [adt.js Original Library](https://w3future.com/weblog/stories/2008/06/16/adtinjs.xml)
- [Bananas, Lenses, Envelopes and Barbed Wire](https://maartenfokkinga.github.io/utwente/mmf91m.pdf) - Meijer, Fokkinga, Paterson
- [Data Types à la Carte](http://www.cs.nott.ac.uk/~psztxa/publ/DepPattern.pdf) - Swierstra
- [Functional Programming with Bananas, Lenses, Envelopes and Barbed Wire](https://research.utwente.nl/en/publications/functional-programming-with-bananas-lenses-envelopes-and-barbed-w)
- Bird-Meertens Formalism / Squiggol notation
