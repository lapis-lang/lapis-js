/**
 * Tests for protocol default implementations via `_` wildcard (Phase 2 of issue #161).
 *
 * Covers:
 * - `fold(spec)({ _: fn })` syntax — defaultBody stored on ProtocolOpSpec
 * - Default auto-installed when conforming type doesn't implement the op
 * - Default NOT installed when conforming type provides its own op (user wins)
 * - Getter (no-arg fold) vs method (fold with `in`) defaults
 * - Default inherited when child protocol extends parent with a default
 * - Default from multiple parent protocols — first one wins if same op name
 * - Law-derived default style: `this.compare(other) === 0`
 * - `fold(spec)` without handler call still works (no default, spec-only)
 * - `map(spec)({ _: fn })` default installation
 * - `unfold(spec)({ _: fn })` throws TypeError at declaration time (not supported)
 * - Inherited op satisfies conformance — default not installed / no false throw
 * - Protocol default does not clobber an inherited implementation
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    data,
    behavior,
    protocol,
    satisfies,
    extend
} from '../index.mjs';

// =============================================================================
// Fixtures
// =============================================================================

/**
 * Ord-like protocol: declare `compare`, default `equals` from `compare`.
 */
const Orderable = protocol(({ Family, fold: f }) => ({
    compare: f({ in: Family, out: Number }),
    // Default: equals derived from compare (law theorem)
    equals: f({ in: Family, out: Boolean })({
        _: (ctx: any, other: unknown) => ctx.compare(other) === 0
    })
}));

// =============================================================================
// 1. defaultBody stored on ProtocolOpSpec
// =============================================================================

describe('ProtocolOpSpec defaultBody storage', () => {
    it('stores the _ handler as defaultBody when provided', () => {
        const opSpec = Orderable.requiredOps.get('equals');
        assert.strictEqual(typeof opSpec?.defaultBody, 'function');
    });

    it('defaultBody is null when no _ handler given', () => {
        const opSpec = Orderable.requiredOps.get('compare');
        assert.strictEqual(opSpec?.defaultBody, null);
    });

    it('spec-only form (no handler call) stores null defaultBody', () => {
        const P = protocol(({ Family, fold: f }) => ({
            size: f({ out: Number })
        }));

        assert.strictEqual(P.requiredOps.get('size')?.defaultBody, null);
    });
});

// =============================================================================
// 2. Default auto-installed when conforming type omits the op
// =============================================================================

describe('default auto-installation', () => {
    it('equals is installed from default when not declared in .ops()', () => {
        const Point = data(({ Family }) => ({
            [satisfies]: Orderable,
            Point2D: { x: Number, y: Number }
        })).ops(({ fold: f, Family }) => ({
            // NOTE: only compare provided, equals should come from the default
            compare: f({ in: Family, out: Number })({
                Point2D({ x, y }: any, other?: any) {
                    const o = other as { x: number; y: number };
                    const d = Math.hypot(x, y) - Math.hypot(o.x, o.y);
                    return d < 0 ? -1 : d > 0 ? 1 : 0;
                }
            })
        }));

        const p1 = Point.Point2D({ x: 3, y: 4 });   // dist = 5
        const p2 = Point.Point2D({ x: 0, y: 5 });   // dist = 5
        const p3 = Point.Point2D({ x: 1, y: 1 });   // dist = sqrt(2) ≈ 1.41

        // Default equals: compare(other) === 0
        assert.strictEqual((p1 as unknown as { equals: (other: unknown) => boolean }).equals(p2), true);
        assert.strictEqual((p1 as unknown as { equals: (other: unknown) => boolean }).equals(p3), false);
    });

    it('installed default is callable as a method', () => {
        const P = protocol(({ Family, fold: f }) => ({
            base: f({ out: Number }),
            derived: f({ in: Number, out: Number })({
                _: (ctx: any, factor: any) => ctx.base * factor
            })
        }));

        const MyData = data(({ Family }) => ({
            [satisfies]: P,
            Val: { n: Number }
        })).ops(({ fold: f }) => ({
            base: f({ out: Number })({ Val: ({ n }) => n })
            // derived not implemented — should come from default
        }));

        const v = MyData.Val({ n: 5 });
        assert.strictEqual((v as unknown as { derived: (factor: number) => number }).derived(2), 10);
    });
});

// =============================================================================
// 3. User-provided op shadows the default (default NOT installed)
// =============================================================================

describe('user implementation shadows default', () => {
    it('user-provided equals takes precedence over default', () => {
        const Eq = protocol(({ Family, fold: f }) => ({
            compare: f({ in: Family, out: Number }),
            equals: f({ in: Family, out: Boolean })({
                _: () => false // default always returns false
            })
        }));

        const MyData = data(({ Family }) => ({
            [satisfies]: Eq,
            Item: { id: Number }
        })).ops(({ fold: f, Family }) => ({
            compare: f({ in: Family, out: Number })({
                Item({ id }: any, other?: any) { return id - (other as { id: number }).id; }
            }),
            // User provides their own equals — must override the default
            equals: f({ in: Family, out: Boolean })({
                Item({ id }: any, other?: any) { return id === (other as { id: number }).id; }
            })
        }));

        const a = MyData.Item({ id: 1 });
        const b = MyData.Item({ id: 1 });

        // User's implementation should win — true (same id), not false (the default)
        assert.strictEqual((a as unknown as { equals: (other: unknown) => boolean }).equals(b), true);
    });
});

// =============================================================================
// 4. Getter (zero-arg fold) default
// =============================================================================

describe('getter default', () => {
    it('zero-arg fold default installed as a getter', () => {
        const Describable = protocol(({ Family, fold: f }) => ({
            label: f({ out: String }),
            // labelUpper defaults from label getter
            labelUpper: f({ out: String })({
                _: (ctx: any) => ctx.label.toUpperCase()
            })
        }));

        const Tag = data(({ Family }) => ({
            [satisfies]: Describable,
            Tag: { name: String }
        })).ops(({ fold: f }) => ({
            label: f({ out: String })({ Tag: ({ name }) => name })
            // labelUpper not declared — comes from default getter
        }));

        const t = Tag.Tag({ name: 'hello' });
        assert.strictEqual((t as unknown as { labelUpper: string }).labelUpper, 'HELLO');
    });
});

// =============================================================================
// 5. Default inherited through protocol [extend] chain
// =============================================================================

describe('default inherited through protocol extension', () => {
    it('grandchild protocol inherits defaults from grandparent', () => {
        const Base = protocol(({ Family, fold: f }) => ({
            base: f({ out: Number }),
            derived: f({ out: Number })({
                _: (ctx: any) => ctx.base + 1
            })
        }));

        const Mid = protocol(({ Family, fold: f }) => ({
            [extend]: Base,
            extra: f({ out: Boolean })
        }));

        const Child = protocol(({ Family, fold: f }) => ({
            [extend]: Mid,
            childOp: f({ out: String })
        }));

        // The 'derived' defaultBody should be propagated through the chain
        assert.strictEqual(typeof Child.requiredOps.get('derived')?.defaultBody, 'function');
    });

    it('conforming type gets default from grandparent protocol', () => {
        const Base = protocol(({ Family, fold: f }) => ({
            base: f({ out: Number }),
            derived: f({ out: Number })({
                _: (ctx: any) => ctx.base + 100
            })
        }));

        const Mid = protocol(({ Family, fold: f }) => ({
            [extend]: Base,
            extra: f({ out: Boolean })
        }));

        const MyData = data(({ Family }) => ({
            [satisfies]: Mid,
            X: { v: Number }
        })).ops(({ fold: f }) => ({
            base: f({ out: Number })({ X: ({ v }) => v }),
            extra: f({ out: Boolean })({ X: () => true })
            // derived omitted — comes from Base's default
        }));

        const x = MyData.X({ v: 7 });
        assert.strictEqual((x as unknown as { derived: number }).derived, 107);
    });
});

// =============================================================================
// 6. map default
// =============================================================================

describe('map default', () => {
    it('map default (no `in`) is installed as a getter', () => {
        const Scalable = protocol(({ Family, fold: f, map: m }) => ({
            raw: f({ out: Number }),
            // doubled: a no-arg map that doubles the raw value
            doubled: m({ out: Number })({
                _: (ctx: { raw: number }) => ctx.raw * 2
            })
        }));

        const Box = data(({ Family }) => ({
            [satisfies]: Scalable,
            Box: { n: Number }
        })).ops(({ fold: f }) => ({
            raw: f({ out: Number })({ Box: ({ n }) => n })
            // doubled not declared — comes from map default (getter)
        }));

        const b = Box.Box({ n: 3 });
        assert.strictEqual((b as unknown as { doubled: number }).doubled, 6);
    });
});

// =============================================================================
// 7. Multiple defaults coexist
// =============================================================================

describe('multiple defaults on a single protocol', () => {
    it('all defaulted ops are installed for a conforming type', () => {
        const MultiDefault = protocol(({ Family, fold: f }) => ({
            raw: f({ out: Number }),
            plus1: f({ out: Number })({
                _: (ctx: any) => ctx.raw + 1
            }),
            plus2: f({ out: Number })({
                _: (ctx: any) => ctx.raw + 2
            })
        }));

        const Num = data(({ Family }) => ({
            [satisfies]: MultiDefault,
            Num: { n: Number }
        })).ops(({ fold: f }) => ({
            raw: f({ out: Number })({ Num: ({ n }) => n })
        }));

        const x = Num.Num({ n: 10 }) as unknown as { plus1: number; plus2: number };
        assert.strictEqual(x.plus1, 11);
        assert.strictEqual(x.plus2, 12);
    });
});

// =============================================================================
// 8. Default with multi-parent protocol (diamond) inherits default
// =============================================================================

describe('default via multi-parent protocol', () => {
    it('default inherited from one parent is installed via multi-parent child protocol', () => {
        const PA = protocol(({ Family, fold: f }) => ({
            base: f({ out: Number }),
            derived: f({ out: Number })({
                _: (ctx: any) => ctx.base * 3
            })
        }));

        const PB = protocol(({ Family, fold: f }) => ({
            extra: f({ out: Boolean })
        }));

        const PAB = protocol(({ Family, fold: f }) => ({
            [extend]: [PA, PB]
        }));

        const MyData = data(({ Family }) => ({
            [satisfies]: PAB,
            X: { v: Number }
        })).ops(({ fold: f }) => ({
            base: f({ out: Number })({ X: ({ v }) => v }),
            extra: f({ out: Boolean })({ X: () => false })
            // derived comes from PA's default
        }));

        const x = MyData.X({ v: 4 });
        assert.strictEqual((x as unknown as { derived: number }).derived, 12);
    });
});

// =============================================================================
// 9. Contract enforcement on installed defaults
// =============================================================================

describe('contract enforcement on protocol defaults', () => {
    it('demands predicate on default is checked before execution', () => {
        const P = protocol(({ Family, fold: f }) => ({
            base: f({ out: Number }),
            safe: f({
                in: Number,
                out: Number,
                demands: (_self: unknown, n: unknown) => (n as number) > 0
            })({
                _: (ctx: any, n: any) => ctx.base + n
            })
        }));

        const T = data(({ Family }) => ({
            [satisfies]: P,
            Box: { n: Number }
        })).ops(({ fold: f }) => ({
            base: f({ out: Number })({ Box: ({ n }) => n })
        }));

        const b = T.Box({ n: 10 }) as unknown as { safe: (n: number) => number };
        assert.strictEqual(b.safe(5), 15);                    // valid input
        assert.throws(() => b.safe(-1), /demands|DemandsError/i); // negative violates demand
    });

    it('ensures predicate on default is checked after execution', () => {
        const P = protocol(({ Family, fold: f }) => ({
            base: f({ out: Number }),
            bounded: f({
                in: Number,
                out: Number,
                ensures: (_self: unknown, _old: unknown, result: unknown) =>
                    (result as number) >= 0
            })({
                _: (ctx: any, n: any) => ctx.base + n
            })
        }));

        const T = data(({ Family }) => ({
            [satisfies]: P,
            Box: { n: Number }
        })).ops(({ fold: f }) => ({
            base: f({ out: Number })({ Box: ({ n }) => n })
        }));

        const b = T.Box({ n: 5 }) as unknown as { bounded: (n: number) => number };
        assert.strictEqual(b.bounded(3), 8);                      // result ≥ 0 — ok
        assert.throws(() => b.bounded(-20), /ensures|EnsuresError/i); // result = -15 — fails
    });

    it('input type mismatch on a default method throws TypeError', () => {
        const P = protocol(({ Family, fold: f }) => ({
            double: f({ in: Number, out: Number })({
                _: (_ctx: any, n: any) => n * 2
            })
        }));

        const T = data(({ Family }) => ({
            [satisfies]: P,
            Box: { n: Number }
        })).ops(({ fold: f }) => ({}));

        const u = T.Box({ n: 0 }) as unknown as { double: (n: unknown) => number };
        assert.throws(() => u.double('hello' as unknown as number), TypeError);
    });
});

// =============================================================================
// 8. unfold _ handler is rejected at declaration time
// =============================================================================

describe('unfold default body rejection', () => {
    it('throws TypeError when a _ handler is provided for an unfold op', () => {
        assert.throws(
            () => protocol(({ Family, unfold: u }) => ({
                From: u({ out: Family })({ _: (ctx: any) => ctx })
            })),
            (e: Error) =>
                e instanceof TypeError &&
                e.message.includes("'From'") &&
                e.message.includes('Unfold defaults are not supported')
        );
    });

    it('unfold op without _ handler stores null defaultBody', () => {
        const P = protocol(({ Family, unfold: u }) => ({
            From: u({ out: Family })
        }));
        assert.strictEqual(P.requiredOps.get('From')?.defaultBody, null);
    });
});

// =============================================================================
// 10. Inherited implementations satisfy protocol conformance
// =============================================================================

describe('inherited operations satisfy protocol conformance', () => {
    it('child ADT does not throw when an inherited op satisfies a required op (no default)', () => {
        const P = protocol(({ Family, fold: f }) => ({
            eval: f({ out: Number }),
            size: f({ out: Number })  // required, no default
        }));

        const Parent = data(({ Family }) => ({
            [satisfies]: P,
            Lit: { value: Number }
        })).ops(({ fold: f }) => ({
            eval: f({ out: Number })({ Lit: ({ n }: any) => n }),
            size: f({ out: Number })({ Lit: () => 1 })
        }));

        // Child re-declares eval for new variants but NOT size.
        // size is inherited from Parent — should satisfy protocol without throwing.
        assert.doesNotThrow(() =>
            data(({ Family }) => ({
                [extend]: Parent,
                [satisfies]: P,
                Add: { left: Family, right: Family }
            })).ops(({ fold: f }) => ({
                eval: f({ out: Number })({ Add: ({ left, right }: any) => left + right })
                // size intentionally omitted — inherited from Parent
            }))
        );
    });

    it('protocol default does not clobber an inherited op', () => {
        // Protocol has a default for 'size' that would return -1.
        // The parent ADT provides a real implementation that returns 99.
        // The child inherits that real implementation and must NOT have it replaced
        // by the protocol default.
        const P = protocol(({ Family, fold: f }) => ({
            eval: f({ out: Number }),
            size: f({ out: Number })({ _: () => -1 })  // default: -1
        }));

        const Parent = data(({ Family }) => ({
            [satisfies]: P,
            Lit: { value: Number }
        })).ops(({ fold: f }) => ({
            eval: f({ out: Number })({ Lit: ({ value }: any) => value }),
            size: f({ out: Number })({ Lit: () => 99 })  // real impl: 99
        }));

        const Child = data(({ Family }) => ({
            [extend]: Parent,
            [satisfies]: P,
            Add: { left: Family, right: Family }
        })).ops(({ fold: f }) => ({
            eval: f({ out: Number })({ Add: ({ left, right }: any) => left + right })
            // size not re-declared — inherited from Parent
        }));

        const lit = Child.Lit({ value: 5 }) as unknown as { eval: number; size: number };
        assert.strictEqual(lit.eval, 5);
        // Must be 99 (inherited), not -1 (protocol default).
        assert.strictEqual(lit.size, 99);
    });
});
