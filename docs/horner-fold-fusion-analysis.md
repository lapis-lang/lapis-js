# Horner Fold-Fusion: Current State and Path to Single-Traversal Implementation

## Summary

The `distributive:outerOp` property annotation on a fold operation currently provides two things:

1. **Law validation** — at `.ops()` time, Lapis verifies via generated samples that the inner fold genuinely distributes over the named outer fold, throwing `LawError` if not.
2. **Pipeline unlocking** — `merge` ordinarily rejects pipelines containing more than one fold. Declaring `distributive:outerOp` on the inner fold (whose `out:` must be a `family` reference) bypasses this guard, allowing `merge('innerFold', 'outerFold')` to be declared.

What it does **not** currently do is fuse the two folds into a single traversal. At runtime, `merge('innerFold', 'outerFold')` resolves to a `hornerFold` plan step that runs `innerFold(args)` first — fully traversing the structure and producing a new intermediate ADT instance — and then immediately runs `outerFold()` on that result. This is a second full traversal. The intermediate structure is fully allocated between the two passes.

This is algebraically equivalent to `instance.innerFold(args).outerFold()` and carries the same cost: two O(n) traversals and O(n) intermediate allocation. The annotation's present-day value is purely semantic (validated distributivity) and structural (unlocked multi-fold merge).

---

## Why Single-Traversal Fusion Is Blocked

The `foldr/build` shortcut fusion rule from the BMF/Haskell tradition states:

```
foldr f z (build g) = g f z
```

The key insight is that `build g` never constructs a list at all — `g` is a function that receives the `cons` and `nil` continuations of the consumer fold and drives them directly, so the intermediate structure is never materialized.

For this to work in Lapis JS, the inner fold's handlers would need to be parameterized over the outer fold's algebra. Concretely, the inner `scaleEach` for `merge('scaleEach', 'sum')` would need to produce something equivalent to:

```ts
// Fused: no intermediate list
Cons({ head, tail }, x) {
    return head * x + tail(x);  // directly applies sum's Cons algebra
}
```

instead of:

```ts
// Current: builds an intermediate list
Cons({ head, tail }, x) {
    return family.Cons({ head: head * x, tail: tail(x) });
}
```

There are three interlocking reasons the current architecture cannot do this:

### 1. Handler bodies are opaque JS closures

Fold handlers are plain TypeScript functions. Once compiled, the runtime cannot inspect their bodies to detect that `family.Cons(...)` is being called, let alone replace those calls with the outer fold's handlers. The handlers are stored in `HandlerMapSymbol` on the transformer as a `Record<string, HandlerFn>` — a map of opaque function references.

### 2. `family` references are closed over at declaration time

The `family` proxy (passed in the `.ops()` context) is captured as a closure variable when the handler is written. `family.Cons` is not a symbolic reference the system tracks — it is resolved to a concrete constructor call at the time the handler closure is created. There is no hook to intercept or redirect it when building a fused plan.

### 3. Recursive field thunks are bound to the specific `foldImpl`

In the fold machinery, recursive family fields (`tail` in a `Cons`) are wired to call the specific `foldImpl` closure for the operation being folded. For map-fold fusion (which is already implemented), this is possible because the map's atom transforms operate on non-recursive fields and can be applied before the fold's field-access phase via the `_currentMapFoldPreTransform` module-level variable. Fold-fold fusion would require a fundamentally different mechanism: the recursive field thunks of the inner fold would need to invoke the outer fold's algebra, not their own.

---

## The Path to True Fusion: Issue #183

Issue #183 proposes making operation handler bodies **first-class inspectable expression trees** rather than opaque functions. Under that model, a handler body would be a data structure the system can walk, transform, and rewrite at `.ops()` time — not a compiled JS closure. 

If that foundation exists, single-traversal Horner fusion becomes tractable:

1. At `merge('innerFold', 'outerFold')` time, walk the inner fold's handler ASTs.
2. For each occurrence of a `family.Ctor(fields)` constructor call in the inner handlers, substitute the corresponding outer fold handler's body, with the inner handler's computed fields substituted into the outer handler's context.
3. Register the resulting inlined algebra as the fused operation — a single `foldImpl` that traverses the structure once and produces the outer fold's result type directly.

This is exactly the `foldr/build` shortcut fusion, expressed at the DSL level.

### Dependency chain

```
Issue #183 (inspectable expression trees)
    └── Fold-fold fusion transformation pass (new work, built on #183)
            └── Single-traversal Horner merge (the optimization currently documented as "sequential")
```

Issue #183 is **necessary but not sufficient**. After it lands, a separate fusion pass must be implemented that:
- Detects `distributive:outerOp` on the inner fold
- Walks the inner fold's handler ASTs
- Substitutes outer-fold-handler continuations for every `family.Ctor(...)` node
- Produces a new, fused `foldImpl` registered under the merge operation name

### Narrower alternative (no #183 required)

A narrower path exists that does not require full expression trees: a new `build`-style fold variant where handlers receive an explicit algebra object `{ Cons: (fields) => acc, Nil: () => acc }` as an extra parameter instead of calling `family.Cons(...)` directly.

```ts
scaleEach: buildFold({
    in: Number,
    out: family,
    properties: ['distributive:sum']
})({
    Nil(_ctx, _x, { Nil: kNil }) { return kNil(); },
    Cons({ head, tail }, x, { Cons: kCons }) {
        return kCons({ head: head * x, tailAcc: tail(x) });
    }
})
```

At `merge('scaleEach', 'sum')` time, the runtime could substitute `sum`'s case handlers for `kCons`/`kNil`, producing a fused single-pass fold without needing to inspect arbitrary handler bodies. This is a **breaking API change** relative to the current `fold` interface and would require a new operation primitive (`buildFold` or similar).

---

## Current Recommendation

- Keep `distributive:outerOp` as-is for law validation and pipeline unlocking — both are genuinely useful.
- Track the single-traversal fusion gap as a follow-on to issue #183.
- The README note accurately describes the current runtime behaviour.
