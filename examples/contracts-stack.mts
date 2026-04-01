/**
 * Stack with full Design by Contract support:
 * - demands (preconditions)
 * - ensures (postconditions)
 * - rescue (structured recovery with retry)
 * - continuous invariants
 */
import { data, invariant } from '@lapis-lang/lapis-js';

const Stack = data(({ family }) => ({
    Empty: {},
    Push: {
        [invariant]: (self: { size: number }) => self.size >= 0,
        value: Object,
        rest: family
    }
})).ops(({ fold, unfold, family }) => ({
    size: fold({ out: Number })({
        Empty() { return 0; },
        Push({ rest }: any) { return 1 + rest; }
    }),
    pop: fold({
        out: Array,
        demands: (self: { size: number }) => self.size > 0,
        ensures: (_self: unknown, _old: unknown, result: unknown[]) =>
            Array.isArray(result) && result.length === 2
    })({
        Empty() { throw new TypeError('Cannot pop empty stack'); },
        Push() { return [this.value, this.rest]; }
    }),
    peek: fold({
        demands: (self: { size: number }) => self.size > 0
    })({
        Empty() { return null; },
        Push({ value }) { return value; }
    }),
    append: fold({
        in: Object,
        out: family,
        demands: (_self: unknown, val: unknown) => val !== undefined && val !== null,
        ensures: (_self: { size: number }, old: { size: number }, result: { size: number }) =>
            result.size === old.size + 1,
        rescue: (_self: unknown, _error: unknown, _args: unknown[], retry: (...args: unknown[]) => unknown) => {
            // Structured recovery: retry with a default value of 0
            console.log('  [rescue] append failed, retrying with default value 0');
            return retry(0);
        }
    })({
        Empty({}, val) { return (family as any).Push({ value: val, rest: (family as any).Empty }); },
        Push({ rest }: any, val: unknown) {
            return (family as any).Push({ value: this.value, rest: rest(val) });
        }
    }),
    toArray: fold({
        out: Array,
        ensures: (_self: unknown, _old: unknown, result: unknown[]) => Array.isArray(result)
    })({
        Empty() { return []; },
        Push({ value, rest }: any) { return [value, ...rest]; }
    }),
    FromArray: unfold({
        in: Array,
        out: family,
        demands: (_self: unknown, arr: unknown) => Array.isArray(arr)
    })({
        Empty: (arr) => (arr.length === 0 ? {} : null),
        Push: (arr) => (arr.length > 0 ? { value: arr[0], rest: arr.slice(1) } : null)
    })
}));

const NumStack = Stack;

console.log('=== Contracts: Stack Example ===\n');

// --- Demands ---
console.log('1. Demands (preconditions):');
const { Empty, Push } = NumStack,
    stack = Push({ value: 3, rest: Push({ value: 2, rest: Push({ value: 1, rest: Empty }) }) });

console.log(`   stack.peek = ${stack.peek}`);

try {
    console.log('   Attempting Empty.pop...');
    void Empty.pop;
} catch (e) {
    console.log(`   Caught: ${(e as Error).name}: ${(e as Error).message}`);
}

try {
    console.log('   Attempting Empty.peek...');
    void Empty.peek;
} catch (e) {
    console.log(`   Caught: ${(e as Error).name}: ${(e as Error).message}`);
}

// --- Ensures ---
console.log('\n2. Ensures (postconditions):');
const arr = stack.toArray;
console.log(`   stack.toArray = [${arr}] (Array.isArray? ${Array.isArray(arr)})`);

const [val, rest] = stack.pop;
console.log(`   stack.pop = [${val}, <stack of size ${(rest as { size: number }).size}>]`);

// --- Rescue + Retry ---
console.log('\n3. Rescue + Retry:');
const appended = stack.append(10);
console.log(`   stack.append(10).toArray = [${appended.toArray}]`);

// --- Unfold with demands ---
console.log('\n4. Unfold with demands:');
const fromArr = NumStack.FromArray([10, 20, 30]);
console.log(`   FromArray([10,20,30]).toArray = [${fromArr.toArray}]`);

try {
    console.log('   Attempting FromArray("not an array")...');
    NumStack.FromArray('not an array' as unknown as unknown[]);
} catch (e) {
    console.log(`   Caught: ${(e as Error).name}: ${(e as Error).message}`);
}

console.log('\n=== Done ===');
