import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { data, extend, parent } from '../index.mjs';

describe('ExtendFold Operation (Recursive ADTs)', () => {
    describe('Basic Extension', () => {
        test('should extend fold operation with new variant handlers', () => {
            // Base expression language with integers
            const IntExpr = data(({ Family }) => ({
                IntLit: { value: Number },
                Add: { left: Family, right: Family },
                eval: {
                    op: 'fold',
                    spec: { out: Number },
                    IntLit({ value }) { return value; },
                    Add({ left, right }) { return left + right; }
                }
            }));

            // Extend with boolean operations
            const IntBoolExpr = data(({ Family }) => ({
                [extend]: IntExpr,
                BoolLit: { value: Boolean },
                LessThan: { left: Family, right: Family },
                eval: {
                    op: 'fold',
                    spec: { out: Number },
                    BoolLit({ value }) { return value ? 1 : 0; },
                    LessThan({ left, right }) { return left < right ? 1 : 0; }
                }
            }));

            // Test inherited variants work
            const five = IntBoolExpr.IntLit({ value: 5 });
            const three = IntBoolExpr.IntLit({ value: 3 });
            const sum = IntBoolExpr.Add({ left: five, right: three });
            assert.strictEqual(sum.eval, 8);

            // Test new variants work
            const trueLit = IntBoolExpr.BoolLit({ value: true });
            const falseLit = IntBoolExpr.BoolLit({ value: false });
            assert.strictEqual(trueLit.eval, 1);
            assert.strictEqual(falseLit.eval, 0);

            // Test new recursive variant
            const lessThan = IntBoolExpr.LessThan({ left: three, right: five });
            assert.strictEqual(lessThan.eval, 1);

            const notLessThan = IntBoolExpr.LessThan({ left: five, right: three });
            assert.strictEqual(notLessThan.eval, 0);
        });

        test('should support callback form with Family', () => {
            const IntExpr = data(({ Family }) => ({
                IntLit: { value: Number },
                Add: { left: Family, right: Family },
                eval: {
                    op: 'fold',
                    spec: { out: Number },
                    IntLit({ value }) { return value; },
                    Add({ left, right }) { return left + right; }
                }
            }));

            const IntBoolExpr = data(({ Family }) => ({
                [extend]: IntExpr,
                BoolLit: { value: Boolean },
                LessThan: { left: Family, right: Family },
                eval: {
                    op: 'fold',
                    spec: { out: Number },
                    BoolLit({ value }) { return value ? 1 : 0; },
                    LessThan({ left, right }) { return left < right ? 1 : 0; }
                }
            }));

            const five = IntBoolExpr.IntLit({ value: 5 });
            const three = IntBoolExpr.IntLit({ value: 3 });
            const lessThan = IntBoolExpr.LessThan({ left: three, right: five });
            assert.strictEqual(lessThan.eval, 1);
        });

        test('should extend fold on List ADT', () => {
            const NumList = data(({ Family }) => ({
                Nil: {},
                Cons: { head: Number, tail: Family },
                sum: {
                    op: 'fold',
                    spec: { out: Number },
                    Nil() { return 0; },
                    Cons({ head, tail }) { return head + tail; }
                }
            }));

            // Extend with new variant - Empty list with a label
            const LabeledList = data(({ Family }) => ({
                [extend]: NumList,
                Labeled: { label: String, list: Family },
                sum: {
                    op: 'fold',
                    spec: { out: Number },
                    Labeled({ list }) { return list; } // Just forward to the list
                }
            }));

            const list = LabeledList.Cons({
                head: 1,
                tail: LabeledList.Cons({
                    head: 2,
                    tail: LabeledList.Cons({ head: 3, tail: LabeledList.Nil })
                })
            });

            const labeled = LabeledList.Labeled({ label: 'mylist', list });
            assert.strictEqual(labeled.sum, 6);
            assert.strictEqual(list.sum, 6);
        });
    });

    describe('Override Semantics', () => {
        test('should override parent handler ignoring parent parameter', () => {
            const Peano = data(({ Family }) => ({
                Zero: {},
                Succ: { pred: Family },
                toValue: {
                    op: 'fold',
                    spec: { out: Number },
                    Zero() { return 0; },
                    Succ({ pred }) { return 1 + pred; }
                }
            }));

            // Extend with NegSucc and override Succ to double its value
            const ExtendedPeano = data(({ Family }) => ({
                [extend]: Peano,
                NegSucc: { pred: Family },
                toValue: {
                    op: 'fold',
                    spec: { out: Number },
                    NegSucc({ pred }) { return -1 + pred; },
                    Succ({ pred }) { return 2 + pred; } // Override: double increment
                }
            }));

            // Base instances use base handler
            const baseTwo = Peano.Succ({ pred: Peano.Succ({ pred: Peano.Zero }) });
            assert.strictEqual(baseTwo.toValue, 2);

            // Extended instances use override
            const extTwo = ExtendedPeano.Succ({ pred: ExtendedPeano.Succ({ pred: ExtendedPeano.Zero }) });
            assert.strictEqual(extTwo.toValue, 4); // 2 + 2 + 0

            // New variant works
            const negOne = ExtendedPeano.NegSucc({ pred: ExtendedPeano.Zero });
            assert.strictEqual(negOne.toValue, -1);
        });

        test('should override parent handler with parent access', () => {
            const Peano = data(({ Family }) => ({
                Zero: {},
                Succ: { pred: Family },
                toValue: {
                    op: 'fold',
                    spec: { out: Number },
                    Zero() { return 0; },
                    Succ({ pred }) { return 1 + pred; }
                }
            }));

            // Override Succ to scale parent result by 10
            const ExtendedPeano = data(({ Family }) => ({
                [extend]: Peano,
                NegSucc: { pred: Family },
                toValue: {
                    op: 'fold',
                    spec: { out: Number },
                    NegSucc({ pred }) { return -1 + pred; },
                    Succ({ pred }) {
                        // Call parent handler to get the original value
                        const parentResult = this[parent];
                        return parentResult * 10;
                    }
                }
            }));

            // Extended instances use override with parent
            const extOne = ExtendedPeano.Succ({ pred: ExtendedPeano.Zero });
            assert.strictEqual(extOne.toValue, 10); // (1 + 0) * 10

            const extTwo = ExtendedPeano.Succ({
                pred: ExtendedPeano.Succ({ pred: ExtendedPeano.Zero })
            });
            assert.strictEqual(extTwo.toValue, 110); // (1 + (1 + 0) * 10) * 10 = 110
        });

        test('should support override with singleton variants', () => {
            const Peano = data(({ Family }) => ({
                Zero: {},
                Succ: { pred: Family },
                toValue: {
                    op: 'fold',
                    spec: { out: Number },
                    Zero() { return 0; },
                    Succ({ pred }) { return 1 + pred; }
                }
            }));

            // Override Zero to return 100
            const ExtendedPeano = data(({ Family }) => ({
                [extend]: Peano,
                NegSucc: { pred: Family },
                toValue: {
                    op: 'fold',
                    spec: { out: Number },
                    NegSucc({ pred }) { return -1 + pred; },
                    Zero() {
                        // Access parent value and modify
                        const parentResult = this[parent];
                        return parentResult + 100;
                    }
                }
            }));

            assert.strictEqual(ExtendedPeano.Zero.toValue, 100); // 0 + 100

            // Base Zero uses original
            assert.strictEqual(Peano.Zero.toValue, 0);

            // Verify recursive behavior with extended Zero
            const one = ExtendedPeano.Succ({ pred: ExtendedPeano.Zero });
            assert.strictEqual(one.toValue, 101); // 1 + 100
        });
    });

    describe('Polymorphic Recursion', () => {
        test('should use extended operation in recursive calls', () => {
            // Base expression language
            const IntExpr = data(({ Family }) => ({
                IntLit: { value: Number },
                Add: { left: Family, right: Family },
                eval: {
                    op: 'fold',
                    spec: { out: Number },
                    IntLit({ value }) { return value; },
                    Add({ left, right }) { return left + right; }
                }
            }));

            // Extend with multiplication - polymorphic recursion ensures
            // Add's left and right are evaluated using the extended eval
            const ExtendedExpr = data(({ Family }) => ({
                [extend]: IntExpr,
                Mul: { left: Family, right: Family },
                eval: {
                    op: 'fold',
                    spec: { out: Number },
                    Mul({ left, right }) { return left * right; }
                }
            }));

            // Create complex expression: (2 + 3) * 4
            const two = ExtendedExpr.IntLit({ value: 2 });
            const three = ExtendedExpr.IntLit({ value: 3 });
            const four = ExtendedExpr.IntLit({ value: 4 });

            const sum = ExtendedExpr.Add({ left: two, right: three });
            const product = ExtendedExpr.Mul({ left: sum, right: four });

            assert.strictEqual(product.eval, 20); // (2 + 3) * 4 = 20
        });

        test('should handle deep polymorphic recursion', () => {
            const IntExpr = data(({ Family }) => ({
                IntLit: { value: Number },
                Add: { left: Family, right: Family },
                eval: {
                    op: 'fold',
                    spec: { out: Number },
                    IntLit({ value }) { return value; },
                    Add({ left, right }) { return left + right; }
                }
            }));

            // First extension: add subtraction
            const SubExpr = data(({ Family }) => ({
                [extend]: IntExpr,
                Sub: { left: Family, right: Family },
                eval: {
                    op: 'fold',
                    spec: { out: Number },
                    Sub({ left, right }) { return left - right; }
                }
            }));

            // Second extension: add multiplication
            const MulExpr = data(({ Family }) => ({
                [extend]: SubExpr,
                Mul: { left: Family, right: Family },
                eval: {
                    op: 'fold',
                    spec: { out: Number },
                    Mul({ left, right }) { return left * right; }
                }
            }));

            // Create expression: (10 - 3) * 2 + 5
            const ten = MulExpr.IntLit({ value: 10 });
            const three = MulExpr.IntLit({ value: 3 });
            const two = MulExpr.IntLit({ value: 2 });
            const five = MulExpr.IntLit({ value: 5 });

            const sub = MulExpr.Sub({ left: ten, right: three }); // 7
            const mul = MulExpr.Mul({ left: sub, right: two }); // 14
            const result = MulExpr.Add({ left: mul, right: five }); // 19

            assert.strictEqual(result.eval, 19);
        });

        test('should maintain polymorphic recursion with overrides', () => {
            const IntExpr = data(({ Family }) => ({
                IntLit: { value: Number },
                Add: { left: Family, right: Family },
                eval: {
                    op: 'fold',
                    spec: { out: Number },
                    IntLit({ value }) { return value; },
                    Add({ left, right }) { return left + right; }
                }
            }));

            // Override Add to log and scale result
            const LogExpr = data(({ Family }) => ({
                [extend]: IntExpr,
                Mul: { left: Family, right: Family },
                eval: {
                    op: 'fold',
                    spec: { out: Number },
                    Mul({ left, right }) { return left * right; },
                    Add({ left, right }) {
                        // Parent handler will receive already-folded left/right
                        // using the extended eval (polymorphic recursion)
                        const baseResult = this[parent];
                        return baseResult * 2; // Scale all additions by 2
                    }
                }
            }));

            // Create expression: (2 + 3) * 4
            // With override: ((2 + 3) * 2) * 4 = 10 * 4 = 40
            const two = LogExpr.IntLit({ value: 2 });
            const three = LogExpr.IntLit({ value: 3 });
            const four = LogExpr.IntLit({ value: 4 });

            const sum = LogExpr.Add({ left: two, right: three }); // (2 + 3) * 2 = 10
            const product = LogExpr.Mul({ left: sum, right: four }); // 10 * 4 = 40

            assert.strictEqual(sum.eval, 10);
            assert.strictEqual(product.eval, 40);
        });
    });

    describe('Multiple Extension Levels', () => {
        test('should support multiple levels of fold extension', () => {
            // Level 1: Base with integers
            const L1 = data(({ Family }) => ({
                IntLit: { value: Number },
                Add: { left: Family, right: Family },
                eval: {
                    op: 'fold',
                    spec: { out: Number },
                    IntLit({ value }) { return value; },
                    Add({ left, right }) { return left + right; }
                }
            }));

            // Level 2: Add subtraction
            const L2 = data(({ Family }) => ({
                [extend]: L1,
                Sub: { left: Family, right: Family },
                eval: {
                    op: 'fold',
                    spec: { out: Number },
                    Sub({ left, right }) { return left - right; }
                }
            }));

            // Level 3: Add multiplication
            const L3 = data(({ Family }) => ({
                [extend]: L2,
                Mul: { left: Family, right: Family },
                eval: {
                    op: 'fold',
                    spec: { out: Number },
                    Mul({ left, right }) { return left * right; }
                }
            }));

            // Level 4: Add division
            const L4 = data(({ Family }) => ({
                [extend]: L3,
                Div: { left: Family, right: Family },
                eval: {
                    op: 'fold',
                    spec: { out: Number },
                    Div({ left, right }) { return left / right; }
                }
            }));

            // Test complex expression: (10 + 5) / (4 - 1) * 2
            const ten = L4.IntLit({ value: 10 });
            const five = L4.IntLit({ value: 5 });
            const four = L4.IntLit({ value: 4 });
            const one = L4.IntLit({ value: 1 });
            const two = L4.IntLit({ value: 2 });

            const sum = L4.Add({ left: ten, right: five }); // 15
            const diff = L4.Sub({ left: four, right: one }); // 3
            const quot = L4.Div({ left: sum, right: diff }); // 5
            const result = L4.Mul({ left: quot, right: two }); // 10

            assert.strictEqual(result.eval, 10);
        });

        test('should handle overrides across multiple levels', () => {
            const L1 = data(({ Family }) => ({
                IntLit: { value: Number },
                Add: { left: Family, right: Family },
                eval: {
                    op: 'fold',
                    spec: { out: Number },
                    IntLit({ value }) { return value; },
                    Add({ left, right }) { return left + right; }
                }
            }));

            // L2: Override IntLit to negate values
            const L2 = data(({ Family }) => ({
                [extend]: L1,
                Sub: { left: Family, right: Family },
                eval: {
                    op: 'fold',
                    spec: { out: Number },
                    Sub({ left, right }) { return left - right; },
                    IntLit({ value }) {
                        const base = this[parent];
                        return -base; // Negate all literals
                    }
                }
            }));

            // L3: Override Add to double the result
            const L3 = data(({ Family }) => ({
                [extend]: L2,
                Mul: { left: Family, right: Family },
                eval: {
                    op: 'fold',
                    spec: { out: Number },
                    Mul({ left, right }) { return left * right; },
                    Add({ left, right }) {
                        const base = this[parent];
                        return base * 2; // Double all additions
                    }
                }
            }));

            // Test: 2 + 3 at each level
            const l1Two = L1.IntLit({ value: 2 });
            const l1Three = L1.IntLit({ value: 3 });
            const l1Sum = L1.Add({ left: l1Two, right: l1Three });
            assert.strictEqual(l1Sum.eval, 5); // Normal: 2 + 3 = 5

            const l2Two = L2.IntLit({ value: 2 });
            const l2Three = L2.IntLit({ value: 3 });
            const l2Sum = L2.Add({ left: l2Two, right: l2Three });
            assert.strictEqual(l2Sum.eval, -5); // Negated: -2 + -3 = -5

            const l3Two = L3.IntLit({ value: 2 });
            const l3Three = L3.IntLit({ value: 3 });
            const l3Sum = L3.Add({ left: l3Two, right: l3Three });
            assert.strictEqual(l3Sum.eval, -10); // Negated then doubled: (-2 + -3) * 2 = -10
        });
    });

    describe('Error Handling', () => {
        test('should allow adding new operations to extended ADTs', () => {
            const Base = data(({ Family }) => ({
                IntLit: { value: Number },
                Add: { left: Family, right: Family },
                eval: {
                    op: 'fold',
                    spec: { out: Number },
                    IntLit({ value }) { return value; },
                    Add({ left, right }) { return left + right; }
                }
            }));

            const Extended = data(() => ({
                [extend]: Base,
                BoolLit: { value: Boolean },
                toBool: {
                    op: 'fold',
                    spec: { out: Boolean },
                    IntLit({ value }) { return value !== 0; },
                    Add({ left, right }) { return left || right; },
                    BoolLit({ value }) { return value; }
                }
            }));

            const result = Extended.BoolLit({ value: true }).toBool;
            assert.strictEqual(result, true);
        });

        test('should allow overriding handlers like OOP method overriding', () => {
            const Base = data(({ Family }) => ({
                IntLit: { value: Number },
                Add: { left: Family, right: Family },
                eval: {
                    op: 'fold',
                    spec: { out: Number },
                    IntLit({ value }) { return value; },
                    Add({ left, right }) { return left + right; }
                }
            }));

            const Extended = data(() => ({
                [extend]: Base,
                BoolLit: { value: Boolean },
                eval: {
                    op: 'fold',
                    spec: { out: Number },
                    BoolLit({ value }) { return value ? 1 : 0; }
                }
            }));

            // Override BoolLit handler at next level (allowed, like OOP)
            const FurtherExtended = data(() => ({
                [extend]: Extended,
                eval: {
                    op: 'fold',
                    spec: { out: Number },
                    BoolLit({ value }) { return value ? 100 : 0; }
                }
            }));

            const boolTrue = FurtherExtended.BoolLit({ value: true });
            const boolFalse = FurtherExtended.BoolLit({ value: false });
            
            // Overridden handler is used
            assert.strictEqual(boolTrue.eval, 100);
            assert.strictEqual(boolFalse.eval, 0);
        });

        test('should allow extending same operation at different levels', () => {
            const L1 = data(({ Family }) => ({
                IntLit: { value: Number },
                Add: { left: Family, right: Family },
                eval: {
                    op: 'fold',
                    spec: { out: Number },
                    IntLit({ value }) { return value; },
                    Add({ left, right }) { return left + right; }
                }
            }));

            const L2 = data(({ Family }) => ({
                [extend]: L1,
                Sub: { left: Family, right: Family },
                eval: {
                    op: 'fold',
                    spec: { out: Number },
                    Sub({ left, right }) { return left - right; }
                }
            }));

            // This should work - different ADT level
            const L3 = data(({ Family }) => ({
                [extend]: L2,
                Mul: { left: Family, right: Family },
                eval: {
                    op: 'fold',
                    spec: { out: Number },
                    Mul({ left, right }) { return left * right; }
                }
            }));

            const result = L3.Sub({
                left: L3.Add({ left: L3.IntLit({ value: 5 }), right: L3.IntLit({ value: 3 }) }),
                right: L3.IntLit({ value: 2 })
            });

            assert.strictEqual(result.eval, 6); // (5 + 3) - 2 = 6
        });
    });

    describe('Wildcard Handling', () => {
        test('should support wildcard in extended fold', () => {
            const Base = data(({ Family }) => ({
                IntLit: { value: Number },
                Add: { left: Family, right: Family },
                eval: {
                    op: 'fold',
                    spec: { out: Number },
                    IntLit({ value }) { return value; },
                    _() { return -999; } // Wildcard for unknown variants
                }
            }));

            const Extended = data(() => ({
                [extend]: Base,
                BoolLit: { value: Boolean },
                eval: {
                    op: 'fold',
                    spec: { out: Number },
                    BoolLit({ value }) { return value ? 1 : 0; }
                }
            }));

            // IntLit uses base handler
            assert.strictEqual(Extended.IntLit({ value: 5 }).eval, 5);

            // Add uses wildcard from base
            const sum = Extended.Add({
                left: Extended.IntLit({ value: 2 }),
                right: Extended.IntLit({ value: 3 })
            });
            assert.strictEqual(sum.eval, -999);

            // BoolLit uses new handler
            assert.strictEqual(Extended.BoolLit({ value: true }).eval, 1);
        });

        test('should override wildcard handler', () => {
            const Base = data(({ Family }) => ({
                IntLit: { value: Number },
                Add: { left: Family, right: Family },
                eval: {
                    op: 'fold',
                    spec: { out: Number },
                    IntLit({ value }) { return value; },
                    _() { return -999; } // Wildcard
                }
            }));

            const Extended = data(() => ({
                [extend]: Base,
                BoolLit: { value: Boolean },
                eval: {
                    op: 'fold',
                    spec: { out: Number },
                    BoolLit({ value }) { return value ? 1 : 0; },
                    _() {
                        // Access parent wildcard and modify
                        const base = this[parent];
                        return base * 2; // Double wildcard result
                    }
                }
            }));

            // Add uses overridden wildcard
            const sum = Extended.Add({
                left: Extended.IntLit({ value: 2 }),
                right: Extended.IntLit({ value: 3 })
            });
            assert.strictEqual(sum.eval, -1998); // -999 * 2
        });
    });
});
