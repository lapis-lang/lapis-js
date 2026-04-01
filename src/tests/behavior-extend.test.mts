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

const BaseStream = behavior(self => ({
    head: Object,
    tail: self
})).ops(({ fold, unfold, map, merge, self }) => ({
    From: unfold({ in: Number, out: self })({
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
        const ChildStream = behavior(self => ({
            [extend]: BaseStream
        })).ops(({ fold, unfold, map, merge, self }) => ({
            Repeat: unfold({ in: Object, out: self })({
                head: (v) => v,
                tail: (v) => v
            })
        }));

        const s: any = ChildStream.Repeat(42);
        assert.equal(s.head, 42);
        assert.equal(s.tail.head, 42);
    });

    it('child instance is instanceof parent and child behaviors (non-parameterized)', () => {
        const Base = behavior(self => ({
            value: Number
        })).ops(({ fold, unfold, map, merge, self }) => ({
            Next: unfold({ in: Number, out: self })({
                value: (n) => n
            })
        }));
        const Child = behavior(self => ({
            [extend]: Base
        })).ops(({ fold, unfold, map, merge, self }) => ({
            Next2: unfold({ in: Number, out: self })({
                value: (n) => n
            })
        }));

        const s: any = Child.Next2(42);
        assert.equal(s instanceof (Base as any), true);
        assert.equal(s instanceof (Child as any), true);
    });

    it('child inherits parent observer names', () => {
        // behaviorObservers stores the observerMap keyed on the non-parameterized proxy
        const ChildStream = behavior(self => ({
            [extend]: BaseStream,
            peek: { in: Number, out: Object }
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
        const LabeledStream = behavior(self => ({
            [extend]: BaseStream,
            label: String
        })).ops(({ fold, unfold, map, merge, self }) => ({
            Tagged: unfold({ in: Number, out: self })({
                head: (n) => n,
                tail: (n) => n + 1,
                label: () => 'tagged'
            })
        }));

        const s: any = LabeledStream.Tagged(1);
        assert.equal(s.head, 1);
        assert.equal(s.label, 'tagged');
        assert.equal(s.tail.head, 2);
    });

    it('child can add a new parametric observer', () => {
        const IndexedStream = behavior(self => ({
            [extend]: BaseStream,
            nth: { in: Number, out: Object }
        })).ops(({ fold, unfold, map, merge, self }) => ({
            FromIdx: unfold({ in: Number, out: self })({
                head: (n) => n,
                tail: (n) => n + 1,
                nth: (n) => (i) => n + i
            })
        }));

        const s = IndexedStream.FromIdx(10);
        assert.equal(s.head, 10);
        assert.equal(s.nth(3), 13);
    });

    it('child unfold must provide handlers for all observers (parent + new)', () => {
        assert.throws(() => {
            const BadChild = behavior(self => ({
                [extend]: BaseStream,
                extra: String
            })).ops(({ fold, unfold, map, merge, self }) => ({
                // @ts-expect-error — deliberately passing empty handlers to test runtime validation
                Bad: unfold({ in: Number, out: self })({})
            }));
            BadChild; // trigger type setup
        });
    });
});

// ---------------------------------------------------------------------------

describe('behavior [extend] — parent unfold inheritance', () => {
    it('inherits parent unfold when child adds no new observers', () => {
        // Child only adds a new operation (no new observers)
        const Base = behavior(self => ({
            value: Number
        })).ops(({ fold, unfold, map, merge, self }) => ({
            FromBase: unfold({ in: Number, out: self })({
                value: (n) => n
            })
        }));
        const Child = behavior(self => ({
            [extend]: Base
        })).ops(({ fold, unfold, map, merge, self }) => ({
            Double: unfold({ in: Number, out: self })({
                value: (n) => n * 2
            })
        }));

        // FromBase should be inherited since Child adds no new observers
        const s = (Child as any).FromBase(3);
        assert.equal(s.value, 3);
    });

    it('does NOT inherit parent unfold when child adds new observers', () => {
        const Base = behavior(self => ({
            value: Number
        })).ops(({ fold, unfold, map, merge, self }) => ({
            FromBase: unfold({ in: Number, out: self })({
                value: (n) => n
            })
        }));
        const Extended = behavior(self => ({
            [extend]: Base,
            extra: String
        })).ops(({ fold, unfold, map, merge, self }) => ({
            Fresh: unfold({ in: Number, out: self })({
                value: (n) => n,
                extra: () => 'x'
            })
        }));

        // Base's 'FromBase' unfold does NOT cover 'extra', so it must NOT be inherited
        const desc = Object.getOwnPropertyDescriptor(Extended, 'FromBase');
        assert.equal(desc, undefined);
    });

    it('child can override a parent unfold by redeclaring it', () => {
        const Base = behavior(self => ({
            value: Number
        })).ops(({ fold, unfold, map, merge, self }) => ({
            Create: unfold({ in: Number, out: self })({
                value: (n) => n
            })
        }));
        const Child = behavior(self => ({
            [extend]: Base
        })).ops(({ fold, unfold, map, merge, self }) => ({
            Create: unfold({ in: Number, out: self })({
                value: (n) => n * 2
            })
        }));

        const s = Child.Create(3);
        assert.equal(s.value, 6);   // child overrides: 3 * 2
    });

    it('throws for invalid unfold override signature changes', () => {
        const invalidOverrides = [
            {
                parentUnfoldSpec: { in: Number, out: 'self' as const },
                parentValue: (n: any) => n,
                childUnfoldSpec: { in: String, out: 'self' as const },
                childValue: (s: any) => s.length,
                message: /Cannot change unfold 'Create' input specification when overriding/
            },
            {
                parentUnfoldSpec: { out: 'self' as const },
                parentValue: () => 0,
                childUnfoldSpec: { in: Number, out: 'self' as const },
                childValue: (n: any) => n,
                message: /Cannot change unfold 'Create' from parameterless to parameterized when overriding/
            }
        ];

        for (const c of invalidOverrides) {
            const Base = behavior(self => ({
                value: Number
            })).ops(({ unfold, self }) => ({
                Create: unfold(c.parentUnfoldSpec.in === undefined
                    ? { out: self }
                    : { in: c.parentUnfoldSpec.in, out: self })({
                    value: c.parentValue
                })
            }));

            assert.throws(
                () => behavior(self => ({
                    [extend]: Base
                })).ops(({ unfold, self }) => ({
                    Create: unfold(c.childUnfoldSpec.in === undefined
                        ? { out: self }
                        : { in: c.childUnfoldSpec.in, out: self })({
                        value: c.childValue
                    })
                })),
                { message: c.message }
            );
        }
    });

    it('inherits in from parent spec when override omits it', () => {
        const Base = behavior(self => ({
            value: Number
        })).ops(({ fold, unfold, map, merge, self }) => ({
            Create: unfold({ in: Number, out: self })({
                value: (n) => n
            })
        }));
        const Child = behavior(self => ({
            [extend]: Base
        })).ops(({ fold, unfold, map, merge, self }) => ({
            Create: unfold({ out: self })({
                // @ts-expect-error -- intentional type violation for test
                value: (n) => n * 2
            })
        }));

        // Still a parameterized method (inherited in: Number)
        const s = Child.Create(5);
        assert.equal(s.value, 10);
    });

    it('throws when override changes out type', () => {
        const Base = behavior(self => ({
            value: Number
        })).ops(({ fold, unfold, map, merge, self }) => ({
            Create: unfold({ in: Number, out: Number })({
                value: (n) => n
            })
        }));
        assert.throws(
            () => behavior(self => ({
                [extend]: Base
            })).ops(({ fold, unfold, map, merge, self }) => ({
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
        const Base = behavior(self => ({
            value: Number
        })).ops(({ fold, unfold, map, merge, self }) => ({
            FromBase: unfold({ in: Number, out: self })({
                value: (n) => n
            }),
            show: fold({})({
                _: ({ value }) => `v=${value}`
            })
        }));
        const Child = behavior(self => ({
            [extend]: Base
        })).ops(({ fold, unfold, map, merge, self }) => ({
            Double: unfold({ in: Number, out: self })({
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
    const SimpleSet = behavior(self => ({
        isEmpty: Boolean,
        member: { in: Number, out: Boolean }
    })).ops(({ fold, unfold, map, merge, self }) => ({
        Empty: unfold({ out: self })({
            isEmpty: () => true,
            member: () => () => false
        })
    }));

    it('child inherits observers from non-parameterized parent', () => {
        const EvenSet = behavior(self => ({
            [extend]: SimpleSet
        })).ops(({ fold, unfold, map, merge, self }) => ({
            Evens: unfold({ out: self })({
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
        const EvenSet = behavior(self => ({
            [extend]: SimpleSet
        })).ops(({ fold, unfold, map, merge, self }) => ({
            Evens: unfold({ out: self })({
                isEmpty: () => false,
                member: () => (n) => n % 2 === 0
            })
        }));

        const s: any = EvenSet.Evens;
        assert.equal(s instanceof (SimpleSet as any), true);
        assert.equal(s instanceof (EvenSet as any), true);
    });

    it('inherits parent unfold when child adds no new observers', () => {
        const EvenSet = behavior(self => ({
            [extend]: SimpleSet
        })).ops(({ fold, unfold, map, merge, self }) => ({
            Evens: unfold({ out: self })({
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
            () => behavior(self => ({
                [extend]: 'not-a-behavior',
                observer: Boolean
            })),
            { message: /\[extend\] must reference a behavior type/ }
        );
    });

    it('throws when [extend] references a plain class', () => {
        class Foo { }
        assert.throws(
            () => behavior(self => ({
                [extend]: Foo,
                observer: Boolean
            })),
            { message: /\[extend\] must reference a behavior type/ }
        );
    });

    it('throws when [extend] references a data type', () => {
        const MyData = data(_ => ({ Foo: {} }));
        assert.throws(
            () => behavior(self => ({
                [extend]: MyData,
                observer: Boolean
            })),
            { message: /\[extend\] must reference a behavior type/ }
        );
    });

    it('multiple levels of inheritance work', () => {
        const A = behavior(self => ({
            aObs: Boolean
        })).ops(({ fold, unfold, map, merge, self }) => ({
            Create: unfold({ out: self })({
                aObs: () => true
            })
        }));

        const B = behavior(self => ({
            [extend]: A,
            bObs: Boolean
        })).ops(({ fold, unfold, map, merge, self }) => ({
            CreateB: unfold({ out: self })({
                aObs: () => true,
                bObs: () => false
            })
        }));

        const C = behavior(self => ({
            [extend]: B,
            cObs: Boolean
        })).ops(({ fold, unfold, map, merge, self }) => ({
            CreateC: unfold({ out: self })({
                aObs: () => true,
                bObs: () => false,
                cObs: () => true
            })
        }));

        const c: any = C.CreateC;
        assert.equal(c.aObs, true);
        assert.equal(c.bObs, false);
        assert.equal(c.cObs, true);
        assert.equal(c instanceof (A as any), true);
        assert.equal(c instanceof (B as any), true);
        assert.equal(c instanceof (C as any), true);
    });
});
