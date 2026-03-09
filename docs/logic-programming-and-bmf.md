# Logic Programming in Lapis: Datalog, coLP, and the Bialgebraic Connection

## Overview

This document explores how logic programming (Datalog, Prolog, coinductive logic programming) relates to Lapis's bialgebraic foundation (BMF, fold/unfold duality) and how it might be integrated into the language. The central thesis is that logic programming is not orthogonal to BMF — it maps directly onto the existing duality between data (initial algebras) and behavior (final coalgebras).

## The Core Observation

BMF and logic programming address different questions about programs:

| | BMF (Algebra of Programming) | Logic Programming |
| --- | --- | --- |
| **Question** | *How* do I compute it efficiently? | *What* must hold / what can I find? |
| **Method** | Derive implementations via algebraic laws | State constraints and let the engine resolve |
| **Programs are** | Derived from specifications | Specifications that the engine resolves |

These appear irreconcilable: one derives implementations, the other searches for solutions. But there is a deep structural bridge through fixpoint theory and categorical duality.

## Constraint Satisfaction via Relational Specification

Before examining the duality bridge, it's worth noting how BMF approaches constraint satisfaction problems (CSPs) — the bread and butter of logic programming — without any search or backtracking at all.

The BMF methodology for CSPs follows a three-step pattern:

1. **Specify all candidates** — define the full space of possible solutions (e.g., all possible Sudoku grids)
2. **Filter by constraints** — apply predicates that characterize valid solutions
3. **Derive an efficient program** — use algebraic laws (fusion, promotion, deforestation) to transform the naive spec into something tractable

In BMF notation, a CSP is simply:

```text
solutions = filter isValid candidates
```

This is a relational comprehension: `{ x | x ∈ A, P(x) }`. The key insight is that you never *execute* this specification naively. Instead, you *derive* an efficient program from it using algebraic identities:

- **Distributivity** of `filter` over `map` or `fold`
- **Promotion laws** to move computation outside recursion
- **Fusion** to eliminate intermediate structures
- **Divide-and-conquer** to build up valid partial solutions incrementally

For example, N-Queens in BMF style:

```text
positions n = filter safe (permutations [1..n])
safe qs = and [ abs(i - j) /= abs(qs!!i - qs!!j) | i <- [0..n], j <- [i+1..n] ]
```

This is purely algebraic: a CSP solved by enumeration + filtering. BMF then encourages transforming this into a derived program that avoids full permutation generation — replacing `product ∘ filter` with a fused generator that prunes invalid branches incrementally.

Another example — Sudoku in BMF style:

```haskell
solve :: Board -> [Board]
solve board = filter isValid (candidates board)

candidates :: Board -> [Board]
candidates = unfold fillEmptyCell

isValid :: Board -> Bool
isValid b = all distinct (rows b)
         && all distinct (columns b)
         && all distinct (blocks b)
```

This is the same `filter isValid ∘ unfold` pattern. The naive version generates all possible board completions and filters — obviously infeasible for a 9×9 grid. The BMF approach is to *derive* an efficient solver via algebraic laws: fuse `filter` into `unfold` so that invalid partial assignments are pruned during generation, not after.

**Connection to Lapis:** This "specify then derive" pattern maps directly onto Lapis's existing operations:

- The candidate space is an **unfold** (generate all possibilities from a seed)
- The constraint filter is a **fold** (consume and select)
- The derived efficient version is a **merge** (hylomorphism — deforestation eliminates the intermediate structure)

This means CSP solving in Lapis is a hylomorphism: `merge('generateCandidates', 'filterValid')`, and the merge machinery handles deforestation automatically.

## The Duality Bridge

### Datalog IS a Fold (Catamorphism over a Lattice)

A Datalog program computes the **least fixpoint** of a monotone operator over a set of relations. Bottom-up evaluation proceeds:

1. Start from base facts (the "leaves")
2. Apply rules to derive new facts
3. Repeat until closure (no new facts derived)

This is exactly a **fold (catamorphism)** over the lattice of relation instances. The base facts are the initial algebra's constructors, and rule application is the fold's handler.

Semi-naive evaluation — where only newly derived facts are processed — is an *incremental fold*, analogous to how Lapis's fold mechanism traverses only the structure that exists.

| Datalog Concept | BMF Equivalent |
| --- | --- |
| Base facts | Data constructors (leaves) |
| Rules | Fold handlers |
| Least fixpoint (closure) | Catamorphism result |
| Stratification | Fold ordering (which rules apply first) |
| Semi-naive evaluation | Incremental fold (only new structure) |

A crucial property: Datalog is **monotonic** — once a fact is derived, it remains true regardless of what other facts are added. This is exactly the property of initial algebras (μ): you can only construct, never retract. Adding more constructors (base facts) can only grow the fixpoint, never shrink it. This monotonicity is what guarantees termination: the lattice of facts is finite, and each iteration can only add to it.

**Stratified negation** — Datalog's mechanism for limited negation — has a clean BMF reading: each stratum is a separate fold that takes the *completed* fixpoint of the previous stratum as input. The strata form a pipeline of folds: `fold₃ ∘ fold₂ ∘ fold₁`, where negation is only permitted between strata (never within a single fixpoint computation). This preserves monotonicity within each layer while allowing non-monotonic reasoning across layers.

### Prolog's SLD Resolution IS an Unfold (Anamorphism)

Top-down Prolog resolution starts from a query (the "seed") and generates a search tree:

1. Start from the query (seed)
2. Unify with rule heads to produce subgoals (branching)
3. Each branch produces further subgoals (coinductive observation)
4. The tree is potentially infinite

This is exactly an **unfold (anamorphism)** — generating a structure (the search tree) from a seed (the query). The search tree is a *coinductive* structure: potentially infinite, observed lazily.

| Prolog Concept | BMF Equivalent |
| --- | --- |
| Query | Unfold seed |
| SLD resolution step | Unfold handler (seed → branches) |
| Search tree | Behavior (coinductive structure) |
| Backtracking | Trying a different branch / rescue+retry |
| Solution | Fold over the search tree (collect results) |

Unlike Datalog, Prolog is **non-monotonic**: `assert` and `retract` can add or remove facts at runtime, potentially invalidating previously derived conclusions. This is the coalgebraic (ν) side of the duality — observations of a behavior can change over time as state evolves. Lapis's `behavior()` captures this: a behavior's observations are computed on-demand and can vary depending on when they're observed.

**Negation as failure** also has a direct BMF reading: when all branches of the search tree (anamorphism) are exhausted without finding a proof, the query is assumed false. In coalgebraic terms, negation as failure = an observation that yields `false` when the unfold produces no further structure. This is the closed-world assumption expressed as coalgebraic finality: if the behavior has no observation for a query, the answer is negative.

### Coinductive Logic Programming (coLP) IS Behavior Observation

Standard Prolog requires proofs to be finite (inductive). Coinductive logic programming (coLP) extends this to *greatest fixpoints* — infinite proofs are valid as long as they are *productive* (always producing more observations).

This maps directly to Lapis's behavior types:

- Behavior is the **greatest fixpoint** (final coalgebra, νF)
- Observations are always available (productive)
- You never "reach the bottom" — you just observe as much as you need
- Termination is replaced by *productivity* (each observation step produces something)

### The Complete Mapping

```text
Data + Fold          ←→   Datalog         (bottom-up, least fixpoint, inductive, μF)
Behavior + Unfold    ←→   Prolog/coLP     (top-down, greatest fixpoint, coinductive, νF)
Hylomorphism (merge) ←→   Full resolution (unfold search tree → fold collect results)
```

| Property | Datalog (μ) | Prolog (ν) |
| --- | --- | --- |
| **Monotonicity** | Monotonic — facts only grow | Non-monotonic — assert/retract |
| **Negation** | Stratified (between fold layers) | Negation as failure (exhausted unfold) |
| **Termination** | Guaranteed (finite lattice) | Not guaranteed (infinite search tree) |
| **State** | Immutable facts | Mutable (dynamic assertions) |
| **Lapis analog** | `data()` — construct only | `behavior()` — observe, potentially varying |

### Temporal Datalog: The μ/ν Boundary

An interesting consequence of the μ/ν mapping emerges when considering **temporal Datalog** — Datalog extended with timestamp or validity-range annotations on facts:

```prolog
parent(john, mary, [2000, 2010]).
parent(john, paul, [2005, 2020]).

ancestor(X, Y, [T1, T2]) :-
    parent(X, Z, [T1, _]),
    ancestor(Z, Y, [_, T2]),
    overlap(T1, T2).
```

This is Datalog crossing the μ/ν boundary. The *structure* of facts remains μ (constructors with arguments), but their *semantics* becomes ν — "what is true now" is an observation that depends on when you ask. A temporal fact is not a static datum; it is a behavior indexed by time.

In Lapis terms, temporal Datalog doesn't require a special extension. Time-varying relations are simply **behaviors** from the start:

```js
// Static Datalog: data (μ) — parent is a fixed set of facts
const Parent = data(({ Self }) => ({
    Direct: { parent: Person, child: Person }
}))

// Temporal Datalog: behavior (ν) — parent is an observation indexed by time
const Parent = behavior(({ Self }) => ({
    query: { at: Time, out: Set }
}))

// "Who is John's child at time t?" is an observation, not a lookup
parent.query({ at: 2008 })  // → { mary, paul }
parent.query({ at: 2015 })  // → { paul }
```

This validates the duality: when Datalog practitioners need time-varying facts, they're implicitly reaching for coalgebras. Lapis's architecture already provides this — `behavior()` handles what temporal Datalog adds as a special case. The interval operations (overlap, contains, union) become demands/invariants on the behavior's observation contract.

### The Role of Lazy Evaluation

Lazy evaluation is not strictly *required* for BMF, but it is highly synergistic — and Lapis already provides it through behavior's Proxy-based lazy evaluation and memoized continuations.

Laziness matters for logic programming integration because:

1. **Infinite search spaces** — Prolog-style resolution generates potentially infinite search trees. Behavior's coinductive laziness means we can define `solutions = filter isValid candidates` over an infinite candidate space and only evaluate as much as needed (e.g., first solution, first N solutions).

2. **Deforestation without eagerness** — Fusion laws (map-map, filter-filter, map-fold) are easier to apply with laziness because intermediate structures can be avoided without worrying about evaluation order. Lapis's `merge` already provides this.

3. **Early pruning in CSPs** — When solving CSPs via `filter`, laziness avoids constructing the entire candidate set: `head (filter isValid candidates)` evaluates only enough candidates to find a solution. In an eager language, you'd build the entire candidate set before filtering — often infeasible.

Lapis behavior already provides all of this: observations are lazy (computed on-demand via Proxy), continuations (`Self`) are memoized, and fold operations on behavior terminate when the handler chooses not to recurse further. This infrastructure is directly reusable for logic programming.

### Reversibility and Allegories

BMF supports relational composition — if you define a relation `R :: A ↔ B`, then `R⁻¹ :: B ↔ A` is algebraically valid. However, computations are only reversible when the underlying maps are bijective (invertible).

| | Supports Inversion? | Mechanism |
| --- | --- | --- |
| BMF | Yes, for invertible relations | Algebraic (compute `R⁻¹`) |
| Prolog | Yes, broadly | Search (backtracking) |
| Datalog | No (monotonic, forward only) | N/A |

This connects to a deeper algebraic structure: **allegories** — categories where morphisms are relations with composition and inverse. If Lapis operations (particularly `map`) tracked invertibility, pipelines composed of invertible maps could be run in reverse:

```js
// Speculative: invertible map
const doubled: map({ out: Family, inverse: (x) => x / 2 })({ T: (x) => x * 2 });

// Forward: [1, 2, 3] → [2, 4, 6]
// Reverse: [2, 4, 6] → [1, 2, 3]  (via inverse)
```

Not all operations are invertible — `filter` discards information and is inherently irreversible; `fold` is typically many-to-one. But for the subset that is invertible, the algebraic framework supports bidirectional computation without search. This is a potential area where BMF provides reversibility that Datalog cannot, without requiring Prolog's search machinery.

**Practical implication:** Invertible maps could enable bidirectional data transformations (e.g., serialization/deserialization, encoding/decoding) as a single declaration rather than two separate operations.

## Combinator Datalog: Variables Are Syntactic Sugar

### The Key Observation

A standard Datalog rule uses logical variables:

```prolog
ancestor(X, Y) :- parent(X, Y).
ancestor(X, Y) :- parent(X, Z), ancestor(Z, Y).
```

But these variables are syntactic sugar for relational algebra operations. The same program in point-free form:

```text
ancestor = fix (λa. parent ∪ (parent ∘ a))
```

Or in purely combinatory form (no lambda either):

```text
ancestor = fix (union parent (compose parent))
```

Where:

- `∘` is relational composition (join on shared columns)
- `∪` is set union
- `fix` computes the least fixpoint

**This is µ-calculus notation:** `ancestor = μ a . parent ∪ (parent ∘ a)`. The `μ` here is exactly the `μ` that Lapis's `data()` computes — the least fixpoint of a functor.

### Datalog Programs ARE Data Type Definitions

The correspondence is direct:

| Combinator Datalog | Lapis `data()` |
| --- | --- |
| `μ a . F(a)` (least fixpoint) | `data(({ Self }) => F(Self))` |
| Union of clauses | Union of constructors |
| Recursive reference `a` | `Self` |
| Relational composition (join) | Shared field types + invariant |
| Base facts | Leaf constructors (no `Self`) |
| Derived rules | Recursive constructors (contain `Self`) |

The ancestor example maps directly:

```text
μ a . parent ∪ (parent ∘ a)
       ↓              ↓
    Direct         Transitive
```

```js
// ancestor = μ a . parent ∪ (parent ∘ a)
const Ancestor = data(({ Self }) => ({
    // parent — base facts (leaf constructor)
    Direct: { from: String, to: String },

    // parent ∘ ancestor — relational composition (recursive constructor)
    Transitive: { hop: Parent, rest: Self },
    //           hop.to === rest.from is the join condition

    [invariant](instance) {
        if (instance instanceof Ancestor.Transitive)
            return instance.hop.to === instance.rest.from;
        return true;
    }
}));
```

The constructors encode **proofs** (derivation trees). A `Direct('Tom', 'Bob')` is a proof that Tom is an ancestor of Bob via a direct parent link. A `Transitive(Direct('Tom', 'Bob'), Direct('Bob', 'Eve'))` is a proof that Tom is an ancestor of Eve via Bob.

### Querying IS Fold

Since derivations are data, queries are folds:

```js
const Ancestor = data(({ Self }) => ({
    Direct: { from: String, to: String },
    Transitive: { hop: Parent, rest: Self },

    // Query: extract the endpoints (from, to) of any derivation
    endpoints: fold({ out: Array })({
        Direct: ({ from, to }) => [from, to],
        Transitive: ({ hop, rest }) => [hop.from, rest[1]]  // compose: first.from, last.to
    }),

    // Query: is X an ancestor of Y?
    proves: fold({ in: { x: String, y: String }, out: Boolean })({
        Direct: ({ from, to }, { x, y }) => from === x && to === y,
        Transitive: ({ hop, rest }, args) =>
            hop.from === args.x && rest(args)  // recursive: check the rest
    }),

    // Query: depth of derivation
    depth: fold({ out: Number })({
        Direct: () => 1,
        Transitive: ({ hop, rest }) => 1 + rest
    })
}));
```

### Computing Closure IS Fixpoint Iteration

The remaining question is how to compute all derivable facts from base facts. The combinator form makes this clear — it's `fix` applied to the rule:

```text
fix (union parent (compose parent))
```

In Lapis, this could be expressed as an unfold that generates all derivation trees from a set of base facts, iterating until no new endpoints are discovered:

```js
// Speculative: compute closure from base facts
const allAncestors = Ancestor.closure(parentFacts);
// closure = fix (λa. parentFacts ∪ (parentFacts ∘ a))
// Implementation: Kleene iteration using unfold
//   1. Seed: Direct(f, t) for each (f, t) in parentFacts
//   2. Step: for each existing ancestor (a, b) and parent (b, c),
//            add Transitive(parent(a,b), ancestor(b,c))
//   3. Stop: no new endpoints discovered (fixpoint reached)
```

This is structurally a **hylomorphism (merge)**: unfold the rules to generate derivations → fold to collect the resulting relation. The merge machinery can deforest the intermediate derivation trees, going directly from "apply rules" to "set of (from, to) pairs".

### The Relational Combinators as Fold/Map/Merge

The combinator basis from the point-free Datalog maps to existing operations:

| Relational Combinator | Lapis BMF Operation |
| --- | --- |
| `∪` (union) | Constructors in a `data()` (sum type) |
| `∘` (composition / join) | Constructor with shared field type + invariant |
| `π` (projection) | `map` (select/transform fields) |
| `σ` (selection / filter) | `fold` with predicate |
| `fix` (least fixpoint) | `data()` itself (μ = initial algebra) + closure computation |
| `ρ` (renaming) | `map` (rename fields) |

This means the relational algebra that underlies Datalog is already expressible through Lapis's existing primitives. No new `relation()` constructor is strictly required — though one could serve as ergonomic sugar over this pattern.

### What This Means for Integration

The combinator perspective suggests two complementary approaches:

1. **Datalog (bottom-up, variable-free):** Express rules as data type definitions. Constructors = rule clauses. `Self` = recursive reference. Invariants enforce join conditions. Closure = fixpoint via hylomorphism. Querying = fold. **No logic variables needed** — the point-free style eliminates them entirely.

2. **Prolog (top-down, variable-free):** Express the *same* rules as behavior type definitions. Observers = goal alternatives. `Self` = coinductive recursion. Querying = unfold from a goal seed, lazily exploring the search tree. **No logic variables needed here either** — structural wiring replaces them.

This preserves the duality:

- **Datalog = data + fold** (μ, bottom-up, least fixpoint)
- **Prolog = behavior + unfold** (ν, top-down, greatest fixpoint)
- **Full resolution = merge** (hylomorphism, deforestation of search tree into results)

## Combinator Prolog: The ν-Dual

### Same Equation, Different Evaluation

The combinator Prolog conversation reveals something striking: the point-free relational equation is **identical** for both Datalog and Prolog:

```text
ancestor = fix (alt parent (seq parent ancestor))
```

Where:

- `alt` = disjunction (try one rule, or the other)
- `seq` = conjunction / relational composition (chain goals)
- `fix` = recursion

The **only** difference is evaluation strategy:

| | Combinator Form | Fixpoint | Evaluation | Lapis |
|---|---|---|---|---|
| Datalog | `μ a . parent ∪ (parent ∘ a)` | Least (μ) | Bottom-up | `data()` + `fold` |
| Prolog | `ν a . parent ∪ (parent ∘ a)` | Greatest (ν) | Top-down | `behavior()` + `unfold` |

This is exactly the μ/ν duality that Lapis is built on. The `data()`/`behavior()` distinction already captures it.

### Goal Combinators Map to Behavior Observers

In standard Prolog, operational meaning is:
1. Unify goal with rule head
2. Replace with rule body
3. Continue until facts are reached

Variables implement **dataflow wiring** — they route arguments between goals. In combinator Prolog, structural combinators (`dup`, `swap`, `assoc`) replace variables:

| Prolog Concept | Goal Combinator | Lapis Behavior Equivalent |
|---|---|---|
| Conjunction (`,`) | `seq : R(A,B) → R(B,C) → R(A,C)` | Chained observers (shared `Self` types) |
| Disjunction (`;`) | `alt : R(A,B) → R(A,B) → R(A,B)` | Alternative unfold branches |
| Relation call | Application | Observer access |
| Argument wiring | `dup`, `swap`, `assoc` | Constructor field routing |
| Recursion | `fix` | `Self` reference in `behavior()` |
| Backtracking | Trying next `alt` branch | Rescue/retry on unfold |
| Cut | Commit to one `alt` | Early return from unfold |

### Prolog Programs ARE Behavior Type Definitions

Just as combinator Datalog maps to `data()`, combinator Prolog maps to `behavior()`:

```text
ancestor = ν a . alt parent (seq parent a)
             ↓         ↓           ↓
         behavior    direct     transitive
```

```js
// ancestor = ν a . alt parent (seq parent a)
const AncestorSearch = behavior(({ Self }) => ({
    // Observers: what you can ask about a search state
    from: String,              // the "X" endpoint
    to: String,                // the "Y" endpoint
    proof: String,             // "direct" or "transitive"
    via: Self,                 // lazy: the sub-proof (coinductive)

    // alt — disjunction: two ways to prove ancestry
    //   clause 1: parent(X,Y)     — base case
    //   clause 2: seq parent a    — recursive case

    // Unfold the query into a lazy search tree
    Query: unfold({ in: { goal: String, facts: Array }, out: Self })({
        // For each fact matching goal, produce an observation
        from: (state) => state.currentPair[0],
        to: (state) => state.currentPair[1],
        proof: (state) => state.isDirect ? 'direct' : 'transitive',
        via: (state) => state.isDirect ? null : state.subgoalState,
    }),

    // Fold: collect solutions from the lazy search tree
    solutions: fold({ in: Number, out: Array })({
        _: ({ from, to, via }, n) =>
            n <= 0 ? []
            : via === null ? [[from, to]]
            : [[from, to], ...via.solutions(n - 1)]
    })
}));
```

The key difference from the `data()` encoding:
- `data()` (Datalog): constructors build **proof trees** bottom-up. You construct all Direct/Transitive instances until fixpoint.
- `behavior()` (Prolog): observers **explore** proof trees top-down. You unfold from a query, lazily generating only the branches you observe.

### Argument Routing Without Variables

In standard Prolog, variables wire arguments between goals:

```prolog
grandparent(X,Y) :- parent(X,Z), parent(Z,Y).
```

`Z` is the shared intermediate variable. In combinator form, this becomes pure relational composition — `seq parent parent` — where the "wiring" is implicit in the composition operator's type:

```text
seq : R(A,B) → R(B,C) → R(A,C)
```

The intermediate `B` is consumed by composition, exactly as `Z` is consumed by unification. In Lapis behavior, this becomes shared field types between chained observers:

```js
// grandparent = seq parent parent
const GrandparentSearch = behavior(({ Self }) => ({
    from: String,           // A
    to: String,             // C
    intermediate: String,   // B (the "wired" variable, now a named observer)

    Query: unfold({ in: { goal: String, facts: Array }, out: Self })({
        from: (state) => state.hop1.from,        // A
        intermediate: (state) => state.hop1.to,   // B = hop1.to = hop2.from
        to: (state) => state.hop2.to,             // C
    })
}));
```

The intermediate variable `Z` becomes a named observer `intermediate` — visible and queryable, rather than hidden in unification.

### The Warren Abstract Machine as Combinator Graph

The WAM (Warren Abstract Machine) — Prolog's standard execution engine — is an instruction-level implementation of SLD resolution with:
- Unification instructions
- Stack frames for choice points
- Backtracking via trail

A combinator Prolog replaces this with:
- **Relational algebra interpreter** (compose, union, project)
- **Continuation-passing search** (each `alt` generates continuations for backtracking)
- **Combinator reduction** (simplify the goal expression algebraically before searching)

In Lapis terms, the WAM becomes the `behavior()` unfold machinery:
- Choice points = alternative branches in `unfold`
- Stack frames = `Self` continuations (memoized by the Proxy)
- Trail (variable bindings) = observation state
- Backtracking = rescue/retry

### The μ-Calculus Connection

Both combinator Datalog and combinator Prolog correspond to the **positive fragment of the modal μ-calculus**:

```text
ancestor = μ a . parent ∪ (parent ∘ a)    — least fixpoint (Datalog)
ancestor = ν a . parent ∪ (parent ∘ a)    — greatest fixpoint (Prolog/coLP)
```

This is not a loose analogy — it's a precise correspondence:

| μ-calculus | Logic Programming | Lapis |
|---|---|---|
| `μ` (least fixpoint) | Datalog (finite derivation) | `data()` |
| `ν` (greatest fixpoint) | coLP (infinite/productive proof) | `behavior()` |
| `∪` (union) | Disjunction (`;`) / clause alternatives | Constructors / observer alternatives |
| `∘` (composition) | Conjunction (`,`) / goal chaining | Shared field types |
| Evaluation of `μ` | Bottom-up iteration (Kleene) | Fold (catamorphism) |
| Evaluation of `ν` | Top-down search (SLD) | Unfold (anamorphism) |

Both are fragments of the same calculus. Lapis's `data()`/`behavior()` distinction already captures exactly this `μ`/`ν` split. The combinator Prolog conversation confirms that no new fixpoint mechanisms are needed — just the proper use of the existing dual.

### Optimization via Algebraic Laws

Because Prolog rules become combinator expressions, algebraic laws apply directly:

- **Composition associativity:** `seq (seq a b) c = seq a (seq b c)` — reorder goal chains
- **Union distributivity:** `seq a (alt b c) = alt (seq a b) (seq a c)` — distribute joins over alternatives
- **Fixpoint fusion:** Combine nested fixpoints into a single pass

These are the same laws that BMF uses for optimization. In Lapis, they would manifest as:
- Constructor-time fusion on behavior definitions
- Merge optimization for hylomorphisms (unfold search → fold collect)
- Algebraic simplification of query pipelines

### Complete Combinator Basis

The conversation notes that approximately **6 operators** form a complete combinator basis for all Horn clauses:

```text
seq    : R(A,B) → R(B,C) → R(A,C)    — relational composition (conjunction)
alt    : R(A,B) → R(A,B) → R(A,B)    — union (disjunction)
id     : R(A,A)                        — identity relation
fix    : (R → R) → R                  — recursion (fixpoint)
dup    : A → (A,A)                     — copy argument
swap   : (A,B) → (B,A)                — reorder arguments
```

This connects three traditions: **SK combinatory logic** (variable elimination in λ-calculus), **relational algebra** (query languages), and **Prolog execution** (SLD resolution). All three are doing the same thing differently.

In Lapis, these map to:

| Combinator | Lapis |
|---|---|
| `seq` | Chained observers / shared field types between operations |
| `alt` | Multiple constructors (`data`) or alternative unfold branches (`behavior`) |
| `id` | Identity map |
| `fix` (μ) | `data(({ Self }) => ...)` |
| `fix` (ν) | `behavior(({ Self }) => ...)` |
| `dup` | Multiple uses of the same field in a handler |
| `swap` | Field reordering in `map` |

### Previous Speculative Approaches (Superseded)

The approaches below were drafted before the combinator Datalog insight. They remain for reference but are now secondary to the direct integration above.

#### Approach 1: Datalog as a Fold over Relations (Speculative)

Datalog programs are declarative specifications of what facts can be derived. In Lapis, this could be a specialized fold over a relation (set of tuples):

```js
// Speculative syntax — now superseded by combinator approach above
const Ancestry = relation(({ derives }) => ({
    // Base facts — analogous to data constructors
    parent: facts([
        ['Tom', 'Bob'],
        ['Bob', 'Ann'],
        ['Ann', 'Eve'],
    ]),

    // Derived relations — analogous to fold handlers
    ancestor: derives({
        // ancestor(X, Y) :- parent(X, Y).
        base: ({ X, Y }) => parent(X, Y),
        // ancestor(X, Y) :- parent(X, Z), ancestor(Z, Y).
        step: ({ X, Y, Z }) => parent(X, Z) && ancestor(Z, Y)
    }),

    // Queries — folds over derived relations
    isAncestor: fold({ in: { x: String, y: String }, out: Boolean })({
        _: (db, { x, y }) => db.ancestor.has(x, y)
    }),

    allDescendants: fold({ in: String, out: Array })({
        _: (db, person) => db.ancestor.filter(([_, desc]) => desc === person)
    })
}));

Ancestry.isAncestor({ x: 'Tom', y: 'Eve' })  // true
Ancestry.allDescendants('Tom')                  // ['Bob', 'Ann', 'Eve']
```

**Connection to contracts:** Integrity constraints in Datalog ("no person is their own ancestor") are *ensures* on the closure:

```js
ancestor: derives({
    // ... rules ...
    ensures: (db) => !db.ancestor.some(([x, y]) => x === y),  // integrity constraint
})
```

#### Approach 2: Prolog-style Search as Behavior (Still Relevant for Top-Down)

A Prolog query unfolds into a lazy search tree, consumed by fold. This approach remains relevant for top-down search with logic variables (`$`) — the dual of the combinator Datalog approach above:

```js
// Speculative syntax
const Solver = behavior(({ Self }) => ({
    // Observers: current search state
    goal: Object,           // current goal
    substitution: Object,   // current variable bindings
    isSolved: Boolean,      // all goals resolved?
    alternatives: Self,     // lazy: next branch (backtracking)

    // Unfold: generate search tree from query + rules
    Query: unfold({ in: { query: Object, rules: Array }, out: Self })({
        goal: (state) => state.currentGoal,
        substitution: (state) => state.bindings,
        isSolved: (state) => state.goals.length === 0,
        alternatives: (state) => {
            // SLD resolution: unify, substitute, try next rule
            return nextResolutionState(state);
        }
    }),

    // Fold: collect solutions (bounded observation of infinite tree)
    solutions: fold({ in: Number, out: Array })({
        _: ({ isSolved, substitution, alternatives }, n) =>
            n <= 0 ? []
            : isSolved ? [substitution, ...alternatives(n - 1)]
            : alternatives(n)
    }),

    // First solution only
    first: fold({ out: Object })({
        _: ({ isSolved, substitution, alternatives }) =>
            isSolved ? substitution : alternatives()
    })
}));
```

**Connection to contracts:** Rescue/retry IS backtracking:

```js
Query: unfold({
    in: { query: Object, rules: Array },
    out: Self,
    rescue: (self, error, [state], retry) => {
        // Unification failed — backtrack to next alternative
        if (state.alternatives.length > 0)
            retry({ ...state, rules: state.alternatives });
        // All alternatives exhausted — propagation (no more results)
    }
})({ ... })
```

#### Approach 3: Relations as a First-Class Dual Concept

This approach imagines an explicit `relation()` constructor — ergonomic sugar over the combinator pattern above:

```js
// A relation is both:
//   - Data: a finite set of known facts (initial algebra)
//   - Behavior: an infinite space of possible queries (final coalgebra)

const Graph = relation(({ Self, Node }) => ({
    // Data side: facts (constructors)
    edge: facts(Node, Node),         // edge(a, b) — finite set

    // Derivation rules (fold-like: computes closure)
    path: rules({
        base: (X, Y) => edge(X, Y),
        step: (X, Y) => edge(X, Z) && path(Z, Y)
    }),

    // Behavior side: queries (observers)
    reachable: { in: Node, out: Array },     // all nodes reachable from X
    connected: { in: { a: Node, b: Node }, out: Boolean },

    // Contracts
    demands: {
        reachable: (self, node) => self.edge.hasNode(node),
    },
    ensures: {
        path: (self) => /* transitivity holds */,
        connected: (self, _, result, { a, b }) =>
            result === true ? self.path.has(a, b) : !self.path.has(a, b)
    }
}));
```

## Where Contracts Complete the Picture

The contracts system (demands/ensures/rescue) maps cleanly onto logic programming concerns:

| Contract | Logic Programming Concern |
| --- | --- |
| **Demands** on query | Mode declarations — which arguments are bound vs free |
| **Ensures** on closure | Integrity constraints — properties of the derived relation |
| **Rescue + retry** | Backtracking — when a branch fails, try the next |
| **Invariant** | Relation schema — structural properties of tuples |
| **Checked mode** | Tabling / memoization toggle |

This means contracts aren't just compatible with logic programming — they *are* the correctness conditions that logic programming needs:

- Datalog integrity constraints = ensures on fold closures
- Prolog mode declarations = demands on queries
- Backtracking = rescue/retry
- Tabling (memoization) = checked mode optimization

### Constraint Propagation: The Practical Gap Contracts Fill

The most commonly cited advantage of Prolog/Datalog over BMF is **constraint propagation** — the ability to prune the search space by propagating partial information through constraints, rather than generating all candidates and filtering after the fact.

In Prolog, unification automatically propagates bindings: if you know `X = 3`, every clause involving `X` immediately narrows its search space. In a naive BMF `filter isValid (unfold candidates)`, the filter happens *after* generation — no propagation.

But this gap is exactly what contracts fill:

- **Demands on unfold steps** act as early pruning. If each step of the unfold (anamorphism) has a `demands` precondition, invalid partial states are rejected *during generation*, not after. This is constraint propagation expressed as Design by Contract.

- **Invariants on intermediate states** enforce consistency properties that must hold throughout the search. In Sudoku, "no duplicate in any row/column/block of the partial assignment" is an invariant on the unfold state — checked at each generation step.

- **Rescue/retry on unfold** handles constraint violations gracefully: when a demand fails mid-generation, rescue can skip that branch entirely (pruning) rather than generating the full candidate and discarding it.

```js
// Speculative: Sudoku unfold with constraint propagation via contracts
Solve: unfold({
    in: PartialBoard,
    out: Self,
    demands: (board) => board.isConsistent(),  // prune: reject inconsistent partials
    rescue: (self, error, [board], retry) => {
        // Constraint violation — skip this branch
        // (equivalent to Prolog's backtracking on constraint failure)
    }
})({
    // ... fill next empty cell with each possible digit
})
```

This means the "constraint propagation gap" between BMF and Prolog is closed by contracts:

- Prolog propagates via unification (automatic, implicit)
- Lapis propagates via demands/invariants on unfold (explicit, algebraically composable)

The explicit version is more verbose but enables algebraic reasoning about the pruning strategy — you can fuse, reorder, and optimize the constraint checks using the same BMF laws that optimize everything else.

## On Amb (McCarthy's Ambiguity Operator)

### What Amb Is

`amb(a, b, c)` returns one of its arguments nondeterministically, with the constraint that the overall computation must succeed. If a choice leads to failure, the system backtracks and tries another. Amb is the minimal primitive for nondeterministic search.

### Does the BMF Approach Subsume Amb?

**Almost entirely, yes.** Amb does three things:

1. **Generates alternatives** — this is an unfold (seed → branches)
2. **Tries one** — this is observation (accessing the first branch)
3. **Backtracks on failure** — this is rescue/retry

In Lapis terms:

```js
// amb(a, b, c) as behavior:
const Choice = behavior(({ Self, T }) => ({
    value: T,           // current choice
    remaining: Self(T), // other options (lazy)

    From: unfold({ in: Array, out: Self })({
        value: ([first]) => first,
        remaining: ([_, ...rest]) => rest.length > 0 ? rest : null
    }),

    // Pick first successful result
    pick: fold({
        in: Function,  // predicate
        out: T,
        rescue: (self, error, [pred], retry) => {
            // Current choice failed — try remaining
            // This IS amb's backtracking
        }
    })({
        _: ({ value, remaining }, pred) =>
            pred(value) ? value : remaining(pred)
    })
}));
```

### What Amb Adds Beyond This

The one thing Amb provides that the above doesn't capture naturally is **implicit propagation of nondeterminism through ordinary code**. In Amb-based systems, you write:

```scheme
(let ((x (amb 1 2 3))
      (y (amb 4 5 6)))
  (assert (= (+ x y) 7))
  (list x y))
;; => (1 6), (2 5), (3 4)
```

The nondeterminism *infects* the surrounding computation transparently — you write code as if `x` and `y` have definite values, and the system explores all combinations.

In BMF, this would require the computation itself to be a fold over the search space — you'd need to explicitly structure the exploration:

```js
// BMF version: the search space is explicit
const pairs = CartesianProduct.From([1,2,3], [4,5,6])  // unfold
    .filter(([x, y]) => x + y === 7)                    // fold with predicate
    .toArray;                                            // [1,6], [2,5], [3,4]
```

This is more explicit but arguably **clearer** — the search space is visible, the filter is a named operation, and deforestation can optimize it. Amb hides the search structure, which makes reasoning about performance and termination harder.

### Verdict on Amb

Amb is **subsumed** for practical purposes:

| Amb Feature | Lapis BMF Equivalent |
| --- | --- |
| Generate alternatives | Unfold (anamorphism from seed) |
| Try one choice | Observation (head of behavior) |
| Backtrack on failure | Rescue/retry |
| Explore all combinations | Hylomorphism (unfold search space → fold collect results) |
| Implicit nondeterminism | **Not subsumed** — requires explicit search space structure |

The "implicit nondeterminism" gap is debatable as a limitation vs a feature:

- **As limitation:** Amb lets you write straight-line code and get search for free
- **As feature:** BMF makes the search space explicit, enabling algebraic reasoning, deforestation, and clear performance characteristics

For a language emphasizing algebraic reasoning (BMF), making search explicit is philosophically consistent. Implicit nondeterminism is a convenience that trades away the ability to reason about the structure of search — exactly the kind of trade-off BMF avoids.

**If implicit Amb-style nondeterminism were desired in the future**, it could potentially be implemented as a *syntactic layer* that desugars into explicit BMF constructs — similar to how Haskell's list comprehension notation desugars into monadic bind. The algebra underneath would still be visible for optimization.

## Fusion as Constructor Normalization

A key implementation insight from algebraic reasoning: fusion laws should be applied **at construction time**, not as a separate optimization pass.

When composing operations (e.g., `map(f).map(g)`), the resulting structure should immediately normalize to `map(g ∘ f)` in the constructor — not produce an intermediate two-node chain that requires a later `.fuse()` call. This is "constructor normalization": algebraic simplification rules applied during building.

Core fusion laws relevant to Lapis:

| Law | Before | After |
| --- | --- | --- |
| Map-map fusion | `map(f).map(g)` | `map(g ∘ f)` |
| Filter-filter fusion | `filter(p).filter(q)` | `filter(x => p(x) && q(x))` |
| Map-fold fusion | `map(f).reduce(g, z)` | `reduce((acc, x) => g(acc, f(x)), z)` |
| FlatMap-map fusion | `flatMap(f).map(g)` | `flatMap(f ∘ g)` |

Lapis's `merge` operation already performs deforestation — eliminating intermediate data structures between unfold and fold. Constructor-time fusion would extend this principle to individual operation chains, ensuring that pipelines are always in normal form.

**Relevance to logic programming:** If Datalog rule application and Prolog resolution steps are expressed as fold/unfold chains, constructor-time fusion would automatically optimize query pipelines — combining multiple filter predicates, fusing map steps, etc. — without a separate query optimizer.

## ECMAScript 2025 Alignment

It's worth noting that the host language's evolution is converging toward BMF's combinators. ECMAScript 2025's iterator helper methods map directly to BMF operations:

| BMF Concept | ECMAScript 2025 Iterator Method |
| --- | --- |
| Map (homomorphism) | `Iterator.prototype.map()` |
| Filter (selection) | `Iterator.prototype.filter()` |
| Fold (reduction) | `Iterator.prototype.reduce()` |
| Take (prefix) | `Iterator.prototype.take()` |
| Drop (suffix) | `Iterator.prototype.drop()` |
| FlatMap (monadic bind) | `Iterator.prototype.flatMap()` |
| Lazy infinite lists | `function*` generators |
| Fusion / deforestation | Iterator chaining (lazy by default) |

The iterator protocol in JavaScript matches BMF's semantics better than eager arrays. Generators (`function*`) provide the laziness, and the new methods provide the combinators. This means:

1. **Lapis's behavior types** can leverage native iterator protocol for efficient lazy observation
2. **Logic programming queries** expressed as iterator chains get fusion for free from the engine
3. **The BMF-to-JavaScript mapping is increasingly natural** — what was once exotic functional programming is now standard JavaScript

This alignment suggests that integrating logic programming into Lapis JS is not just theoretically sound but practically ergonomic: the host language already speaks the right dialect.

## The Layered Architecture

The full picture of Lapis with all these features integrated:

```text
┌─────────────────────────────────────────────────────────┐
│  Logic Programming (Datalog / coLP / Search)            │
│  "What must hold / what can I find?"                    │
│  → Datalog = fold over relations (least fixpoint)       │
│  → Prolog  = unfold into search trees (greatest fixpt)  │
│  → Search  = hylomorphism (unfold → fold)               │
├─────────────────────────────────────────────────────────┤
│  Contracts (demands / ensures / rescue / invariant)     │
│  "What must be true before/after, and what if not?"     │
│  → Demands = mode declarations / preconditions          │
│  → Ensures = integrity constraints / postconditions     │
│  → Rescue  = backtracking / fault tolerance             │
├─────────────────────────────────────────────────────────┤
│  BMF Core (data / behavior / fold / unfold / merge)     │
│  "How to compute efficiently via algebraic derivation"  │
│  → Data    = initial algebra (μF) — finite, inductive   │
│  → Behavior = final coalgebra (νF) — infinite, coinduc. │
│  → Fold    = catamorphism (consume bottom-up)           │
│  → Unfold  = anamorphism (produce top-down)             │
│  → Merge   = hylomorphism (deforestation)               │
│  → Map     = functorial transformation                  │
│  → Extend  = subtyping with LSP                         │
└─────────────────────────────────────────────────────────┘
```

Each layer builds on the one below:

- BMF provides the computational primitives and algebraic laws
- Contracts provide correctness conditions and structured error handling
- Logic programming provides declarative specification languages

None of these layers compete. They address different questions about the same programs, and they compose because they respect the same fundamental duality (data/behavior, μ/ν, fold/unfold).

For a broader discussion of how this layered architecture positions Lapis within the evolution of programming language generations — and the aspirational path toward automated algebraic derivation — see [Language Generations](language-generations.md).

## Logic Variables: `_`, `$`, and Generators

The combinator approach above shows that logic variables can be **eliminated entirely** — both for Datalog (via data constructors) and Prolog (via behavior observers). However, variables remain useful as **ergonomic sugar** for cases where point-free wiring becomes unwieldy, particularly for complex multi-argument joins. This section explores how Lapis could support optional logic variables complementing the combinator approach.

**Prior art:** miniKanren (Friedman, Byrd, Kiselyov 2005) demonstrated that logic programming can be embedded in a functional host language using just a few primitives (`==`, `fresh`, `conde`, `run`). The `$` Proxy approach below is conceptually similar — providing logic variables as a thin layer over the host language — but leverages JavaScript Proxy and generators rather than Scheme continuations, and sits atop the combinator foundation rather than replacing it.

### `_` as Wildcard / Anonymous Variable

Lapis already uses `_` as a wildcard handler in fold and map operations:

```js
name: fold({ out: String })({
    _: () => 'unknown'   // matches any variant
})
```

In Prolog, `_` has the same semantics: the anonymous variable. It matches anything, its value is never bound, and multiple occurrences of `_` are independent (each is a fresh don't-care). The existing Lapis `_` already embodies this — it's the catch-all handler that fires regardless of which variant constructed the data.

This means `_` should remain as-is: the wildcard / anonymous variable in both pattern matching (current) and logic programming (future) contexts. No conflict.

### `$` Proxy for Named Logic Variables

For *named* logic variables — variables that can be bound, unified, and whose bindings propagate through a computation — we need something new. A `$` Proxy object is a natural fit:

```js
$.Person    // creates or accesses logic variable 'Person'
$.X         // creates or accesses logic variable 'X'
$.Uncle     // etc.
```

The `$` object would be a Proxy that lazily creates `LogicVar` instances on property access:

```js
const $ = new Proxy({}, {
    get(target, name) {
        if (!(name in target))
            target[name] = new LogicVar(name);
        return target[name];
    }
});
```

Each `LogicVar` tracks its binding state (bound vs unbound) and supports a `unify()` method that is a **generator** — the key insight from Yield Prolog.

### Yield Prolog: Generators as Logic Variables

[Yield Prolog](https://yieldprolog.sourceforge.net/) discovered that generators provide exactly the right semantics for logic variable binding and backtracking:

1. **Binding is scoped to iteration** — when a `for...of` loop iterates, the variable is bound; when the iteration ends, the binding is automatically undone
2. **Nesting `for...of` loops creates conjunction** (AND) — both conditions must hold
3. **Multiple `yield` points in a generator create disjunction** (OR) — alternative solutions
4. **The generator protocol handles backtracking automatically** — no explicit continuation management

The core primitive is a `UnifyingVariable` whose `unify()` method is a generator:

```js
class LogicVar {
    #name; #value; #isBound = false;

    constructor(name) { this.#name = name; }

    get value() {
        if (!this.#isBound) throw new Error(`Unbound: ${this.#name}`);
        return this.#value;
    }

    // Generator: bind, yield control, then unbind on return
    *unify(arg) {
        if (!this.#isBound) {
            this.#value = arg;
            this.#isBound = true;
            yield;              // ← the binding is live during this yield
            this.#isBound = false;  // ← automatic unbinding on resume/return
        } else if (this.#value === arg) {
            yield;              // ← already bound to same value: succeed
        }
        // else: bound to different value → generator ends → unification fails
    }
}
```

This is elegant because the generator protocol provides automatic backtracking:

- `yield` = succeed (binding is live for the caller's loop body)
- Generator return without yielding = fail (loop body never executes)
- Post-yield cleanup = automatic unbinding (backtracking)

### Prolog Rules as Generator Functions

With this primitive, Prolog-style rules become plain generator functions:

```js
// brother(Person, Brother) :-
//   Person = 'Hillary', (Brother = 'Tony' ; Brother = 'Hugh') ;
//   Person = 'Bill', Brother = 'Roger'.
function* brother(Person, Brother) {
    for (const _ of unify(Person, 'Hillary')) {
        yield* unify(Brother, 'Tony');      // Hillary → Tony
        yield* unify(Brother, 'Hugh');       // Hillary → Hugh
    }
    for (const _ of unify(Person, 'Bill')) {
        yield* unify(Brother, 'Roger');      // Bill → Roger
    }
}

// uncle(Person, Uncle) :- parent(Person, Parent), brother(Parent, Uncle).
function* uncle(Person, Uncle) {
    const Parent = new LogicVar('Parent');
    for (const _ of parent(Person, Parent)) {
        yield* brother(Parent, Uncle);       // join via shared variable
    }
}

// Query: all uncle relationships
const $ = makeLogicScope();
for (const _ of uncle($.Person, $.Uncle)) {
    console.log(`${$.Person.value} has uncle ${$.Uncle.value}`);
}
```

Notice the structural parallel: nested `for...of` = conjunction, sequential `yield*` = disjunction, shared variables between calls = join. This is exactly Prolog's resolution algorithm, expressed in plain JavaScript generators.

### The Python Comprehension Parallel

There's a striking syntactic parallel between Python set comprehensions and Prolog rules:

```python
edge = {(1,2), (2,3)}
path = set()
for i in range(10):
    path |= {(x,y) for x,y in edge}                              # path(x,y) :- edge(x,y).
    path |= {(x,z) for x,y in edge for y1, z in path if y == y1} # path(y,z) :- edge(x,y), path(y,z).
```

The generator/comprehension form reads almost identically to the Prolog rule. This works because:

- Comprehension variables (`x`, `y`, `z`) are implicitly universally quantified
- `for ... in` iterates over a relation (set of tuples)
- `if` acts as a filter / unification check
- Nested `for` clauses create joins
- The bounded `range(10)` loop achieves fixpoint iteration (semi-naive evaluation)

In JavaScript with generators, the same pattern applies. A Lapis-integrated version might look like:

```js
// Speculative: Datalog rules as generator comprehensions
const Graph = relation(({ Self }) => ({
    edge: facts([[1,2], [2,3], [3,4]]),

    // path(X,Y) :- edge(X,Y).
    // path(X,Z) :- edge(X,Y), path(Y,Z).
    path: derives(function*($) {
        for (const [x, y] of edge)                        // base: edge(X,Y)
            yield [x, y];
        for (const [x, y] of edge)                        // step: edge(X,Y),
            for (const [y1, z] of Self.path)              //        path(Y,Z)
                if (y === y1) yield [x, z];               //        where Y matches
    })
}));
```

### Integrating `$` with Lapis Operations

The `$` Proxy could integrate with existing Lapis operations in several ways:

**As fold/unfold parameters:**

```js
// Query: find all X where ancestor(X, 'Eve')
const results = Ancestry.query(function*($) {
    yield* ancestor($.X, 'Eve');
    return $.X.value;
});
// results: ['Tom', 'Bob', 'Ann']
```

**As pattern variables in fold handlers:**

```js
// $ variables in fold handlers act as match-and-bind
findParent: fold({ in: $, out: Array })({
    Node: function*({ name, children }, $) {
        for (const child of children)
            for (const _ of $.Target.unify(child.name))
                yield name;  // this node is a parent of Target
        yield* children.flatMap(c => c.findParent($));
    }
})
```

**As a scoping mechanism in `query()` or `solve()`:**

```js
// $ is created fresh per query — each query gets its own variable scope
const answers = Graph.solve($ => ({
    find: [$.X, $.Z],
    where: function*() {
        yield* edge($.X, $.Y);
        yield* path($.Y, $.Z);
    },
    demands: () => $.X.value !== $.Z.value  // no self-loops
}));
```

### `_` vs `$`: Complementary Roles

| Symbol | Role | Prolog Equivalent | Binding |
| --- | --- | --- | --- |
| `_` | Wildcard / catch-all | Anonymous variable `_` | Never bound |
| `$.X` | Named logic variable | Named variable `X` | Bound during unification, scoped to iteration |

`_` says "I don't care what this is." `$.X` says "I don't know what this is *yet*, but I need its value later." Both are needed, and they don't conflict because `_` is a handler key while `$` is a runtime Proxy.

### Why Generators Are the Right Mechanism

Generators provide exactly the control flow that logic programming needs, without any exotic runtime support:

| Logic Programming Need | Generator Feature |
| --- | --- |
| Choice points | `yield` (suspend and resume) |
| Backtracking | Generator return → cleanup → try next |
| Conjunction (AND) | Nested `for...of` loops |
| Disjunction (OR) | Sequential `yield*` calls |
| Cut (commit to choice) | `return` from generator (no more yields) |
| Variable scoping | Closure + automatic unbinding post-yield |
| Lazy enumeration | Generator protocol (pull-based, on-demand) |
| Composability | `yield*` delegation |

This is the same insight as ECMAScript 2025 alignment — the host language already has the primitives. Generators *are* the search monad, reified as a protocol.

## Key Questions for Investigation

1. **Concrete syntax:** The combinator Datalog insight shows that Datalog rules can be expressed as data type definitions (constructors = rule clauses, `Self` = fixpoint variable, invariants = join conditions). The main syntax question shifts from "how to express rules" to: should there be ergonomic sugar (e.g., a `relation()` wrapper) over the `data()` + invariant pattern, or is the direct `data()` encoding clear enough? How should base facts (ground tuples) be supplied to trigger closure computation?

2. **Unification as fold (with `$` variables):** Prolog requires a unification engine. Terms are data (an ADT of variables, constants, and compound terms). Unification computes a substitution that makes two terms equal — structurally a **fold over the term pair**. With the `$` Proxy and generators, unification could be expressed as a generator-based fold where `LogicVar.unify()` handles binding/unbinding automatically:

    ```js
    // Speculative: Term ADT with generator-based unification
    const Term = data(({ Family, Self }) => ({
        Var: { ref: LogicVar },       // $.X, $.Y — logic variables via $ Proxy
        Const: { value: Object },
        Compound: { functor: String, args: Array },

        // unify is a generator: yields on success, returns on failure
        unify: fold({ in: Family, out: GeneratorFunction })({
            Var: function*({ ref }, other) {
                yield* ref.unify(other);   // delegate to LogicVar.unify()
            },
            Const: function*({ value }, other) {
                if (other.tag === 'Const' && value === other.value)
                    yield;
                // else: no yield → unification fails
            },
            Compound: function*({ functor, args }, other) {
                if (other.tag === 'Compound' && functor === other.functor
                    && args.length === other.args.length) {
                    // Unify args pairwise — nested generators = conjunction
                    yield* unifyAll(args, other.args);
                }
            }
        })
    }));
    ```

3. **Tabling/memoization:** Datalog tabling prevents infinite loops in recursive rules. Lapis behavior already memoizes continuations (`Self` observers). Can the same memoization infrastructure serve both? The Proxy-based memoization on behavior observations looks structurally identical to Datalog's tabling — both cache previously computed results to avoid redundant work and infinite loops.

4. **Negation:** Stratified negation in Datalog requires careful ordering of rule application. How does this interact with fold ordering and the extension hierarchy? Could `[extend]` on relations naturally express stratification (base relation → first stratum → second stratum, each extending the previous)?

5. **Performance, fusion, and closure:** The combinator Datalog form `fix (union base (compose base))` translates to a hylomorphism: unfold rules to generate derivations → fold to collect the relation. Can Lapis's `merge` (which already fuses unfold+fold) serve as the fixpoint iterator? Semi-naive evaluation (only process newly derived facts) maps to incremental fold — can this be expressed as a refinement of the merge pattern? Constructor-time fusion (applying fusion laws in operation constructors rather than as a separate pass) could make query pipeline optimization automatic.

6. **Amb desugaring:** If implicit nondeterminism is desired, can it be a syntactic sugar that desugars into explicit unfold/fold/rescue constructs — similar to how Haskell's list comprehension notation desugars into monadic bind? The algebra underneath would still be visible for optimization. What are the expressive limitations of this desugaring?

7. **Invertibility and bidirectional transformations:** Can Lapis operations (particularly `map`) optionally track inverse functions, enabling bidirectional computation? This would allow a single declaration to express both serialization and deserialization, encoding and decoding, etc. — the subset of relational programming that doesn't require search. How does this interact with the allegory structure of relational composition?

8. **CSP derivation methodology:** Can the BMF "specify all candidates → filter by constraints → derive efficient program via fusion" methodology be packaged as a reusable pattern in Lapis? E.g., a `csp()` or `solve()` combinator that takes a candidate generator (unfold) and constraint predicates (filter/demands), and produces an optimized hylomorphism via merge?

9. **Combinator completeness:** The combinator basis `{union, compose, project, fix}` is sufficient for Datalog. In the Lapis encoding, these map to `{sum-of-constructors, shared-field+invariant, map, data()}`. Is this mapping provably complete — i.e., can every Datalog program be expressed as a `data()` definition? What about stratified negation, aggregation, or non-monotone extensions?

10. **Two-level typing for relations:** In the combinator form, relations are typed as `R : A ↔ B`. In Lapis, this is a data type with fields of type `A` and `B`. Could a type-level annotation (e.g., `{ from: Node, to: Node }` implying `Node ↔ Node`) make the relational typing explicit and enable the system to verify join conditions (composition only when types align) at definition time rather than via runtime invariants?

## References

- Bird, R. & de Moor, O. — *Algebra of Programming* (1997)
- Ceri, S., Gottlob, G., & Tanca, L. — *Logic Programming and Databases* (1990)
- Simon, L., Mallya, A., Bansal, A., & Gupta, G. — *Coinductive Logic Programming* (2007)
- Hinze, R. — *Functional Pearl: Streams and Unique Fixed Points* (2008)
- McCarthy, J. — *A Basis for a Mathematical Theory of Computation* (1963) — origin of Amb
- Gibbons, J. — *Origami Programming* (2003) — recursion schemes as program structure
- Yield Prolog — [Tutorial](https://yieldprolog.sourceforge.net/tutorial1.html) — generators as logic variables with automatic backtracking
- Tarski, A. — *On the Calculus of Relations* (1941) — relational algebra foundation
- Bird, R. & de Moor, O. — *Algebra of Programming* §10 (1997) — relational programming and allegories in BMF
- Friedman, D., Byrd, W., & Kiselyov, O. — *The Reasoned Schemer* (2005) — miniKanren, embedding logic programming in a functional host language
- Byrd, W. — *Relational Programming in miniKanren* (2009) — relational programming without committed choice
- Hemann, J. & Friedman, D. — *μKanren: A Minimal Functional Core for Relational Programming* (2013) — minimal LP kernel
