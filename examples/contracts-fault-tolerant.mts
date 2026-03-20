/**
 * Fault-Tolerant Tree Fold with Rescue
 *
 * Demonstrates rescue handlers during recursive fold traversal.
 * When a node handler throws, rescue provides a fallback value,
 * allowing the fold to continue instead of failing entirely.
 */
import { data } from '@lapis-lang/lapis-js';

// A simple expression tree that may contain bad nodes
const Expr = data(({ Family }) => ({
    Lit: { value: Number },
    Add: { left: Family, right: Family },
    Div: { left: Family, right: Family }
})).ops(({ fold }) => ({
    eval: fold({
        out: Number,
        rescue: (_self: unknown, error: Error, _args: unknown[]) => {
            console.log(`  [rescue] Caught: ${error.message} → returning NaN`);
            return NaN;
        }
    })({
        Lit({ value }) { return value; },
        Add({ left, right }) { return left + right; },
        Div({ left, right }) {
            if (right === 0) throw new Error('Division by zero');
            return left / right;
        }
    }),
    safeEval: fold({
        out: Number,
        demands: (self: { depth: number }) => self.depth < 100,
        ensures: (_self: unknown, _old: unknown, result: number) => typeof result === 'number',
        rescue: (_self: unknown, error: Error, _args: unknown[]) => {
            console.log(`  [rescue] ${error.message} → defaulting to 0`);
            return 0;
        }
    })({
        Lit({ value }) { return value; },
        Add({ left, right }) { return left + right; },
        Div({ left, right }) {
            if (right === 0) throw new Error('Division by zero');
            return left / right;
        }
    }),
    show: fold({ out: String })({
        Lit({ value }) { return String(value); },
        Add({ left, right }) { return `(${left} + ${right})`; },
        Div({ left, right }) { return `(${left} / ${right})`; }
    }),
    depth: fold({ out: Number })({
        Lit() { return 1; },
        Add({ left, right }) { return 1 + Math.max(left, right); },
        Div({ left, right }) { return 1 + Math.max(left, right); }
    })
}));

const { Lit, Add, Div } = Expr;

console.log('=== Fault-Tolerant Tree Fold ===\n');

// --- Normal evaluation ---
console.log('1. Normal evaluation:');
const expr1 = Add({ left: Lit({ value: 10 }), right: Lit({ value: 5 }) });
console.log(`   ${expr1.show} = ${expr1.eval}`);

const expr2 = Div({ left: Lit({ value: 20 }), right: Lit({ value: 4 }) });
console.log(`   ${expr2.show} = ${expr2.eval}`);

// --- Division by zero with rescue ---
console.log('\n2. Division by zero (rescue returns NaN):');
const badExpr = Div({ left: Lit({ value: 10 }), right: Lit({ value: 0 }) });
console.log(`   ${badExpr.show}:`);
const result = badExpr.eval;
console.log(`   Result: ${result}`);

// --- Nested expression with bad sub-tree ---
console.log('\n3. Nested expression with bad sub-tree:');
const nested = Add({
    left: Lit({ value: 5 }),
    right: Div({ left: Lit({ value: 10 }), right: Lit({ value: 0 }) })
});
console.log(`   ${nested.show}:`);
const nestedResult = nested.eval;
console.log(`   Result: ${nestedResult} (NaN propagates through Add)`);

// --- safeEval with demands + ensures + rescue ---
console.log('\n4. safeEval (demands + ensures + rescue):');
const expr3 = Div({ left: Lit({ value: 42 }), right: Lit({ value: 0 }) });
console.log(`   ${expr3.show}:`);
const safeResult = expr3.safeEval;
console.log(`   safeEval result: ${safeResult}`);

// --- safeEval on valid expression ---
console.log('\n5. safeEval on valid expression:');
const expr4 = Add({
    left: Div({ left: Lit({ value: 100 }), right: Lit({ value: 5 }) }),
    right: Lit({ value: 3 })
});
console.log(`   ${expr4.show} = ${expr4.safeEval}`);

console.log('\n=== Done ===');
