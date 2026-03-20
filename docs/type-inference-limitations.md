# Type Inference Limitations

This document records remaining TypeScript type inference limitations in
Lapis JS. These are edge cases with known workarounds that cannot be fully
resolved without TypeScript language changes.

---

## 1. Bounded Self Approximation (4-Level Depth)

**Current implementation:** `DataInstance<D>` uses a 4-level bounded
recursive approximation:

```text
_DataInstanceSelf0<D> → _DataInstanceSelf1<D> → _DataInstanceSelf2<D> → _DataInstanceSelf<D> → DataInstance<D>
```

**Cause:** TypeScript prohibits direct self-referencing type aliases
(TS2456). Conditional-type wrappers cause excessive depth (TS2589).
The bounded approximation provides 4 levels of correct `Self` threading
for operations that return `Family`/`Self` instances.

**Impact:** Operations that chain more than 4 levels of recursive self-
reference in their type signatures will bottom out at `unknown` for the
innermost Self parameter. In practice, 4 levels is sufficient for all
current operations (fold, unfold, map, merge).

**Resolution path:** TypeScript RFC for recursive type aliases, or use
interface-based recursion (which TS allows) if the type structure
permits it.

---

## 2. Parameterized Callback Types on ADT Results

**Pattern:**

```ts
baseFacts.forEach((f: any) => console.log(f.origin));
root.children.forEach((child: any) => { ... child.name ... });
```

**Cause:** Operations like `closure()`, fold results typed as `Array`,
and variant field arrays return `unknown[]` at the type level. Element
types are not propagated because fold/unfold output types map to
JavaScript constructors (`Array`, `Object`, `Number`, etc.) rather than
parameterised generics.

**Impact:** Low. Users must annotate callback parameters with `any` or
a specific interface type when iterating over ADT results.

**Workaround:** Annotate callback parameters explicitly:

```ts
// Explicit annotation
baseFacts.forEach((f: any) => console.log(f.origin));

// Or define an interface
interface AncestorFact {
    origin: string;
    destination: string;
}
baseFacts.forEach((f: AncestorFact) => console.log(f.origin));
```

**Potential fix:** Enhance `SpecValue<S, Self>` to produce parameterised
output types (e.g., `Array<VariantInstance<...>>` instead of `unknown[]`)
when the fold/unfold output is `Array` and the input declaration is known.
This would require teaching the type system to track element types through
constructor specs.

---

## Theoretical Background

The bounded self approximation limitation relates to how Lapis implements
recursive types using TypeScript's type system.

### Fixpoint Types: μ, ν, and Fix

Lapis's two core abstractions correspond to the two canonical fixpoint
types in category theory:

| Fixpoint | Symbol | Name               | Lapis construct | Carrier parameter |
|----------|--------|--------------------|-----------------|-------------------|
| Least    | μF     | Initial algebra    | `data()`        | `Family`          |
| Greatest | νF     | Final coalgebra    | `behavior()`    | `Self`            |

- **μF (Mu)** — the least fixpoint of a functor F. In Lapis, `data()`
  defines an initial algebra: a set of variant constructors closed under
  a fold (catamorphism). The `Family` parameter is the carrier of this
  algebra — it refers to "the ADT being defined" and can construct
  values of that ADT within fold handlers.

- **νF (Nu)** — the greatest fixpoint of a functor F. In Lapis,
  `behavior()` defines a final coalgebra: a set of observations closed
  under an unfold (anamorphism). The `Self` parameter is the carrier —
  it refers to "the behavior being defined" and appears as the
  continuation type in unfold handlers.

- **Fix** — the general fixpoint combinator, `Fix f = f (Fix f)`. Both
  `data()` and `behavior()` implement Fix for their respective
  polarities. The `Family`/`Self` parameters are the mechanism by which
  the fixed point is made available inside the defining expression,
  avoiding the need for the outer binding to be in scope during
  construction.

### CRTP / F-Bounded Quantification

The pattern of passing a self-reference parameter into the definition is
an instance of the **Curiously Recurring Template Pattern** (CRTP), or
equivalently **F-bounded quantification** from type theory:

```ts
class Derived : Base<Derived>       // C++ CRTP
class Derived extends Base[Derived] // Scala F-bounded
data(({ Family }) => ({ ... }))     // Lapis: Family ≈ Self type
behavior(({ Self }) => ({ ... }))   // Lapis: Self for coalgebras
```

The key insight: `Family` and `Self` are typed **independently** of the
declaration type `D`. `Family` is `FamilyRefCallable` and `Self` is
`SelfRefCallable` regardless of what variants or operations are declared.
This breaks the circular inference that occurs when the outer variable
(e.g., `SearchState`) is referenced inside its own initialiser — the
same way `Base<Derived>` in C++ defers resolution of the self-type until
after the class body is complete.
