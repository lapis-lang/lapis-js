import { data, extend } from '@lapis-lang/lapis-js'
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

describe('ADT Extension', () => {
    test('basic extension with simple variants', () => {
        const Color = data(() => ({ Red: {}, Green: {}, Blue: {} }));

        const ExtendedColor = data(() => ({ [extend]: Color, Yellow: {}, Orange: {} }));

        // Extended ADT should have all variants accessible
        assert.ok(ExtendedColor.Red);
        assert.ok(ExtendedColor.Yellow);

        // Extended ADT's own variants are instanceof ExtendedColor
        assert.ok(ExtendedColor.Yellow instanceof ExtendedColor);

        // Inherited variants get new singleton instances for ExtendedColor
        assert.ok(ExtendedColor.Red instanceof Color);
        assert.ok(ExtendedColor.Red instanceof ExtendedColor);

        // Extended variants are also instanceof base (proper subtyping)
        assert.ok(ExtendedColor.Yellow instanceof Color);

        // Original Color.Red remains instanceof only Color
        assert.ok(Color.Red instanceof Color);
        assert.ok(!(Color.Red instanceof ExtendedColor));
    });

    test('extension with structured variants', () => {
        const Point = data(() => ({
            Point2D: { x: Number, y: Number }
        }));

        const Point3DExtended = data(() => ({
            [extend]: Point,
            Point3D: { x: Number, y: Number, z: Number }
        }));

        // Create instances
        const p2 = Point3DExtended.Point2D({ x: 10, y: 20 });
        const p3 = Point3DExtended.Point3D({ x: 1, y: 2, z: 3 });

        // Instances from extended ADT are instanceof extended ADT
        assert.ok(p2 instanceof Point);
        assert.ok(p2 instanceof Point3DExtended);

        // Extended variant instances are instanceof both (proper subtyping)
        assert.ok(p3 instanceof Point3DExtended);
        assert.ok(p3 instanceof Point);

        // Base instances created via base ADT are NOT instanceof extended type
        const p2Base = Point.Point2D({ x: 5, y: 10 });
        assert.ok(p2Base instanceof Point);
        assert.ok(!(p2Base instanceof Point3DExtended));

        // Extended variant should NOT exist on base ADT
        assert.strictEqual((Point).Point3D, undefined);
    });

    test('extension with callback style for recursive ADTs', () => {
        const IntAlgebra = data(({ Family }) => ({
            Lit: { value: Number },
            Add: { left: Family, right: Family }
        }));

        const IntBoolAlgebra = data(({ Family }) => ({
            [extend]: IntAlgebra,
            BoolLit: { value: Boolean },
            Iff: { cond: Family, thenBranch: Family, elseBranch: Family }
        }));

        // Create instances using extended ADT constructors
        const lit1 = IntBoolAlgebra.Lit({ value: 42 });
        const lit2 = IntBoolAlgebra.Lit({ value: 10 });

        // Create instances of extended variants
        const boolLit = IntBoolAlgebra.BoolLit({ value: true });

        // Create recursive structure with base variants
        const add = IntBoolAlgebra.Add({ left: lit1, right: lit2 });

        // Create recursive structure with extended variants
        const iff = IntBoolAlgebra.Iff({
            cond: boolLit,
            thenBranch: add,
            elseBranch: lit1
        });

        // Instances created via extended ADT are instanceof extended ADT
        assert.ok(lit1 instanceof IntAlgebra);
        assert.ok(lit1 instanceof IntBoolAlgebra);
        assert.ok(add instanceof IntAlgebra);
        assert.ok(add instanceof IntBoolAlgebra);

        // Extended variant instances are instanceof both (proper subtyping)
        assert.ok(boolLit instanceof IntBoolAlgebra);
        assert.ok(boolLit instanceof IntAlgebra);
        assert.ok(iff instanceof IntBoolAlgebra);
        assert.ok(iff instanceof IntAlgebra);

        // Verify structure
        assert.strictEqual(add.left, lit1);
        assert.strictEqual(add.right, lit2);
        assert.strictEqual(iff.cond, boolLit);
        assert.strictEqual(iff.thenBranch, add);
        assert.strictEqual(iff.elseBranch, lit1);
    });

    test('Family references in extended ADT resolve to extended type', () => {
        const Base = data(({ Family }) => ({
            Base1: { value: Number },
            Base2: { ref: Family }
        }));

        const Extended = data(({ Family }) => ({
            [extend]: Base,
            Extended1: { value: String },
            Extended2: { ref: Family }
        }));

        const base1 = Extended.Base1({ value: 42 });
        const ext1 = Extended.Extended1({ value: 'hello' });

        // Extended variants should accept both base and extended instances via Family
        const ext2 = Extended.Extended2({ ref: base1 });
        const ext3 = Extended.Extended2({ ref: ext1 });

        // Extended variant instances are instanceof both (proper subtyping)
        assert.ok(ext2 instanceof Extended);
        assert.ok(ext3 instanceof Extended);
        assert.ok(ext2 instanceof Base);
        assert.ok(ext3 instanceof Base);

        assert.strictEqual(ext2.ref, base1);
        assert.strictEqual(ext3.ref, ext1);
    });

    test('deep extension (multiple levels)', () => {
        const A = data(() => ({ A1: {}, A2: {} }));
        const B = data(() => ({ [extend]: A, B1: {}, B2: {} }));
        const C = data(() => ({ [extend]: B, C1: {}, C2: {} }));

        // C should have all variants accessible
        assert.ok(C.A1);
        assert.ok(C.A2);
        assert.ok(C.B1);
        assert.ok(C.B2);
        assert.ok(C.C1);
        assert.ok(C.C2);

        // All variants accessible via C are instanceof C
        assert.ok(C.C1 instanceof C);
        assert.ok(C.C2 instanceof C);
        assert.ok(C.A1 instanceof C);
        assert.ok(C.A2 instanceof C);
        assert.ok(C.B1 instanceof C);
        assert.ok(C.B2 instanceof C);

        // C's variants are instanceof all ancestors (proper subtyping)
        assert.ok(C.C1 instanceof B);
        assert.ok(C.C1 instanceof A);

        // Variants accessed via C are instanceof C
        assert.ok(C.B1 instanceof B);
        assert.ok(C.B1 instanceof A);
        assert.ok(C.B1 instanceof C);

        // Variants accessed via C are instanceof all ancestors
        assert.ok(C.A1 instanceof A);
        assert.ok(C.A1 instanceof B);
        assert.ok(C.A1 instanceof C);

        // Original variants retain their original type
        assert.ok(A.A1 instanceof A);
        assert.ok(!(A.A1 instanceof B));
        assert.ok(!(A.A1 instanceof C));
        
        assert.ok(B.B1 instanceof B);
        assert.ok(B.B1 instanceof A);
        assert.ok(!(B.B1 instanceof C));

        // New singletons are created for each extension level
        // This allows fold overrides to work correctly
        assert.notStrictEqual(C.A1, A.A1);
        assert.notStrictEqual(C.B1, B.B1);
    });

    test('variant name collision throws error', () => {
        const Color = data(() => ({ Red: {}, Green: {} }));

        assert.throws(
            () => data(() => ({ [extend]: Color, Red: {}, Yellow: {} })),
            /Variant name collision: 'Red' already exists in base ADT/
        );
    });

    test('extension preserves property immutability', () => {
        const Color = data(() => ({ Red: {}, Green: {} }));
        const ExtendedColor = data(() => ({ [extend]: Color, Blue: {} }));

        // Properties should be non-writable
        assert.throws(() => {
            // @ts-expect-error - intentionally trying to mutate
            ExtendedColor.Blue = {};
        }, 'Should not allow mutation of variant properties');

        // Verify property descriptors
        const blueDescriptor = Object.getOwnPropertyDescriptor(ExtendedColor, 'Blue');
        assert.strictEqual(blueDescriptor?.writable, false, 'Blue property should be non-writable');
        assert.strictEqual(blueDescriptor?.configurable, true, 'Blue property should be configurable for fold extension');

        // New variant instances should be frozen
        assert.ok(Object.isFrozen(ExtendedColor.Blue));
    });

    test('mixed simple and structured variants', () => {
        const Shape = data(() => ({ Circle: { radius: Number } }));

        const ExtendedShape = data(() => ({
            [extend]: Shape,
            Square: { side: Number },
            Unknown: {}
        }));

        const square = ExtendedShape.Square({ side: 10 });
        const unknown = ExtendedShape.Unknown;

        // Extended variants are instanceof ExtendedShape and Shape (proper subtyping)
        assert.ok(square instanceof ExtendedShape);
        assert.ok(square instanceof Shape);
        assert.ok(unknown instanceof ExtendedShape);
        assert.ok(unknown instanceof Shape);
    });

    test('extension with predicates', () => {
        const isPositive = (x) =>
            typeof x === 'number' && x > 0;

        const Base = data(() => ({ Value: { amount: Number } }));

        const Extended = data(() => ({
            [extend]: Base,
            PositiveValue: { amount: isPositive }
        }));

        const posValue = Extended.PositiveValue({ amount: 10 });

        // Extended variant instance is instanceof both (proper subtyping)
        assert.ok(posValue instanceof Extended);
        assert.ok(posValue instanceof Base);

        // Should validate predicate
        assert.throws(
            () => Extended.PositiveValue({ amount: -1 }),
            /Field 'amount' failed predicate validation/
        );
    });

    test('callable without new for extended structured variants', () => {
        const Point = data(() => ({
            Point2D: { x: Number, y: Number }
        }));

        const Point3DExtended = data(() => ({
            [extend]: Point,
            Point3D: { x: Number, y: Number, z: Number }
        }));

        // Should work without 'new'
        const p3 = Point3DExtended.Point3D({ x: 1, y: 2, z: 3 });
        assert.ok(p3 instanceof Point3DExtended);

        // Should also work with 'new'
        const p3New = new Point3DExtended.Point3D({ x: 4, y: 5, z: 6 });
        assert.ok(p3New instanceof Point3DExtended);
    });

    test('extension of parameterized ADT', () => {
        const Maybe = data(({ T }) => ({
            Nothing: {},
            Just: { value: T }
        }));

        const Result = data(({ T }) => ({
            [extend]: Maybe,
            Error: { message: String, value: T }
        }));

        // Use without instantiation
        const nothing = Result.Nothing;
        const just = Result.Just({ value: 42 });
        const error = Result.Error({ message: 'Failed', value: 0 });

        // Extended variant is instanceof Result and Maybe (proper subtyping)
        assert.ok(error instanceof Result);
        assert.ok(error instanceof Maybe);

        // Inherited variants accessed via Result are instanceof Result
        assert.ok(nothing instanceof Maybe);
        assert.ok(nothing instanceof Result);
        assert.ok(just instanceof Maybe);
        assert.ok(just instanceof Result);
        
        // Original variants retain their original type
        assert.ok(Maybe.Nothing instanceof Maybe);
        assert.ok(!(Maybe.Nothing instanceof Result));
    });

    test('comprehensive example: expression language extension', () => {
        // Base expression language with integers
        const IntExpr = data(({ Family }) => ({
            IntLit: { value: Number },
            Add: { left: Family, right: Family },
            Mul: { left: Family, right: Family }
        }));

        // Extend with boolean expressions
        const IntBoolExpr = data(({ Family }) => ({
            [extend]: IntExpr,
            BoolLit: { value: Boolean },
            LessThan: { left: Family, right: Family },
            And: { left: Family, right: Family }
        }));

        // Extend further with variables
        const FullExpr = data(({ Family }) => ({
            [extend]: IntBoolExpr,
            Var: { name: String },
            Let: { name: String, value: Family, body: Family }
        }));

        // Build a complex expression: let x = 5 in x < 10
        const five = FullExpr.IntLit({ value: 5 });
        const ten = FullExpr.IntLit({ value: 10 });
        const x = FullExpr.Var({ name: 'x' });
        const lessThan = FullExpr.LessThan({ left: x, right: ten });
        const letExpr = FullExpr.Let({ name: 'x', value: five, body: lessThan });

        // FullExpr's own variants are instanceof FullExpr, IntBoolExpr, and IntExpr
        assert.ok(letExpr instanceof FullExpr);
        assert.ok(letExpr instanceof IntBoolExpr);
        assert.ok(letExpr instanceof IntExpr);

        assert.ok(x instanceof FullExpr);
        assert.ok(x instanceof IntBoolExpr);
        assert.ok(x instanceof IntExpr);

        // Variants created via FullExpr are instanceof FullExpr (proper subtyping)
        assert.ok(lessThan instanceof IntBoolExpr);
        assert.ok(lessThan instanceof IntExpr);
        assert.ok(lessThan instanceof FullExpr);

        // Variants created via FullExpr are instanceof all ancestors
        assert.ok(five instanceof IntExpr);
        assert.ok(five instanceof IntBoolExpr);
        assert.ok(five instanceof FullExpr);
        
        // Original variants retain their original types
        assert.ok(IntExpr.IntLit({ value: 1 }) instanceof IntExpr);
        assert.ok(!(IntExpr.IntLit({ value: 1 }) instanceof IntBoolExpr));
        assert.ok(!(IntExpr.IntLit({ value: 1 }) instanceof FullExpr));

        // New constructors are created for each extension level
        // This allows proper instanceof checking and fold overrides
        assert.notStrictEqual(FullExpr.IntLit, IntExpr.IntLit);

        // Verify structure
        assert.strictEqual(letExpr.name, 'x');
        assert.strictEqual(letExpr.value, five);
        assert.strictEqual(letExpr.body, lessThan);
        assert.strictEqual(lessThan.left, x);
        assert.strictEqual(lessThan.right, ten);
    });
});
