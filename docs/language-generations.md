# Lapis and the Evolution of Programming Language Generations

## Overview

This document positions Lapis within the historical taxonomy of programming language "generations" and articulates an aspirational vision for what the next generation of programming looks like through the lens of algebraic program construction. The central claim: Lapis occupies a transitional position between 5GL (logic/constraint abstraction) and a hypothetical 6GL (construction abstraction), and its bialgebraic foundation provides a principled path toward the latter.

## The Generational Taxonomy

The standard taxonomy of programming language generations measures **what is abstracted away** from the programmer:

| Generation | Abstraction Target | Who Constructs |
| --- | --- | --- |
| **1GL** | Nothing (machine code) | Programmer + hardware |
| **2GL** | Opcodes (assembly) | Programmer |
| **3GL** | Control flow (C, Java, etc.) | Programmer |
| **4GL** | Domain operations (SQL, report languages) | Framework |
| **5GL** | Search/constraint resolution (Prolog, Datalog) | Solver |

Each generation shifts the *locus of construction* — the question of who (or what) decides how the program is actually built — further from the human programmer.

### Where BMF Fits

A language oriented around the Bird–Meertens Formalism (BMF) does not fit neatly into this taxonomy. It is declarative, but in a different axis than 5GL:

- **5GL (Prolog):** Declarative via **logical constraints and search**. The programmer states what must hold; the solver finds satisfying assignments.
- **BMF language:** Declarative via **algebraic laws and structural recursion**. The programmer specifies operations via universal constructions (fold/unfold); algebraic laws enable systematic derivation of efficient implementations.

The key distinction is *mechanism*:

| | 5GL | BMF |
| --- | --- | --- |
| **Specifications are** | Relations/constraints | Algebraic equations |
| **Resolution is** | Search (backtracking, unification) | Derivation (equational reasoning, fusion) |
| **Termination** | Not guaranteed (Prolog) / guaranteed (Datalog) | By construction (well-founded recursion) |
| **Efficiency** | Opaque to programmer (solver's problem) | Transparent (algebraic laws = optimization) |

BMF is arguably **post-5GL** — it abstracts *structure* rather than *search* — but orthogonal to the logic programming lineage. If we had to place it:

```text
3GL → control flow abstraction
4GL → domain abstraction
5GL → logic/constraint abstraction
BMF → algebraic/structural abstraction
```

## The 6GL Question

Extrapolating the generational trend, each generation abstracts more of the construction process:

| Generation | What's Explicit | What's Abstracted |
| --- | --- | --- |
| 3GL | Algorithm + data structures | Machine details |
| 4GL | Domain operations | Algorithm choice |
| 5GL | Constraints/relations | Search strategy |
| BMF | Algebraic specification | Implementation (via derivation) |
| **6GL?** | **Intent / properties** | **Construction itself** |

A genuine 6GL would shift from "programmer derives algebraically" to **"system derives implementation from specification"**. The programmer states *what* they want (properties, invariants, behavioral contracts); the system constructs a program satisfying those constraints.

### What Makes This Different from Requirements-Driven Development?

Requirements-structuring practices — Use Cases (Jacobson), Design by Contract (Meyer/Eiffel), Domain-Driven Design (Evans) — improve semantic alignment between stakeholders and code. But they remain within the current paradigm:

- The **programmer still implements** the behavior
- **Contracts are checked**, not synthesized from
- **Use cases guide** design; they do not generate it
- **DDD structures** models; it does not compute implementations from domain laws

This is 3GL/4GL with better upstream discipline — not a generational shift. The shift happens when:

1. Requirements are **formalized** (machine-checkable, not just human-readable)
2. They are **sufficient to derive** implementation
3. Derivation is **automated or semi-automated**
4. Refinement is **correctness-preserving by construction**

That is closer to refinement calculus, program synthesis, and proof-directed development.

## Lapis's Position: Bridging 5GL and 6GL

Lapis occupies a unique position. Through its bialgebraic foundation, it already provides several of the ingredients a 6GL would need:

### What Lapis Has Now (BMF Core)

| 6GL Ingredient | Lapis Mechanism |
| --- | --- |
| Programs as algebraic objects | Data (μF) and behavior (νF) as first-class constructions |
| Equational laws | Fold/unfold fusion, map composition, promotion laws |
| Structural recursion by construction | fold = catamorphism, unfold = anamorphism |
| Deforestation | merge = hylomorphism (intermediate structure elimination) |
| Correctness by construction | Universal properties guarantee uniqueness of morphisms |

The universality of fold and unfold is key: for a given functor F, there is *exactly one* catamorphism satisfying the fold equation and *exactly one* anamorphism satisfying the unfold equation (up to isomorphism). This means **specifications uniquely determine implementations** — the hallmark of what a 6GL would do automatically.

### What Contracts Add (The Missing Layer)

The [contracts backlog](backlog-contracts.md) proposes adding demands/ensures/rescue/invariant to Lapis. Through the lens of language generations, this is significant:

| Contract Feature | 6GL Reading |
| --- | --- |
| **Demands** (preconditions) | Formalized requirements on inputs |
| **Ensures** (postconditions) | Formalized requirements on outputs |
| **Invariant** | Algebraic laws that implementations must satisfy |
| **Rescue/retry** | Fault tolerance as a specification, not an implementation |

Contracts transform from "checked assertions" (the Meyer/Eiffel model) to **algebraic laws** in the BMF context. An invariant on a data type isn't just a runtime check — it's a property that the fold must preserve, the unfold must establish, and the map must respect. When the specification (contracts) and the construction mechanism (fold/unfold) are both algebraic, derivation becomes principled.

### What Logic Programming Adds (Search as Service)

The [logic programming investigation](logic-programming-and-bmf.md) shows that LP maps onto the existing μ/ν duality:

- Datalog = fold over relations (μF)
- Prolog = unfold into search trees (νF)
- Full resolution = hylomorphism

This means Lapis absorbs 5GL's "solver performs search" into its algebraic framework rather than leaving it as a separate paradigm. The solver isn't an opaque oracle — it's a fold or unfold with algebraic laws that can be reasoned about, optimized, and fused like any other morphism.

### The Three Layers Together

```text
┌─────────────────────────────────────────────────────────┐
│  Intent / Properties                                    │
│  "What I want" — invariants, contracts, behavioral spec │
│  → formalized, machine-checkable, algebraically rich    │
├─────────────────────────────────────────────────────────┤
│  Search / Resolution                                    │
│  "Find what satisfies" — LP as fold/unfold              │
│  → Datalog closure, Prolog search, constraint solving   │
│  → absorbed into BMF, not a separate paradigm           │
├─────────────────────────────────────────────────────────┤
│  Algebraic Derivation                                   │
│  "How to compute" — BMF Core                            │
│  → fold/unfold uniqueness, fusion, promotion, deforest. │
│  → specifications determine implementations             │
└─────────────────────────────────────────────────────────┘
```

This is the progression:
- **5GL:** State constraints → solver finds answers
- **Lapis (now):** State algebraic specification → programmer derives implementation via laws
- **Lapis (aspirational):** State properties/contracts → system derives implementation via algebraic laws + search

## The Algebraic Requirements Calculus

The most precise way to characterize Lapis's aspirational direction is as an **Algebraic Requirements Calculus** — where traditional software engineering concepts map onto algebraic structures:

| Traditional Concept | Algebraic Reading |
| --- | --- |
| **Use cases** | Temporal properties over streams (= behaviors, νF) |
| **Contracts** | Algebraic laws (= fold/unfold equations) |
| **DDD aggregates** | Initial algebras (data) or final coalgebras (behavior) |
| **Bounded contexts** | Functors between categories (natural transformations) |
| **Domain events** | Observations on behaviors (coalgebra) |
| **Commands** | Constructors on data (algebra) |
| **Queries** | Folds (catamorphisms) |
| **Projections / views** | Unfolds (anamorphisms) from query seeds |

When all of these are expressed algebraically, the gap between specification and implementation narrows to the point where **derivation can be automated**:

1. The programmer specifies a data type (DDD aggregate = initial algebra) with invariants (contracts = algebraic laws)
2. The universal property of fold guarantees a unique catamorphism for any well-typed handler
3. Fusion laws optimize the resulting composition pipeline
4. The system can *verify* that a given implementation satisfies the specification, and in some cases *synthesize* the implementation from the specification alone

### The CQRS/Event-Sourcing Connection

Event sourcing — where state is a fold over an event stream — is already a catamorphism:

```text
currentState = fold applyEvent initialState events
```

And CQRS — where reads (queries) are separated from writes (commands) — is exactly the data/behavior duality:

- **Commands** construct data (algebra, μF)
- **Queries** observe behavior (coalgebra, νF)
- **Projections** are folds from the event stream into query-optimized views

This isn't a metaphor. It's a theorem: event sourcing IS a catamorphism, CQRS IS the μ/ν split. Lapis's architecture already provides the formal foundation that CQRS/ES practitioners discovered empirically.

## The Hard Constraint

Honesty requires acknowledging the barrier to the 6GL vision:

> **Requirements are rarely algebraically complete.**

Most real systems are underspecified. Human programmers resolve ambiguity through context, experience, and stakeholder negotiation. A true 6GL would need:

- **Rich specification languages** — expressive enough to capture intent without being as verbose as implementation
- **Automated search or derivation** — filling in the gaps between specification and implementation
- **Cost models** — selecting among multiple correct implementations based on performance characteristics
- **Integration of proof and performance reasoning** — correctness is necessary but not sufficient; the derived program must also be practical

Lapis's current position is realistic about this: it provides the *algebraic framework* that makes derivation principled when specifications are complete, while remaining a practical programming tool when they're not. The fold/unfold calculus works whether derivation is manual (programmer applies laws) or automated (system applies laws) — the same laws apply either way.

### What Lapis-JS Explores

As an experimental playground, Lapis-JS tests specific hypotheses relevant to this trajectory:

1. **Can fold/unfold universality eliminate boilerplate?** — If the universal property uniquely determines the morphism, the programmer shouldn't need to write it manually. Lapis-JS tests whether this works in practice for real JS/TS programs.

2. **Do algebraic laws compose across the stack?** — Fusion, promotion, and deforestation must work not just in isolation but across compositions of folds, unfolds, maps, and merges. Lapis-JS is the testbed for whether these laws hold in a real runtime.

3. **Can contracts serve as specifications?** — The contracts backlog tests whether demands/ensures/invariant are sufficient to express the properties that derivation needs, without being so verbose that they defeat the purpose.

4. **Does the μ/ν duality subsume logic programming?** — The LP investigation tests whether Datalog/Prolog can be absorbed into the existing architecture rather than requiring a separate paradigm.

5. **Is the combinator basis complete?** — The 6-operator basis {seq, alt, id, fix, dup, swap} from the LP document must be sufficient to express all Horn clause programs. Lapis-JS tests this empirically.

Each of these is a concrete, testable question whose answer informs whether the broader 6GL aspiration is viable.

## The Generational Progression for Lapis

```text
5GL: Solve relations (Prolog/Datalog)
     → "State what must hold; solver finds answers"

Lapis (current): Algebraic program construction (BMF)
     → "State structure algebraically; derive implementations via laws"

Lapis + Contracts: Algebraic specification with correctness conditions
     → "State properties; laws guarantee correct derivation"

Lapis + LP: Algebraic specification with search
     → "State properties; search finds satisfying constructions"

Lapis (aspirational): Algebraic Requirements Calculus
     → "State intent as algebraic properties; system derives verified implementation"

7GL (speculative): Intent-level programming
     → "State intent in natural language; machine constructs and verifies algebra"
```

The key insight is that each step is incremental, not revolutionary. Lapis-JS is building the bottom layers now (BMF core + contracts + LP integration), each of which is useful independently. The 6GL aspiration emerges when they compose — not as a separate feature but as a consequence of algebraic compositionality.

## References

- Bird, R. & de Moor, O. — *Algebra of Programming* (1997) — algebraic program derivation
- Meyer, B. — *Object-Oriented Software Construction* (1997) — Design by Contract
- Evans, E. — *Domain-Driven Design* (2003) — aggregates, bounded contexts, ubiquitous language
- Back, R-J. & von Wright, J. — *Refinement Calculus: A Systematic Introduction* (1998) — correctness-preserving program derivation
- Morgan, C. — *Programming from Specifications* (1994) — refinement and specification
- Fiat project (MIT) — automated derivation from algebraic specifications
- Young, G. — *CQRS and Event Sourcing* (2010) — empirical discovery of the μ/ν split
- See also: [Logic Programming and BMF](logic-programming-and-bmf.md), [Contracts vs Effects](contracts-vs-effects.md), [Contracts Backlog](backlog-contracts.md)
