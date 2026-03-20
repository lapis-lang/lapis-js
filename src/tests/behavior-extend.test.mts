/**
 * Tests for [extend] support on behavior types
 *
 * [extend] enables a behavior to inherit its parent's observers, forming a
 * prototype chain (child instanceof parent) while adding new observers and
 * operations.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { behavior, extend, behaviorObservers, data } from '../index.mjs';

// ---------------------------------------------------------------------------
// Shared base behaviors used across multiple test groups
// ---------------------------------------------------------------------------

const BaseStream = behavior(({ Self, T }) => ({
    head: T,
    tail: Self
})).ops(({ fold, unfold, map, merge, Self, T }) => ({
    From: unfold({ in: Number, out: Self })({
        head: (n) => n,
        tail: (n) => n + 1
    }),
    sum: fold({ in: Number, out: Number })({
        _: ({ head, tail }, n) => {
            if (n <= 0) return 0;
            return head + tail(n - 1);
        }
    })
}));

// ---------------------------------------------------------------------------

describe('behavior [extend] — instanceof and observer inheritance', () => {
    it('creates a child behavior without extra observers', () => {
        const ChildStream = behavior(({ Self, T }) => ({
            [extend]: BaseStream
        })).ops(({ fold, unfold, map, merge, Self, T }) => ({
            Repeat: unfold({ in: T, out: Self })({
                head: (v) => v,
                tail: (v) => v
            })
        }));

        const s = ChildStream({ T: Number }).Repeat(42);
        assert.equal(s.head, 42);
        assert.equal(s.tail.head, 42);
    });

    it('child instance is instanceof child behavior (non-parameterized)', () => {
        const Base = behavior(({ Self }) => ({
            value: Number
        })).ops(({ fold, unfold, map, merge, Self }) => ({
            Next: unfold({ in: Number, out: Self })({
                value: (n) => n
            })
        }));
        const Child = behavior(({ Self }) => ({
            [extend]: Base
        })).ops(({ fold, unfold, map, merge, Self }) => ({
            Next2: unfold({ in: Number, out: Self })({
                value: (n) => n
            })
        }));

        const s = Child.Next2(42);
        assert.equal(s instanceof Child, true);
    });

    it('child instance is instanceof parent behavior (non-parameterized)', () => {
        const Base = behavior(({ Self }) => ({
            value: Number
        })).ops(({ fold, unfold, map, merge, Self }) => ({
            Next: unfold({ in: Number, out: Self })({
                value: (n) => n
            })
        }));
        const Child = behavior(({ Self }) => ({
            [extend]: Base
        })).ops(({ fold, unfold, map, merge, Self }) => ({
            Next2: unfold({ in: Number, out: Self })({
                value: (n) => n
            })
        }));

        const s = Child.Next2(42);
        assert.equal(s instanceof Base, true);
        assert.equal(s instanceof Child, true);
    });

    it('child inherits parent observer names', () => {
        // behaviorObservers stores the observerMap keyed on the non-parameterized proxy
        const ChildStream = behavior(({ Self, T }) => ({
            [extend]: BaseStream,
            peek: { in: Number, out: T }
        }));

        const obsMap = behaviorObservers.get(ChildStream)!;
        assert.ok(obsMap.has('head'), 'should inherit head');
        assert.ok(obsMap.has('tail'), 'should inherit tail');
        assert.ok(obsMap.has('peek'), 'should have new observer');
    });
});

// ---------------------------------------------------------------------------

describe('behavior [extend] — adding new observers', () => {
    it('child can add a new simple observer', () => {
        const LabeledStream = behavior(({ Self, T }) => ({
            [extend]: BaseStream,
            label: String
        })).ops(({ fold, unfold, map, merge, Self, T }) => ({
            Tagged: unfold({ in: Number, out: Self })({
                head: (n) => n,
                tail: (n) => n + 1,
                label: () => 'tagged'
            })
        }));

        const s = LabeledStream({ T: Number }).Tagged(1);
        assert.equal(s.head, 1);
        assert.equal(s.label, 'tagged');
        assert.equal(s.tail.head, 2);
    });

    it('child can add a new parametric observer', () => {
        const IndexedStream = behavior(({ Self, T }) => ({
            [extend]: BaseStream,
            nth: { in: Number, out: T }
        })).ops(({ fold, unfold, map, merge, Self, T }) => ({
            FromIdx: unfold({ in: Number, out: Self })({
                head: (n) => n,
                tail: (n) => n + 1,
                nth: (n) => (i) => n + i
            })
        }));

        const s = IndexedStream({ T: Number }).FromIdx(10);
        assert.equal(s.head, 10);
        assert.equal(s.nth(3), 13);
    });

    it('child unfold must provide handlers for all observers (parent + new)', () => {
        assert.throws(() => {
            const BadChild = behavior(({ Self, T }) => ({
                [extend]: BaseStream,
                extra: String
            })).ops(({ fold, unfold, map, merge, Self, T }) => ({
                // @ts-expect-error — deliberately passing empty handlers to test runtime validation
                Bad: unfold({ in: Number, out: Self })({})
            }));
            BadChild({ T: Number }); // trigger type setup
        });
    });
});

// ---------------------------------------------------------------------------

describe('behavior [extend] — parent unfold inheritance', () => {
    it('inherits parent unfold when child adds no new observers', () => {
        // Child only adds a new operation (no new observers)
        const Base = behavior(({ Self }) => ({
            value: Number
        })).ops(({ fold, unfold, map, merge, Self }) => ({
            FromBase: unfold({ in: Number, out: Self })({
                value: (n) => n
            })
        }));
        const Child = behavior(({ Self }) => ({
            [extend]: Base
        })).ops(({ fold, unfold, map, merge, Self }) => ({
            Double: unfold({ in: Number, out: Self })({
                value: (n) => n * 2
            })
        }));

        // FromBase should be inherited since Child adds no new observers
        const s = (Child as any).FromBase(3);
        assert.equal(s.value, 3);
    });

    it('does NOT inherit parent unfold when child adds new observers', () => {
        const Base = behavior(({ Self }) => ({
            value: Number
        })).ops(({ fold, unfold, map, merge, Self }) => ({
            FromBase: unfold({ in: Number, out: Self })({
                value: (n) => n
            })
        }));
        const Extended = behavior(({ Self }) => ({
            [extend]: Base,
            extra: String
        })).ops(({ fold, unfold, map, merge, Self }) => ({
            Fresh: unfold({ in: Number, out: Self })({
                value: (n) => n,
                extra: () => 'x'
            })
        }));

        // Base's 'FromBase' unfold does NOT cover 'extra', so it must NOT be inherited
        const desc = Object.getOwnPropertyDescriptor(Extended, 'FromBase');
        assert.equal(desc, undefined);
    });

    it('child can override a parent unfold by redeclaring it', () => {
        const Base = behavior(({ Self }) => ({
            value: Number
        })).ops(({ fold, unfold, map, merge, Self }) => ({
            Create: unfold({ in: Number, out: Self })({
                value: (n) => n
            })
        }));
        const Child = behavior(({ Self }) => ({
            [extend]: Base
        })).ops(({ fold, unfold, map, merge, Self }) => ({
            Create: unfold({ in: Number, out: Self })({
                value: (n) => n * 2
            })
        }));

        const s = Child.Create(3);
        assert.equal(s.value, 6);   // child overrides: 3 * 2
    });

    it('throws when override changes in type', () => {
        const Base = behavior(({ Self }) => ({
            value: Number
        })).ops(({ fold, unfold, map, merge, Self }) => ({
            Create: unfold({ in: Number, out: Self })({
                value: (n) => n
            })
        }));
        assert.throws(
            () => behavior(({ Self }) => ({
                [extend]: Base
            })).ops(({ fold, unfold, map, merge, Self }) => ({
                Create: unfold({ in: String, out: Self })({
                    value: (s) => s.length
                })
            })),
            { message: /Cannot change unfold 'Create' input specification when overriding/ }
        );
    });

    it('throws when override adds in where parent had none', () => {
        const Base = behavior(({ Self }) => ({
            value: Number
        })).ops(({ fold, unfold, map, merge, Self }) => ({
            Create: unfold({ out: Self })({
                value: () => 0
            })
        }));
        assert.throws(
            () => behavior(({ Self }) => ({
                [extend]: Base
            })).ops(({ fold, unfold, map, merge, Self }) => ({
                Create: unfold({ in: Number, out: Self })({
                    value: (n) => n
                })
            })),
            { message: /Cannot change unfold 'Create' from parameterless to parameterized when overriding/ }
        );
    });

    it('inherits in from parent spec when override omits it', () => {
        const Base = behavior(({ Self }) => ({
            value: Number
        })).ops(({ fold, unfold, map, merge, Self }) => ({
            Create: unfold({ in: Number, out: Self })({
                value: (n) => n
            })
        }));
        const Child = behavior(({ Self }) => ({
            [extend]: Base
        })).ops(({ fold, unfold, map, merge, Self }) => ({
            Create: unfold({ out: Self })({
                // @ts-expect-error -- intentional type violation for test
                value: (n) => n * 2
            })
        }));

        // Still a parameterized method (inherited in: Number)
        // @ts-expect-error -- intentional type violation for test
        const s = Child.Create(5);
        assert.equal(s.value, 10);
    });

    it('throws when override changes out type', () => {
        const Base = behavior(({ Self }) => ({
            value: Number
        })).ops(({ fold, unfold, map, merge, Self }) => ({
            Create: unfold({ in: Number, out: Number })({
                value: (n) => n
            })
        }));
        assert.throws(
            () => behavior(({ Self }) => ({
                [extend]: Base
            })).ops(({ fold, unfold, map, merge, Self }) => ({
                Create: unfold({ in: Number, out: String })({
                    // @ts-expect-error -- intentional wrong output spec for negative test
                    value: (n) => String(n)
                })
            })),
            { message: /Cannot change unfold 'Create' output specification when overriding/ }
        );
    });
});

// ---------------------------------------------------------------------------

describe('behavior [extend] — parent fold inheritance', () => {
    it('inherits parent fold operation', () => {
        // Base with fold op
        const Base = behavior(({ Self }) => ({
            value: Number
        })).ops(({ fold, unfold, map, merge, Self }) => ({
            FromBase: unfold({ in: Number, out: Self })({
                value: (n) => n
            }),
            show: fold({})({
                _: ({ value }) => `v=${value}`
            })
        }));
        const Child = behavior(({ Self }) => ({
            [extend]: Base
        })).ops(({ fold, unfold, map, merge, Self }) => ({
            Double: unfold({ in: Number, out: Self })({
                value: (n) => n * 2
            })
        }));

        // 'show' is inherited from Base
        const s = Child.Double(5);
        assert.equal(s.show, 'v=10');
    });
});

// ---------------------------------------------------------------------------

describe('behavior [extend] — non-parameterized base', () => {
    const SimpleSet = behavior(({ Self }) => ({
        isEmpty: Boolean,
        member: { in: Number, out: Boolean }
    })).ops(({ fold, unfold, map, merge, Self }) => ({
        Empty: unfold({ out: Self })({
            isEmpty: () => true,
            member: () => () => false
        })
    }));

    it('child inherits observers from non-parameterized parent', () => {
        const EvenSet = behavior(({ Self }) => ({
            [extend]: SimpleSet
        })).ops(({ fold, unfold, map, merge, Self }) => ({
            Evens: unfold({ out: Self })({
                isEmpty: () => false,
                member: () => (n) => n % 2 === 0
            })
        }));

        const s = EvenSet.Evens;
        assert.equal(s.isEmpty, false);
        assert.equal(s.member(4), true);
        assert.equal(s.member(3), false);
    });

    it('child instance is instanceof parent (non-parameterized)', () => {
        const EvenSet = behavior(({ Self }) => ({
            [extend]: SimpleSet
        })).ops(({ fold, unfold, map, merge, Self }) => ({
            Evens: unfold({ out: Self })({
                isEmpty: () => false,
                member: () => (n) => n % 2 === 0
            })
        }));

        const s = EvenSet.Evens;
        assert.equal(s instanceof SimpleSet, true);
        assert.equal(s instanceof EvenSet, true);
    });

    it('inherits parent unfold when child adds no new observers', () => {
        const EvenSet = behavior(({ Self }) => ({
            [extend]: SimpleSet
        })).ops(({ fold, unfold, map, merge, Self }) => ({
            Evens: unfold({ out: Self })({
                isEmpty: () => false,
                member: () => (n) => n % 2 === 0
            })
        }));

        // Empty is inherited from SimpleSet
        const e = (EvenSet as any).Empty;
        assert.equal(e.isEmpty, true);
        assert.equal(e.member(0), false);
    });
});

// ---------------------------------------------------------------------------

describe('behavior [extend] — validation', () => {
    it('throws when [extend] does not reference a behavior type', () => {
        assert.throws(
            () => behavior(({ Self }) => ({
                [extend]: 'not-a-behavior',
                observer: Boolean
            })),
            { message: /\[extend\] must reference a behavior type/ }
        );
    });

    it('throws when [extend] references a plain class', () => {
        class Foo { }
        assert.throws(
            () => behavior(({ Self }) => ({
                [extend]: Foo,
                observer: Boolean
            })),
            { message: /\[extend\] must reference a behavior type/ }
        );
    });

    it('throws when [extend] references a data type', () => {
        const MyData = data(({ T }) => ({ Foo: {} }));
        assert.throws(
            () => behavior(({ Self }) => ({
                [extend]: MyData,
                observer: Boolean
            })),
            { message: /\[extend\] must reference a behavior type/ }
        );
    });

    it('multiple levels of inheritance work', () => {
        const A = behavior(({ Self }) => ({
            aObs: Boolean
        })).ops(({ fold, unfold, map, merge, Self }) => ({
            Create: unfold({ out: Self })({
                aObs: () => true
            })
        }));

        const B = behavior(({ Self }) => ({
            [extend]: A,
            bObs: Boolean
        })).ops(({ fold, unfold, map, merge, Self }) => ({
            CreateB: unfold({ out: Self })({
                aObs: () => true,
                bObs: () => false
            })
        }));

        const C = behavior(({ Self }) => ({
            [extend]: B,
            cObs: Boolean
        })).ops(({ fold, unfold, map, merge, Self }) => ({
            CreateC: unfold({ out: Self })({
                aObs: () => true,
                bObs: () => false,
                cObs: () => true
            })
        }));

        const c = C.CreateC;
        assert.equal(c.aObs, true);
        assert.equal(c.bObs, false);
        assert.equal(c.cObs, true);
        assert.equal(c instanceof A, true);
        assert.equal(c instanceof B, true);
        assert.equal(c instanceof C, true);
    });
});
