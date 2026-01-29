import { data } from '@lapis-lang/lapis-js';

// Parameterized Stack ADT with all operations defined inline
const Stack = data(({ Family, T }) => ({
    Empty: {},
    Push: { value: T, rest: Family(T) },
    size: {
        op: 'fold',
        spec: { out: Number },
        Empty() { return 0; },
        Push({ rest }) { return 1 + rest; }
    },
    peek: {
        op: 'fold',
        spec: {},
        Empty() { return null; },
        Push({ value }) { return value; }
    },
    pop: {
        op: 'fold',
        spec: {},
        Empty() { return null; },
        Push() {
            // FIXME: Access raw field values via 'this' to avoid recursion
            return [this.value, this.rest];
        }
    },
    toArray: {
        op: 'fold',
        spec: { out: Array },
        Empty() { return []; },
        Push({ value, rest }) { return [value, ...rest]; }
    },
    show: {
        op: 'fold',
        spec: { out: String },
        Empty() { return 'Stack[]'; },
        Push({ value, rest }) {
            const arr = rest === 'Stack[]' ? [] : rest.slice(6, -1).split(', ');
            return `Stack[${[value, ...arr].join(', ')}]`;
        }
    },
    contains: {
        op: 'fold',
        spec: { out: Boolean },
        Empty() { return false; },
        Push({ value, rest }) {
            // FIXME: The 'this' context gives us access to the search value
            return value === this.searchValue || rest;
        }
    },
    FromArray: {
        op: 'unfold',
        spec: { in: Array, out: Family },
        Empty: (arr) => (arr.length === 0 ? {} : null),
        Push: (arr) => (arr.length > 0 ? { value: arr[0], rest: arr.slice(1) } : null)
    }
}));

// Instantiate for numbers
const NumStack = Stack(Number);

console.log('=== Stack ADT Example ===\n');

// Manual construction
console.log('Manual construction (push operations):');
const { Empty, Push } = NumStack;
const stack1 = Push({ value: 1, rest: Empty });
const stack2 = Push({ value: 2, rest: stack1 });
const stack3 = Push({ value: 3, rest: stack2 });

console.log(`stack1 = ${stack1.show}`);
console.log(`stack2 = ${stack2.show}`);
console.log(`stack3 = ${stack3.show}`);

// Operations
console.log('\nStack operations:');
console.log(`stack3.size = ${stack3.size}`);
console.log(`stack3.peek = ${stack3.peek}`);
const [poppedValue, restStack] = stack3.pop || [];
console.log(`stack3.pop = [${poppedValue}, ${restStack ? restStack.show : 'undefined'}]`);
console.log(`stack3.toArray = [${stack3.toArray}]`);

console.log('\nPop sequence using pop operation:');
let current = stack3;
let step = 1;
while (current && current.size > 0) {
    const popResult = current.pop;
    if (popResult) {
        const [val, rest] = popResult;
        console.log(`Step ${step}: popped value = ${val}, remaining = ${rest ? rest.show : 'Empty'}`);
        current = rest;
    }
    step++;
}
console.log(`Step ${step}: Empty stack`);

// Unfold from array
console.log('\nConstruction from array:');
const stackFromArray = NumStack.FromArray([10, 20, 30, 40, 50]);
console.log(`FromArray([10, 20, 30, 40, 50]) = ${stackFromArray.show}`);
console.log(`size = ${stackFromArray.size}`);
console.log(`peek = ${stackFromArray.peek}`);
console.log(`toArray = [${stackFromArray.toArray}]`);

// Type checking
console.log('\nType checking:');
console.log(`stack3 instanceof Stack(Number): ${stack3 instanceof NumStack}`);
console.log(`Empty instanceof Stack(Number): ${Empty instanceof NumStack}`);

// String stack
console.log('\n=== String Stack ===');
const StrStack = Stack(String);
const strStack = StrStack.FromArray(['first', 'second', 'third']);

console.log(`strStack = ${strStack.show}`);
console.log(`strStack.size = ${strStack.size}`);
console.log(`strStack.peek = ${strStack.peek}`);
console.log(`strStack.toArray = [${strStack.toArray.map(s => `"${s}"`).join(', ')}]`);

// Building a stack incrementally
console.log('\n=== Incremental Building ===');
let myStack = Empty;
console.log(`Initial: ${myStack.show}`);

myStack = Push({ value: 100, rest: myStack });
console.log(`After push(100): ${myStack.show}`);

myStack = Push({ value: 200, rest: myStack });
console.log(`After push(200): ${myStack.show}`);

myStack = Push({ value: 300, rest: myStack });
console.log(`After push(300): ${myStack.show}`);

console.log(`\nFinal stack size: ${myStack.size}`);
console.log(`Top element: ${myStack.peek}`);
