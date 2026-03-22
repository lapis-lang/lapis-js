/**
 * Tree(T) — a rose tree (multi-way tree).
 *
 *   Tree(T) ::= Leaf(value: T) | Branch(value: T, children: Array)
 *
 * Satisfies: Functor, Foldable, Eq({ T: Eq })
 *
 * Use cases: ASTs, file systems, hierarchical data, proof trees.
 *
 * @module
 */

import { data, satisfies } from '../../index.mjs';
import { Functor, Foldable, Eq } from '../protocols/index.mjs';


const Tree = data(({ T }) => ({
    [satisfies]: [
        Functor,
        Foldable,
        Eq({ T: Eq })
    ],
    Leaf:   { value: T },
    Branch: { value: T, children: Array }
})).ops(({ fold, map, Family }) => ({

    // ── Functor ──────────────────────────────────────────────────────────
    fmap: map({ out: Family })({
        T: (x: unknown, f: (a: unknown) => unknown) => f(x)
    }),

    // ── Foldable ─────────────────────────────────────────────────────────
    // foldMap({ monoid, f }): maps each node value to monoid, combines depth-first
    foldMap: fold({ in: Object, out: Object })({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Leaf({ value }: any, opts: any) {
            return opts.f(value);
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Branch({ value, children }: any, opts: any) {
            const v = opts.f(value);
            // children is Array of Tree instances
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return (children as any[]).reduce(
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (acc: any, child: any) => opts.monoid.combine.call(acc, child.foldMap(opts)),
                v
            );
        }
    }),

    // ── Eq (conditional: T must satisfy Eq) ──────────────────────────────
    equals: fold({ in: Object, out: Boolean })({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Leaf({ value }: any, other: any) {
            return other !== null && other !== undefined &&
                   this.constructor === other.constructor &&
                   // eslint-disable-next-line @typescript-eslint/no-explicit-any
                   (value as any).equals(other.value);
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Branch({ value, children }: any, other: any) {
            if (other === null || other === undefined) return false;
            if (this.constructor !== other.constructor) return false;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            if (!(value as any).equals(other.value)) return false;
            if ((children as unknown[]).length !== (other.children as unknown[]).length) return false;
            return (children as unknown[]).every((c, i) =>
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (c as any).equals((other.children as unknown[])[i])
            );
        }
    })

}));

export { Tree };
