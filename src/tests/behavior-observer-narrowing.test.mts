/**
 * Observer variance tests for behavior [extend] (Issue #189 — Step 2b).
 *
 * When a child behavior re-declares an inherited observer the runtime must
 * enforce Liskov-style variance rules:
 *
 *   Simple observers (just a type ref):
 *     - Covariant: child type must be a subtype of (or equal to) the parent type.
 *
 *   Parametric observers { in, out }:
 *     - `out` is covariant:     childOut ≤ parentOut
 *     - `in`  is contravariant: parentIn ≤ childIn  (child must accept ≥ parent's input)
 *
 * Kind changes (simple ↔ parametric) are always rejected.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { behavior, extend } from '../index.mjs';

// ── helper class hierarchy ────────────────────────────────────────────────────

class Animal { species = 'animal'; }
class Dog extends Animal { breed = 'labrador'; }

// ── Simple observers (covariant) ──────────────────────────────────────────────

describe('behavior observer variance — simple observers (covariant)', () => {
    it('accepts same type (identity)', () => {
        const Parent = behavior(self => ({
            value: Object
        }));
        // should not throw
        const Child = behavior(self => ({
            [extend]: Parent,
            value: Object
        }));
        assert.ok(Child);
    });

    it('accepts subtype (valid covariant narrowing: Dog ≤ Animal)', () => {
        const Parent = behavior(self => ({
            pet: Animal
        }));
        const Child = behavior(self => ({
            [extend]: Parent,
            pet: Dog
        }));
        assert.ok(Child);
    });

    it('rejects unrelated type (not a subtype)', () => {
        const Parent = behavior(self => ({
            value: Number
        }));
        assert.throws(
            () => behavior(self => ({
                [extend]: Parent,
                value: String    // String is not a subtype of Number
            })),
            (err: unknown) => {
                assert.ok(err instanceof TypeError);
                assert.match((err as TypeError).message, /Cannot narrow observer 'value'/);
                return true;
            }
        );
    });

    it('rejects supertype (widening not allowed in out position)', () => {
        const Parent = behavior(self => ({
            pet: Dog
        }));
        assert.throws(
            () => behavior(self => ({
                [extend]: Parent,
                pet: Animal    // Animal is a supertype of Dog — invalid
            })),
            (err: unknown) => {
                assert.ok(err instanceof TypeError);
                assert.match((err as TypeError).message, /Cannot narrow observer 'pet'/);
                return true;
            }
        );
    });
});

// ── Parametric observers — out (covariant) ────────────────────────────────────

describe('behavior observer variance — parametric out (covariant)', () => {
    it('accepts same out type', () => {
        const Parent = behavior(self => ({
            lookup: { in: Number, out: Object }
        }));
        const Child = behavior(self => ({
            [extend]: Parent,
            lookup: { in: Number, out: Object }
        }));
        assert.ok(Child);
    });

    it('accepts subtype out (valid covariant narrowing: Number ≤ Object)', () => {
        const Parent = behavior(self => ({
            lookup: { in: String, out: Object }
        }));
        const Child = behavior(self => ({
            [extend]: Parent,
            lookup: { in: String, out: Number }    // Number ≤ Object — ok
        }));
        assert.ok(Child);
    });

    it('rejects supertype out (widening not allowed)', () => {
        const Parent = behavior(self => ({
            lookup: { in: String, out: Number }
        }));
        assert.throws(
            () => behavior(self => ({
                [extend]: Parent,
                lookup: { in: String, out: Object }    // Object > Number — invalid
            })),
            (err: unknown) => {
                assert.ok(err instanceof TypeError);
                assert.match((err as TypeError).message, /Cannot narrow 'out' of observer 'lookup'/);
                return true;
            }
        );
    });
});

// ── Parametric observers — in (contravariant) ─────────────────────────────────

describe('behavior observer variance — parametric in (contravariant)', () => {
    it('accepts same in type', () => {
        const Parent = behavior(self => ({
            find: { in: Number, out: Boolean }
        }));
        const Child = behavior(self => ({
            [extend]: Parent,
            find: { in: Number, out: Boolean }
        }));
        assert.ok(Child);
    });

    it('accepts supertype in (valid contravariant widening: Object ≥ Number)', () => {
        const Parent = behavior(self => ({
            find: { in: Number, out: Boolean }
        }));
        const Child = behavior(self => ({
            [extend]: Parent,
            find: { in: Object, out: Boolean }    // Object ≥ Number — ok
        }));
        assert.ok(Child);
    });

    it('rejects subtype in (narrowing not allowed in contravariant position)', () => {
        const Parent = behavior(self => ({
            find: { in: Object, out: Boolean }
        }));
        assert.throws(
            () => behavior(self => ({
                [extend]: Parent,
                find: { in: Number, out: Boolean }    // Number < Object — invalid for in
            })),
            (err: unknown) => {
                assert.ok(err instanceof TypeError);
                assert.match((err as TypeError).message, /Cannot narrow 'in' of observer 'find'/);
                return true;
            }
        );
    });
});

// ── Kind changes ──────────────────────────────────────────────────────────────

describe('behavior observer variance — kind changes', () => {
    it('rejects simple → parametric change', () => {
        const Parent = behavior(self => ({
            value: Number
        }));
        assert.throws(
            () => behavior(self => ({
                [extend]: Parent,
                value: { in: String, out: Number }
            })),
            (err: unknown) => {
                assert.ok(err instanceof TypeError);
                assert.match((err as TypeError).message, /Cannot change observer 'value' between simple and parametric/);
                return true;
            }
        );
    });

    it('rejects parametric → simple change', () => {
        const Parent = behavior(self => ({
            value: { in: String, out: Number }
        }));
        assert.throws(
            () => behavior(self => ({
                [extend]: Parent,
                value: Number
            })),
            (err: unknown) => {
                assert.ok(err instanceof TypeError);
                assert.match((err as TypeError).message, /Cannot change observer 'value' between simple and parametric/);
                return true;
            }
        );
    });
});

// ── New observers (no parent) — no variance check needed ──────────────────────

describe('behavior observer variance — new observers (no parent conflict)', () => {
    it('child adds a brand-new observer without variance restriction', () => {
        const Parent = behavior(self => ({
            count: Number
        }));
        // Adding 'label' which does not exist in Parent — no check needed
        const Child = behavior(self => ({
            [extend]: Parent,
            label: String
        }));
        assert.ok(Child);
    });
});
