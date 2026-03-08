/**
 * AST-based migration: converts old [op]/[spec] inline object syntax to the
 * curried helpers unfold(), fold(), map(), merge().
 *
 * Uses ts-morph (TypeScript AST API) so transformations are structurally
 * precise — not fragile text/regex substitutions.
 *
 * Run:  node scripts/migrate-ops.mjs [--dry-run]
 */

import { Project, SyntaxKind } from 'ts-morph';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url)),
    root = path.resolve(__dirname, '..'),
    dryRun = process.argv.includes('--dry-run'),

    project = new Project({
        tsConfigFilePath: path.join(root, 'tsconfig.test.json'),
        skipAddingFilesFromTsConfig: false
    });

// ---- helpers ----------------------------------------------------------------

/** Returns the string literal value of a node, or null. */
function stringLiteralValue(node) {
    if (!node) return null;
    if (node.getKind() === SyntaxKind.StringLiteral) return node.getLiteralText();
    return null;
}

/**
 * Given an ObjectLiteralExpression, finds a property whose computed name is
 * the identifier `symbolName` (e.g. [op], [spec], [operations]).
 * Returns the PropertyAssignment node or undefined.
 */
function findComputedProp(objLit, symbolName) {
    return objLit.getProperties().find(p => {
        if (p.getKind() !== SyntaxKind.PropertyAssignment) return false;
        const name = p.getNameNode();
        if (name.getKind() !== SyntaxKind.ComputedPropertyName) return false;
        const expr = name.getExpression();
        return expr.getKind() === SyntaxKind.Identifier && expr.getText() === symbolName;
    });
}

/**
 * Returns all spec-metadata PropertyAssignments (e.g. `out: String`) from an
 * ObjectLiteralExpression — non-computed props whose value is NOT a function.
 * Used when there is no `[spec]` computed property.
 */
function getSpecProps(objLit) {
    return objLit.getProperties().filter(p => {
        if (p.getKind() !== SyntaxKind.PropertyAssignment) return false;
        const name = p.getNameNode();
        if (name.getKind() === SyntaxKind.ComputedPropertyName) return false;
        const init = p.getInitializer();
        if (!init) return true;
        const k = init.getKind();
        return k !== SyntaxKind.FunctionExpression && k !== SyntaxKind.ArrowFunction;
    });
}

/**
 * Returns all variant handler entries from an ObjectLiteralExpression:
 * - MethodDeclaration nodes  (e.g. `Nil() { return 0; }`)
 * - PropertyAssignment whose value is a FunctionExpression or ArrowFunction
 */
function getHandlerProps(objLit) {
    const isFnValue = init => {
        if (!init) return false;
        const k = init.getKind();
        return k === SyntaxKind.FunctionExpression || k === SyntaxKind.ArrowFunction;
    };
    return objLit.getProperties().filter(p => {
        if (p.getKind() === SyntaxKind.MethodDeclaration) return true;
        if (p.getKind() !== SyntaxKind.PropertyAssignment) return false;
        const name = p.getNameNode();
        if (name.getKind() === SyntaxKind.ComputedPropertyName) return false;
        return isFnValue(p.getInitializer());
    });
}

// ---- determine which helpers are needed in each file -----------------------

const neededHelpers = new Map(); // sourceFile path -> Set<string>

function markHelper(sf, name) {
    const p = sf.getFilePath();
    if (!neededHelpers.has(p)) neededHelpers.set(p, new Set());
    neededHelpers.get(p).add(name);
}

// ---- collect all transformations (two-pass: collect then apply) -------------

const sourceFiles = project.getSourceFiles().filter(sf => {
    const fp = sf.getFilePath();
    return (fp.includes('/src/tests/') || fp.includes('/examples/')) &&
           (fp.endsWith('.mts') || fp.endsWith('.mjs'));
});

console.log(`Processing ${sourceFiles.length} source files...`);

let totalTransformed = 0;

for (const sf of sourceFiles) {
    const filePath = path.relative(root, sf.getFilePath()),

        // Collect all object literals that have [op] computed property.
        // We gather them all first because we'll mutate bottom-up (deepest first)
        // to avoid position invalidation.
        candidates = [];

    sf.forEachDescendant(node => {
        if (node.getKind() !== SyntaxKind.ObjectLiteralExpression) return;
        const opProp = findComputedProp(node, 'op');
        if (!opProp) return;
        const opKind = stringLiteralValue(opProp.getInitializerOrThrow());
        if (!opKind) return;
        candidates.push({ node, opKind, pos: node.getPos() });
    });

    if (candidates.length === 0) continue;

    // Sort deepest (highest pos) first so mutations don't invalidate earlier positions
    candidates.sort((a, b) => b.pos - a.pos);

    let fileChanged = false;

    for (const { node, opKind } of candidates) {
        // Re-fetch the node by position since prior mutations may have changed things —
        // actually we work bottom-up so earlier positions are stable. The node reference
        // itself is still valid within the same pass since ts-morph keeps the tree alive.

        let replacement = null;

        if (opKind === 'unfold' || opKind === 'fold') {
            const specProp = findComputedProp(node, 'spec');
            let specText;
            if (specProp) 
                specText = specProp.getInitializerOrThrow().getText();
            else {
                // No [spec] computed prop — collect regular PropertyAssignments as spec
                const specProps = getSpecProps(node);
                specText = specProps.length === 0
                    ? '{}'
                    : `{ ${specProps.map(p => p.getText()).join(', ')} }`;
            }
            const handlers = getHandlerProps(node);

            if (handlers.length === 0) {
                // No method handlers — just an empty handlers object
                replacement = `${opKind}(${specText})({})`;
            } else {
                const handlerLines = handlers.map(h => '    ' + h.getText()).join(',\n');
                replacement = `${opKind}(${specText})({\n${handlerLines}\n})`;
            }
            markHelper(sf, opKind);

        } else if (opKind === 'map') {
            const specProp = findComputedProp(node, 'spec');
            let specText;
            if (specProp) 
                specText = specProp.getInitializerOrThrow().getText();
            else {
                const specProps = getSpecProps(node);
                specText = specProps.length === 0
                    ? '{}'
                    : `{ ${specProps.map(p => p.getText()).join(', ')} }`;
            }
            const handlers = getHandlerProps(node);

            if (handlers.length === 0)
                replacement = `map(${specText})({})`;
            else {
                const handlerLines = handlers.map(h => '    ' + h.getText()).join(',\n');
                replacement = `map(${specText})({\n${handlerLines}\n})`;
            }
            markHelper(sf, 'map');

        } else if (opKind === 'merge') {
            const opsProp = findComputedProp(node, 'operations');
            if (!opsProp) {
                console.warn(`  [WARN] merge without [operations] in ${filePath}`);
                continue;
            }
            const opsInit = opsProp.getInitializerOrThrow();
            // Should be an ArrayLiteralExpression of string literals
            if (opsInit.getKind() !== SyntaxKind.ArrayLiteralExpression) {
                console.warn(`  [WARN] merge [operations] is not an array literal in ${filePath}`);
                continue;
            }
            const opNames = opsInit.getElements()
                .map(el => stringLiteralValue(el))
                .filter(Boolean);
            // opNames may be empty (e.g. testing validation of empty merge list)
            replacement = `merge(${opNames.map(n => `'${n}'`).join(', ')})`;
            markHelper(sf, 'merge');

        } else {
            console.warn(`  [WARN] Unknown op kind '${opKind}' in ${filePath}`);
            continue;
        }

        if (dryRun) 
            console.log(`  [DRY] ${filePath}: ${opKind} → ${replacement.slice(0, 60)}...`);
        else 
            node.replaceWithText(replacement);
        
        fileChanged = true;
        totalTransformed++;
    }

    if (fileChanged) 
        console.log(`  ✓ ${filePath} (${candidates.length} operations)`);
    
}

// ---- update imports in each transformed file --------------------------------

if (!dryRun) {
    for (const [filePath, helpers] of neededHelpers) {
        const sf = project.getSourceFile(filePath);
        if (!sf) continue;

        // Find the import declaration that imports from '../index.mjs' or similar
        const importDecl = sf.getImportDeclarations().find(d => {
            const mod = d.getModuleSpecifierValue();
            return mod.includes('index');
        });

        if (!importDecl) {
            console.warn(`  [WARN] No index import found in ${path.relative(root, filePath)}`);
            continue;
        }

        const named = importDecl.getNamedImports(),
            existing = new Set(named.map(n => n.getName()));

        for (const helper of helpers) {
            if (!existing.has(helper)) 
                importDecl.addNamedImport(helper);
            
        }
    }

    await project.save();
    console.log(`\nMigration complete. Transformed ${totalTransformed} operations across ${neededHelpers.size} files.`);
} else 
    console.log(`\n[DRY RUN] Would transform ${totalTransformed} operations across ${neededHelpers.size} files.`);

