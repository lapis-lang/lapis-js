export { parent } from './Data.mjs';
export { invariant } from './Data.mjs';
export { extend } from './Data.mjs';
export { data } from './Data.mjs';
export { aux } from './Data.mjs';
export { DataAny } from './Data.mjs';
export { BehaviorAny } from './Behavior.mjs';
export { Any, Nothing } from './operations.mjs';
export type { FamilyMarker, FoldCtxSymbolKeys } from './Data.mjs';
export { protocol } from './Protocol.mjs';
export { satisfies } from './operations.mjs';
export type { ProtocolLike, ProtocolEntry, ProtocolDeclContext, FoldSpecEntry, MethodFoldSpecEntry, GetterFoldSpecEntry, UnfoldSpecEntry, MapSpecEntry, ProtocolOps } from './Protocol.mjs';
export { op, spec, operations, history } from './operations.mjs';
export type { OperationProperty, NamespacedProperty, PredicateFn, PropertyEntry } from './operations.mjs';
export { KNOWN_PROPERTIES, INTER_OP_PREFIXES } from './operations.mjs';
export { DeclBrand } from './types.mjs';
export { unfold, fold, map, merge, scan } from './operations.mjs';
export type { UnfoldDef, UnfoldDefBase, FoldDef, FoldDefBase, MapDef, MapDefBase, MergeDef, ScanDef, ExpandAliases, HasAliases } from './operations.mjs';
export { behavior } from './Behavior.mjs';

// ---- InstanceOf -------------------------------------------------------------

import type { ProtocolLike } from './Protocol.mjs';
import type { InstanceOf as DataInstanceOf } from './operations.mjs';

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

// Algebraic law enforcement exports
export { LawError } from './laws.mjs';

// Type exports
export type { DataADT, DataADTWithParams, DataADTDeclBrand, BehaviorADT, BehaviorADTWithParams, BehaviorADTDeclBrand, QueryADT, DataDeclParams, BehaviorDeclParams } from './types.mjs';
export type { TypeSpec, FamilyRef, SelfRef } from './types.mjs';

// Module system exports
export { module, system, validateMealyMachine } from './Module.mjs';
export type { ModuleSpec, ModuleDef, MealyMachine, LapisValue } from './Module.mjs';

// Utility exports
export { structuralEquals } from './utils.mjs';

// Relation / Allegory exports
export { relation, origin, destination } from './Relation.mjs';

// Query / Coalgebraic dual of Relation
export { query, output, done, accept } from './Query.mjs';
