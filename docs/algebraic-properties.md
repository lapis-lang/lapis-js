# Algebraic Properties for Protocols and Operations

## Overview

This document proposes first-class algebraic property annotations for Lapis JS protocols and operations. Today, protocols specify *structural* requirements (what operations must exist and what shape they have). This proposal extends them to specify *algebraic* requirements (what laws those operations must satisfy), enabling runtime law checking, property-based testing, and optimization.

The central insight: Lapis already has the infrastructure for this. Protocol specs accept `ensures` predicates that act as runtime-checked laws, and `[invariant]` enables cross-operation constraints. But these are *opaque predicates* — the system can check them but cannot reason about them structurally. A well-known property like associativity is encoded as an anonymous function rather than a named, exploitable fact.

## Motivation

### BMF demands it

The Bird-Meertens Formalism derives efficient programs from algebraic laws. Laws like fusion (`fold f . map g ≡ fold (f . g)`), associativity (enabling parallel reduction), and naturality (commuting polymorphic operations with structure-preserving maps) are the core machinery. Making these laws first-class brings Lapis closer to its theoretical foundations — the system can exploit them for optimization instead of relying on the programmer to apply them manually via `merge`.

### Protocols should be algebraic, not just structural

A `Semigroup` protocol that only says "you must have a `combine` with this shape" is an interface, not an algebraic specification. Declaring `[properties]: ['associative']` makes the protocol say "you must have an *associative* `combine`" — which is what a semigroup actually is. The protocol becomes a true algebraic theory.

### Optimization requires metadata

The `merge` system already performs deforestation, and `relation().closure()` already computes transitive closures. But these optimizations are hardcoded to specific structural patterns. With algebraic property metadata, the optimizer can apply transformations generically: any associative fold can be parallelized, any commutative operation can be reordered, any idempotent operation can deduplicate.

## Design

### Level 1: Declarative Annotations (Metadata)

A new exported symbol `properties` on operation specs, validated against a closed vocabulary of well-known algebraic property names:

```ts
import { protocol, properties } from '@lapis-lang/lapis-js';

const Semigroup = protocol(({ Family, fold }) => ({
    combine: fold({
        in: Family,
        out: Family,
        [properties]: ['associative']
    })
}));

const CommutativeMonoid = protocol(({ Family, fold, unfold }) => ({
    [extend]: Semigroup,
    Identity: unfold({ out: Family }),
    combine: fold({
        in: Family,
        out: Family,
        [properties]: ['associative', 'commutative', 'identity']
    })
}));

const Ordered = protocol(({ Family, fold }) => ({
    compare: fold({
        in: Family,
        out: Number,
        [properties]: ['antisymmetric', 'transitive', 'total']
    })
}));
```

**Implementation scope:**

- New `properties` symbol exported from `operations.mts`
- `[properties]` accepted on fold/unfold/map specs (validated at parse time)
- Stored as `Set<string>` on `ProtocolOpSpec` and on `Transformer`
- Validated against a closed set of known property names (unknown names throw `TypeError`)
- Queryable at runtime: `protocol.requiredOps.get('combine').properties`
- Properties are inherited through `[extend]` — a child protocol inherits parent operation properties, and may add new ones (but not remove them)

### Level 2: Testable Law Specifications

Each named property expands to a concrete testable predicate from a standard catalog. These predicates require an `Eq` protocol for structural equality:

| Property | Generated law (pseudocode) |
|---|---|
| `associative` | `f(f(a, b), c) ≡ f(a, f(b, c))` |
| `commutative` | `f(a, b) ≡ f(b, a)` |
| `idempotent` | `f(a, a) ≡ a` |
| `identity` | `f(a, e) ≡ a ∧ f(e, a) ≡ a` |
| `absorbing` | `f(a, z) ≡ z ∧ f(z, a) ≡ z` |
| `involutory` | `f(f(a)) ≡ a` |
| `reflexive` | `R(a, a)` |
| `antisymmetric` | `R(a, b) ∧ R(b, a) → a ≡ b` |
| `transitive` | `R(a, b) ∧ R(b, c) → R(a, c)` |
| `total` | `R(a, b) ∨ R(b, a)` |
| `symmetric` | `R(a, b) → R(b, a)` |

**Implementation scope:**

- A `lawsFor(propertyName)` function that returns a predicate given an operation and sample values
- Integration with a property-based testing harness (QuickCheck-style): given generators for the ADT, automatically test all declared laws
- Optional runtime law assertions (gated behind a configuration flag to avoid performance overhead in production)

### Property Vocabulary

The property vocabulary is a closed, curated set. Properties are organized by what they describe:

**Binary operation properties** (apply to fold specs with `in: Family, out: Family`):

| Property | Arity | Law |
|---|---|---|
| `associative` | binary | `f(f(a,b), c) ≡ f(a, f(b,c))` |
| `commutative` | binary | `f(a, b) ≡ f(b, a)` |
| `idempotent` | binary | `f(a, a) ≡ a` |
| `identity` | binary + Identity | `f(a, e) ≡ a ∧ f(e, a) ≡ a` |
| `absorbing` | binary + Zero | `f(a, z) ≡ z ∧ f(z, a) ≡ z` |
| `distributive` | pair of ops | `f(a, g(b,c)) ≡ g(f(a,b), f(a,c))` |

**Unary operation properties** (apply to map specs or unary folds):

| Property | Law |
|---|---|
| `involutory` | `f(f(a)) ≡ a` |
| `idempotent` | `f(f(a)) ≡ f(a)` |

**Relation properties** (apply to binary predicates / comparison operations):

| Property | Law |
|---|---|
| `reflexive` | `R(a, a)` |
| `symmetric` | `R(a, b) → R(b, a)` |
| `antisymmetric` | `R(a, b) ∧ R(b, a) → a ≡ b` |
| `transitive` | `R(a, b) ∧ R(b, c) → R(a, c)` |
| `total` | `R(a, b) ∨ R(b, a)` |

**Functor/natural transformation properties** (apply to map specs):

| Property | Law |
|---|---|
| `identity` | `fmap(id) ≡ id` |
| `composition` | `fmap(g ∘ f) ≡ fmap(g) ∘ fmap(f)` |

### Interaction with Existing Systems

**Contracts:** Properties generate `ensures`-like predicates that compose with user-written contracts via the existing AND-composition rule. A protocol declaring `[properties]: ['associative']` and a user `ensures` on the conforming operation both hold.

**`[extend]` (subtyping/subcontracting):** Properties are inherited. A child protocol cannot remove a parent's properties (that would violate LSP). A child may add new properties — e.g., `CommutativeMonoid` extends `Monoid` by adding `commutative` to `combine`.

**`merge` (deforestation):** Properties inform the merge system's fusion decisions. See the Optimization section below.

**`relation().closure()`:** Transitivity is already exploited structurally. With explicit `[properties]: ['transitive']`, the system could generalize this to user-defined relations.

## Optimization Opportunities

Declarative properties enable the system to apply known algebraic identities without inspecting implementations:

### Fold Parallelization

**Requires:** `associative` on the combining operation.

Today, `fold` on a `List` is inherently sequential. If the system knows `combine` is associative:

```text
Sequential (current):  combine(combine(combine(e, a), b), c)
Parallel (with assoc): combine(combine(e, a), combine(b, c))
```

Tree-shaped evaluation enables parallel reduction — critical for large data structures.

If additionally `commutative`, the partition order is irrelevant (MapReduce-style unordered reduction).

### Identity Elimination

**Requires:** `identity` + corresponding Identity unfold.

`combine(x, Identity) ≡ x` — the system can skip the call entirely, eliminating dead code in folds over structures with many identity elements.

### Short-Circuit Evaluation (Absorption)

**Requires:** `absorbing` + corresponding Zero unfold.

`combine(x, Zero) ≡ Zero` — when an absorbing element is encountered during a fold, the entire remaining traversal can be skipped.

### Map Fusion

**Requires:** Functor `composition` property.

`map f . map g ≡ map (f . g)` — consecutive map operations fuse into a single traversal. The existing merge system already handles this for explicit `merge('map1', 'map2')` pipelines. With properties, this could fire automatically for ad-hoc `instance.map1.map2` chains.

### Map-Fold Fusion

**Requires:** Functor + Foldable naturality.

`fold f . fmap g ≡ fold (f . g)` — a map followed by a fold fuses into a modified fold. Again, `merge` handles the explicit case; properties enable the implicit case.

### Automatic Hylomorphism Detection

**Requires:** Knowledge that unfold followed by fold on the same ADT is fusible.

When `ADT.Unfold(seed).foldOp` is detected at runtime, and properties confirm the composition is safe, the system can apply deforestation without an explicit `merge` declaration. `merge` remains valuable for naming the fused operation as a first-class API entry.

### Relation Closure Optimization

**Requires:** Properties on the composition operation.

- `commutative` composition → parallelize delta computation in semi-naive fixpoint
- `idempotent` composition → suppress duplicate fact generation earlier
- Semiring structure → use matrix multiplication for closure (Warshall/Floyd)

### Deduplication and Memoization

**Requires:** `idempotent`.

`combine(a, a) ≡ a` — repeated application can be skipped. Useful in fixpoint computations and stream processing.

### Double-Application Elimination

**Requires:** `involutory`.

`f(f(x)) ≡ x` — two consecutive applications of an involutory operation cancel out. In a merge pipeline, `merge('negate', 'negate', 'fold1')` simplifies to `merge('fold1')`.

## Summary of Implicit vs Explicit Fusion

With properties, `merge` becomes a convenience for naming rather than the only fusion mechanism:

| Scenario | Mechanism |
|---|---|
| Named fused operation on the API | `merge(...)` (explicit, as today) |
| Ad-hoc `instance.map1.map2` | Auto-fused if Functor composition property known |
| Ad-hoc `instance.mapOp.foldOp` | Auto-fused if Functor + Foldable naturality known |
| Ad-hoc `ADT.Unfold(seed).foldOp` | Auto-fused into hylomorphism if properties known |
| Sequential identical involutory maps | Eliminated (identity) |

## Implementation Phases

### Phase 1: Metadata Only

- Export `properties` symbol from `operations.mts`
- Accept `[properties]` on protocol spec objects (fold/unfold/map)
- Validate against the closed property vocabulary
- Store on `ProtocolOpSpec.properties` as `Set<string>`
- Store on `Transformer.properties` as `Set<string>`
- Inherit through `[extend]` (union, no removal)
- Expose via `protocol.requiredOps.get(name).properties`
- No runtime behavioral changes — purely informational

### Phase 2: Law Generation and Testing

- Implement `lawsFor(propertyName, operation)` returning testable predicates
- Requires `Eq` protocol for structural equality comparison
- Integrate with a property-based testing harness
- Optional runtime law assertions (development mode)

### Phase 3: Optimization Exploitation

- Fold parallelization for associative operations
- Identity/absorbing element elimination
- Automatic map fusion (beyond explicit merge)
- Automatic hylomorphism detection
- Relation closure optimization based on algebraic structure

## Open Questions

1. **`distributive` syntax:** Distributivity relates *two* operations (`f` distributes over `g`). How should this be expressed? Options:
   - `[properties]: ['distributive:combine']` — namespaced reference
   - A separate `[distributes]` symbol: `[distributes]: { over: 'combine' }`
   - Distributivity as a protocol-level annotation rather than per-operation

2. **Equality semantics:** Law checking requires `≡`. Should this be:
   - Structural equality (auto-derived for ADTs by comparing constructor + fields)
   - Protocol-based equality (`Eq` protocol with user-defined `equals`)
   - Both (structural by default, overridable via `Eq`)

3. **Conditional properties:** Can properties be conditional on type parameters? E.g., `List(T).combine` is commutative only when `T.combine` is commutative. This parallels conditional conformance (`[satisfies]: [Ordered({ T: Ordered })]`).

4. **Runtime vs compile-time:** In the JS embedding, properties are metadata exploited at `.ops()` time (definition-time optimization). In a future Lapis compiler, they become input to an optimization pass. Should the design anticipate the compiler use case?

5. **User-defined properties:** Should the vocabulary be extensible, or strictly closed? A closed set is simpler and enables the system to know exactly what each property means. An open set allows domain-specific laws but sacrifices optimization guarantees.

## References

- Bird, R. & de Moor, O. (1997). *Algebra of Programming*. Prentice Hall.
- Meijer, E., Fokkinga, M., & Paterson, R. (1991). "Functional Programming with Bananas, Lenses, Envelopes and Barbed Wire."
- Wadler, P. (1989). "Theorems for Free!" — Free theorems and parametricity.
- Claessen, K. & Hughes, J. (2000). "QuickCheck: A Lightweight Tool for Random Testing of Haskell Programs."
- Hinze, R. (2012). "Adjoint Folds and Unfolds — An Extended Study."
- Dolan, S. (2013). "Fun with Semirings." — Semiring-based optimization for closures.
