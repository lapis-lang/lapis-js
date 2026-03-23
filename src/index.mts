export { parent } from './Data.mjs';
export { invariant } from './Data.mjs';
export { extend } from './Data.mjs';
export { data } from './Data.mjs';
export { TypeArgsSymbol, FamilyRefSymbol, aux } from './Data.mjs';
export type { FamilyMarker, FoldCtxSymbolKeys } from './Data.mjs';
export { protocol } from './Protocol.mjs';
export { satisfies } from './operations.mjs';
export type { ProtocolLike, ProtocolEntry, ConditionalConformance, ProtocolDeclContext, FoldSpecEntry, MethodFoldSpecEntry, GetterFoldSpecEntry, UnfoldSpecEntry, MapSpecEntry, ProtocolOps } from './Protocol.mjs';
export { op, spec, operations, history, sort } from './operations.mjs';
export { DeclBrand, isSort } from './types.mjs';
export { unfold, fold, map, merge, aliasesSymbol } from './ops.mjs';
export type { UnfoldDef, UnfoldDefBase, FoldDef, FoldDefBase, MapDef, MapDefBase, MergeDef, ExpandAliases, AliasesSymbol, HasAliases } from './ops.mjs';
export { behavior } from './Behavior.mjs';

// ---- InstanceOf -------------------------------------------------------------

import type { ProtocolLike } from './Protocol.mjs';
import type { InstanceOf as DataInstanceOf } from './ops.mjs';

/**
 * Extracts the TypeScript type associated with a Lapis value declarator.
 *
 * - For a **protocol** (`P extends ProtocolLike<Ops>`), resolves to the
 *   instance-side shape inferred from the protocol declaration:
 *   ```ts
 *   type MonoidConformer = InstanceOf<typeof Monoid>;
 *   // => { combine: (other: unknown) => unknown; Identity: unknown }
 *   ```
 *
 * - For a **data ADT constructor** (`C`), resolves to the runtime instance type
 *   produced by that constructor (the existing behavior):
 *   ```ts
 *   type NumberInstance = InstanceOf<NumberConstructor>; // => number
 *   ```
 */
export type InstanceOf<T> = T extends ProtocolLike<infer Ops> ? Ops : DataInstanceOf<T>;
export { createTransformer, composeTransformers, composeMultipleTransformers } from './DataOps.mjs';
export { createObserver, composeObservers, composeMultipleObservers, createFoldObserver, behaviorObservers } from './BehaviorOps.mjs';

// Design by Contract exports
export { DemandsError, EnsuresError, InvariantError, AssertionError, assert, implies, iff } from './contracts.mjs';
export type { ContractSpec } from './contracts.mjs';

// Type exports
export type { DataADT, DataADTWithParams, DataADTIsSort, DataADTDeclBrand, BehaviorADT, BehaviorADTWithParams, BehaviorADTDeclBrand, QueryADT, DataDeclParams, BehaviorDeclParams, Letter, SortLetter, CollectParams } from './types.mjs';
export type { TypeSpec, FamilyRef, SelfRef, TypeParamRef, SortRef } from './types.mjs';

// Module system exports
export { module, system, validateMealyMachine } from './Module.mjs';
export type { ModuleSpec, ModuleDef, MealyMachine, LapisValue } from './Module.mjs';

// Utility exports
export { structuralEquals } from './utils.mjs';

// Relation / Allegory exports
export { relation, origin, destination } from './Relation.mjs';

// Query / Coalgebraic dual of Relation
export { query, output, done, accept } from './Query.mjs';
