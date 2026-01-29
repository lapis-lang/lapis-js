/**
 * Codata Examples - Rose Trees (Lazy Multi-way Trees)
 *
 * Rose trees are trees where each node can have an arbitrary number of children.
 * Using codata, we can create lazy rose trees where children are generated on demand.
 */

import { codata } from '../src/index.mjs';

// =============================================================================
// Example 1: Basic Rose Tree with Lazy Children
// =============================================================================

const RoseTree = codata(({ Self }) => ({
    value: Number,
    children: Array,  // Array of child trees
    Node: {
        op: 'unfold',
        spec: { in: { value: Number, childGen: Function }, out: Self },
        value: ({ value }) => value,
        children: ({ value, childGen }) => {
            const childValues = childGen(value);
            return childValues.map(v => RoseTree.Node({ value: v, childGen }));
        }
    },
    Leaf: {
        op: 'unfold',
        spec: { in: Number, out: Self },
        value: (n) => n,
        children: () => []
    }
}));

console.log('\n=== Basic Rose Tree ===');

// Tree where each node spawns children n*2 and n*2+1
const tree = RoseTree.Node({
    value: 1,
    childGen: (n) => [n * 2, n * 2 + 1]
});

console.log('tree.value:', tree.value);                        // 1
console.log('tree.children.length:', tree.children.length);    // 2
console.log('tree.children[0].value:', tree.children[0].value); // 2
console.log('tree.children[1].value:', tree.children[1].value); // 3
console.log('tree.children[0].children[0].value:', tree.children[0].children[0].value); // 4
console.log('tree.children[0].children[1].value:', tree.children[0].children[1].value); // 5

// Leaf node
const leaf = RoseTree.Leaf(42);
console.log('\nleaf.value:', leaf.value);                      // 42
console.log('leaf.children.length:', leaf.children.length);    // 0

// =============================================================================
// Example 2: N-ary Tree (Variable Number of Children)
// =============================================================================

const NaryTree = codata(({ Self }) => ({
    value: Number,
    children: Array,
    Create: {
        op: 'unfold',
        spec: { in: { value: Number, arity: Number }, out: Self },
        value: ({ value }) => value,
        children: ({ value, arity }) => {
            const result = [];
            for (let i = 0; i < arity; i++) {
                result.push(NaryTree.Create({
                    value: value * 10 + i,
                    arity: arity
                }));
            }
            return result;
        }
    }
}));

console.log('\n=== N-ary Tree (3 children per node) ===');

const ternary = NaryTree.Create({ value: 1, arity: 3 });
console.log('ternary.value:', ternary.value);                  // 1
console.log('ternary.children.length:', ternary.children.length); // 3
console.log('Children values:', ternary.children.map(c => c.value)); // [10, 11, 12]
console.log('Grandchildren of first child:',
    ternary.children[0].children.map(c => c.value)); // [100, 101, 102]

// =============================================================================
// Example 3: Directory Tree (File System)
// =============================================================================

const FileTree = codata(({ Self }) => ({
    name: String,
    isDirectory: Boolean,
    children: Array,
    size: Number,
    Directory: {
        op: 'unfold',
        spec: { in: { name: String, contents: Array }, out: Self },
        name: ({ name }) => name,
        isDirectory: () => true,
        children: ({ contents }) => contents,
        size: ({ contents }) => {
            return contents.reduce((sum, child) => sum + child.size, 0);
        }
    },
    File: {
        op: 'unfold',
        spec: { in: { name: String, size: Number }, out: Self },
        name: ({ name }) => name,
        isDirectory: () => false,
        children: () => [],
        size: ({ size }) => size
    }
}));

console.log('\n=== File System Tree ===');

const root = FileTree.Directory({
    name: 'root',
    contents: [
        FileTree.File({ name: 'readme.txt', size: 1024 }),
        FileTree.Directory({
            name: 'src',
            contents: [
                FileTree.File({ name: 'index.js', size: 2048 }),
                FileTree.File({ name: 'utils.js', size: 512 })
            ]
        }),
        FileTree.File({ name: 'package.json', size: 256 })
    ]
});

console.log('root.name:', root.name);                          // 'root'
console.log('root.isDirectory:', root.isDirectory);            // true
console.log('root.children.length:', root.children.length);    // 3
console.log('root.size:', root.size);                          // 3840 (sum of all files)

console.log('\nDirectory contents:');
root.children.forEach(child => {
    console.log(`  ${child.name} (${child.isDirectory ? 'dir' : 'file'}, ${child.size} bytes)`);
});

// =============================================================================
// Example 4: Game Tree (Tic-Tac-Toe Moves)
// =============================================================================

const GameTree = codata(({ Self }) => ({
    state: String,
    isTerminal: Boolean,
    moves: Array,  // Array of possible next states
    Create: {
        op: 'unfold',
        spec: { in: { state: String, moveGen: Function }, out: Self },
        state: ({ state }) => state,
        isTerminal: ({ state, moveGen }) => {
            const nextStates = moveGen(state);
            return nextStates.length === 0;
        },
        moves: ({ state, moveGen }) => {
            const nextStates = moveGen(state);
            return nextStates.map(s => GameTree.Create({ state: s, moveGen }));
        }
    }
}));

console.log('\n=== Game Tree (Simple Example) ===');

// Simple game: subtract 1, 2, or 3 from a number. Goal: reach 0
const gameState = GameTree.Create({
    state: '5',
    moveGen: (state) => {
        const n = parseInt(state);
        if (n <= 0) return [];
        const moves = [];
        if (n >= 1) moves.push(String(n - 1));
        if (n >= 2) moves.push(String(n - 2));
        if (n >= 3) moves.push(String(n - 3));
        return moves;
    }
});

console.log('gameState.state:', gameState.state);              // '5'
console.log('gameState.isTerminal:', gameState.isTerminal);    // false
console.log('gameState.moves.length:', gameState.moves.length); // 3
console.log('Possible moves from 5:', gameState.moves.map(m => m.state)); // ['4', '3', '2']

// =============================================================================
// Example 5: Factor Tree (Prime Factorization)
// =============================================================================

const FactorTree = codata(({ Self }) => ({
    value: Number,
    isPrime: Boolean,
    factors: Array,  // Empty if prime, otherwise [left, right] factors
    Create: {
        op: 'unfold',
        spec: { in: Number, out: Self },
        value: (n) => n,
        isPrime: (n) => {
            if (n < 2) return false;
            if (n === 2) return true;
            if (n % 2 === 0) return false;
            for (let i = 3; i <= Math.sqrt(n); i += 2) {
                if (n % i === 0) return false;
            }
            return true;
        },
        factors: (n) => {
            if (n < 2) return [];

            // Check if prime
            for (let i = 2; i <= Math.sqrt(n); i++) {
                if (n % i === 0) {
                    // Found a factor - create child nodes
                    return [
                        FactorTree.Create(i),
                        FactorTree.Create(n / i)
                    ];
                }
            }
            // Prime - no factors
            return [];
        }
    }
}));

console.log('\n=== Factor Tree ===');

const factor24 = FactorTree.Create(24);
console.log('24 isPrime:', factor24.isPrime);                  // false
console.log('24 factors:', factor24.factors.map(f => f.value)); // [2, 12]
console.log('12 factors:', factor24.factors[1].factors.map(f => f.value)); // [2, 6]

const factor17 = FactorTree.Create(17);
console.log('\n17 isPrime:', factor17.isPrime);                // true
console.log('17 factors:', factor17.factors);                  // []

// =============================================================================
// Example 6: Expression Tree with Lazy Evaluation
// =============================================================================

const ExprTree = codata(({ Self }) => ({
    type: String,
    value: Number,
    children: Array,
    Constant: {
        op: 'unfold',
        spec: { in: Number, out: Self },
        type: () => 'const',
        value: (n) => n,
        children: () => []
    },
    Add: {
        op: 'unfold',
        spec: { in: { left: Number, right: Number }, out: Self },
        type: () => 'add',
        value: ({ left, right }) => left + right,
        children: ({ left, right }) => [
            ExprTree.Constant(left),
            ExprTree.Constant(right)
        ]
    },
    Multiply: {
        op: 'unfold',
        spec: { in: { left: Number, right: Number }, out: Self },
        type: () => 'mul',
        value: ({ left, right }) => left * right,
        children: ({ left, right }) => [
            ExprTree.Constant(left),
            ExprTree.Constant(right)
        ]
    }
}));

console.log('\n=== Expression Tree ===');

const expr = ExprTree.Multiply({ left: 3, right: 4 });
console.log('expr.type:', expr.type);                          // 'mul'
console.log('expr.value:', expr.value);                        // 12
console.log('expr.children:', expr.children.map(c => c.value)); // [3, 4]

const complexExpr = ExprTree.Add({
    left: ExprTree.Multiply({ left: 2, right: 3 }).value,
    right: ExprTree.Constant(4).value
});
console.log('complexExpr.value:', complexExpr.value);          // 10 (2*3 + 4)

console.log('\n=== All examples completed ===\n');
