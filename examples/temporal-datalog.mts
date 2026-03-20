/**
 * Temporal Datalog via μ/ν Boundary
 *
 * Demonstrates the key insight from issue #117 Part 8: when facts need
 * validity ranges, the structure remains μ (data) but the semantics
 * becomes ν (behavior) — "what is true now" depends on when you ask.
 *
 * - Static facts → data() (μ): construct finite, immutable fact sets
 * - Time-varying queries → behavior() (ν): observe which facts hold at a given time
 * - Interval operations (overlap, contains) → invariants/demands on observers
 *
 * No special temporal extension is needed — the existing data/behavior
 * duality captures the μ/ν split directly.
 */

import { data, behavior } from '../src/index.mjs';

// =============================================================================
// 1. Static Temporal Facts as Data (μ)
// =============================================================================

/**
 * A temporal fact: an assertion that holds during [validFrom, validTo).
 * This is pure data — once constructed, the fact is immutable.
 *
 * Variants:
 *   Point  — holds at exactly one time instant
 *   Span   — holds over a half-open interval [from, to)
 */
const TemporalFact = data(() => ({
    Point: { entity: String, attribute: String, value: String, at: Number },
    Span:  { entity: String, attribute: String, value: String, validFrom: Number, validTo: Number }
})).ops(({ fold, unfold, map, merge }) => ({
    holdsAt: fold({ in: Number, out: Boolean })({
        Point: ({ at }, time: number) => at === time,
        Span:  ({ validFrom, validTo }, time: number) => time >= validFrom && time < validTo
    }),
    getEntity: fold({ out: String })({
        Point: ({ entity }) => entity,
        Span:  ({ entity }) => entity
    }),
    getAttribute: fold({ out: String })({
        Point: ({ attribute }) => attribute,
        Span:  ({ attribute }) => attribute
    }),
    getValue: fold({ out: String })({
        Point: ({ value }) => value,
        Span:  ({ value }) => value
    })
}));

// A knowledge base of temporal facts
const facts = [
    TemporalFact.Span('alice', 'role', 'engineer',  2018, 2022),
    TemporalFact.Span('alice', 'role', 'lead',      2022, 2026),
    TemporalFact.Span('bob',   'role', 'intern',    2019, 2020),
    TemporalFact.Span('bob',   'role', 'engineer',  2020, 2025),
    TemporalFact.Point('carol', 'joined', 'true',   2021),
    TemporalFact.Span('carol', 'role', 'engineer',  2021, 2026)
];

/**
 * Query the knowledge base at a specific time.
 * This is a simple filter via the holdsAt fold — Datalog-style
 * bottom-up evaluation against a finite fact set.
 */
function queryAt(kb: typeof facts, time: number) {
    return kb
        .filter(fact => fact.holdsAt(time))
        .map(fact => ({
            entity:    fact.getEntity,
            attribute: fact.getAttribute,
            value:     fact.getValue
        }));
}

console.log('=== Temporal Datalog: Static Facts (μ) ===\n');
console.log('Facts holding at 2019:', queryAt(facts, 2019));
console.log('Facts holding at 2021:', queryAt(facts, 2021));
console.log('Facts holding at 2023:', queryAt(facts, 2023));

// =============================================================================
// 2. Time-Varying Observations as Behavior (ν)
// =============================================================================

/**
 * A temporal knowledge base as a behavior: the same set of facts, but
 * observed through a time-varying lens.  Each observation depends on
 * "when you ask" — this is the ν (greatest fixpoint) perspective.
 *
 * The unfold generates a stream of snapshots indexed by time.
 */
const Timeline = behavior(({ Self }) => ({
    time: Number,
    activeFacts: Array,
    next: Self
})).ops(({ fold, unfold, map, merge, Self }) => ({
    Stepper: unfold({
        in: { time: Number, facts: Array },
        out: Self
    })({
        time:        (state: { time: number }) => state.time,
         
        activeFacts: (state: { time: number; facts: any[] }) =>
            state.facts
                .filter((f: any) => f.holdsAt(state.time))
                .map((f: any) => `${f.getEntity}.${f.getAttribute}=${f.getValue}`),
         
        next:        (state: { time: number; facts: any[] }) =>
            ({ time: state.time + 1, facts: state.facts })
    })
}));

const timeline = Timeline.Stepper({ time: 2018, facts });

console.log('\n=== Temporal Datalog: Time-Varying Observations (ν) ===\n');
console.log(`Year ${timeline.time}:`, timeline.activeFacts);
console.log(`Year ${timeline.next.time}:`, timeline.next.activeFacts);
console.log(`Year ${timeline.next.next.time}:`, timeline.next.next.activeFacts);
console.log(`Year ${timeline.next.next.next.time}:`, timeline.next.next.next.activeFacts);

// Lazy: we can jump ahead without materializing intermediate steps
let snapshot = timeline;
for (let i = 0; i < 5; i++)  snapshot = snapshot.next;
console.log(`\nYear ${snapshot.time} (jumped ahead):`, snapshot.activeFacts);

// =============================================================================
// 3. The μ/ν Boundary: Same Facts, Two Perspectives
// =============================================================================

console.log('\n=== μ/ν Boundary ===\n');
console.log('data() view  — query at 2021:', queryAt(facts, 2021).map(f => `${f.entity}.${f.attribute}=${f.value}`));

let snap2021 = timeline;
while (snap2021.time < 2021)  snap2021 = snap2021.next;
console.log('behavior() view — observe 2021:', snap2021.activeFacts);

console.log('\nBoth produce the same result — data() computes eagerly over');
console.log('finite facts, behavior() observes lazily through time.');
