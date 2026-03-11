/**
 * Stack with full Design by Contract support:
 * - demands (preconditions)
 * - ensures (postconditions)
 * - rescue (structured recovery with retry)
 * - continuous invariants
 * - checked mode toggle
 */
import { data, fold, unfold, invariant, checkedMode } from '@lapis-lang/lapis-js';

// Ensure checked mode is on for demonstrations
checkedMode(true);

const Stack = data(({ Family, T }) => ({
    Empty: {},
    Push: {
        [invariant]: (self: { size: number }) => self.size >= 0,
        value: T,
        rest: Family(T)
    },

    // Basic size fold — no contracts needed
    size: fold({ out: Number })({
        Empty() { return 0; },
        Push({ rest }: { rest: number }) { return 1 + rest; }
    }),

    // pop: demands non-empty, ensures result size is one less
    pop: fold({
        out: Array,
        demands: (self: { size: number }) => self.size > 0,
        ensures: (_self: unknown, _old: unknown, result: unknown[]) =>
            Array.isArray(result) && result.length === 2
    })({
        Empty() { throw new TypeError('Cannot pop empty stack'); },
        Push() { return [this.value, this.rest]; }
    }),

    // peek: demands non-empty
    peek: fold({
        demands: (self: { size: number }) => self.size > 0
    })({
        Empty() { return null; },
        Push({ value }: { value: unknown }) { return value; }
    }),

    // append: demands value is defined, ensures size increases by 1
    append: fold({
        in: T,
        out: Family,
        demands: (_self: unknown, val: unknown) => val !== undefined && val !== null,
        ensures: (_self: { size: number }, old: { size: number }, result: { size: number }) =>
            result.size === old.size + 1,
        rescue: (_self: unknown, _error: unknown, _args: unknown[], retry: (...args: unknown[]) => unknown) => {
            // Structured recovery: retry with a default value of 0
            console.log('  [rescue] append failed, retrying with default value 0');
            return retry(0);
        }
    })({
        // Fold handlers use Family(T) to construct instances of the current
        // parameterized ADT without hardcoding type arguments.
        // @ts-expect-error -- Family(T) resolves at runtime via Proxy; TS cannot model variant properties on FamilyRefCallable
        Empty({}, val: unknown) { return Family(T).Push({ value: val, rest: Family(T).Empty }); },
        // @ts-expect-error -- Family(T) resolves at runtime via Proxy; TS cannot model variant properties on FamilyRefCallable
        Push({ rest }: { rest: (val: unknown) => unknown }, val: unknown) {
            // @ts-expect-error -- Family(T) resolves at runtime via Proxy
            return Family(T).Push({ value: this.value, rest: rest(val) });
        }
    }),

    // toArray: straightforward fold with ensures on return type
    toArray: fold({
        out: Array,
        ensures: (_self: unknown, _old: unknown, result: unknown[]) => Array.isArray(result)
    })({
        Empty() { return []; },
        Push({ value, rest }: { value: unknown; rest: unknown[] }) { return [value, ...rest]; }
    }),

    // FromArray: unfold with demands that input is a valid array
    FromArray: unfold({
        in: Array,
        out: Family,
        demands: (_self: unknown, arr: unknown) => Array.isArray(arr)
    })({
        Empty: (arr: unknown[]) => (arr.length === 0 ? {} : null),
        Push: (arr: unknown[]) => (arr.length > 0 ? { value: arr[0], rest: arr.slice(1) } : null)
    })
}));

const NumStack = Stack({ T: Number });

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

// --- Checked Mode ---
console.log('\n5. Checked Mode toggle:');
console.log(`   checkedMode() = ${checkedMode()}`);

checkedMode(false);
console.log(`   checkedMode(false) → ${checkedMode()}`);
console.log('   Empty.peek with checked mode off:');
try {
    const result = Empty.peek;
    console.log(`   Result: ${result} (no DemandsError thrown)`);
} catch (e) {
    console.log(`   Caught: ${(e as Error).message}`);
}

// Restore checked mode
checkedMode(true);
console.log(`   checkedMode(true) → ${checkedMode()}\n`);

console.log('=== Done ===');
