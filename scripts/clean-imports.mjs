/**
 * Removes named imports (op, spec, operations) that are no longer used
 * after the op/spec → helpers migration.
 *
 * Uses ts-morph to find all references. If a named import has zero references
 * outside of the import statement itself, it is removed.
 *
 * Run: node scripts/clean-imports.mjs [--dry-run]
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
    }),

    SYMBOLS_TO_CLEAN = new Set(['op', 'spec', 'operations']),

    sourceFiles = project.getSourceFiles().filter(sf => {
        const fp = sf.getFilePath();
        return (fp.includes('/src/tests/') || fp.includes('/examples/')) &&
           (fp.endsWith('.mts') || fp.endsWith('.mjs'));
    });

console.log(`Scanning ${sourceFiles.length} files...`);
let totalRemoved = 0;

for (const sf of sourceFiles) {
    const filePath = path.relative(root, sf.getFilePath()),
        removed = [];

    for (const importDecl of sf.getImportDeclarations()) {
        // Collect which named imports to remove (process in reverse to keep indices stable)
        const toRemove = [];

        for (const named of importDecl.getNamedImports()) {
            const name = named.getAliasNode()?.getText() ?? named.getNameNode().getText();
            if (!SYMBOLS_TO_CLEAN.has(name)) continue;

            // Check if this name is referenced anywhere outside the import declaration
            const refs = sf.getDescendantsOfKind(SyntaxKind.Identifier)
                .filter(id => id.getText() === name)
                .filter(id => {
                    // Exclude the identifier inside the import declaration itself
                    let parent = id.getParent();
                    while (parent) {
                        if (parent === importDecl) return false;
                        parent = parent.getParent?.();
                    }
                    return true;
                });

            if (refs.length === 0) {
                toRemove.push(named);
                removed.push(name);
            }
        }

        if (toRemove.length > 0 && !dryRun) {
            for (const named of toRemove) 
                named.remove();
            
            // If the import declaration now has no named imports and no default/namespace, remove it
            const afterRemove = importDecl.getNamedImports();
            if (afterRemove.length === 0 &&
                !importDecl.getDefaultImport() &&
                !importDecl.getNamespaceImport()) 
                importDecl.remove();
            
        }
    }

    if (removed.length > 0) {
        console.log(`  ${dryRun ? '[DRY]' : '✓'} ${filePath}: removed ${removed.join(', ')}`);
        totalRemoved += removed.length;
    }
}

if (!dryRun) 
    await project.save();


console.log(`\n${dryRun ? '[DRY RUN] Would remove' : 'Removed'} ${totalRemoved} unused imports across ${sourceFiles.length} files.`);
