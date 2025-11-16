/**
 * A multi-key map that supports both object and primitive keys for object pooling.
 * Uses WeakMap for object keys (allows garbage collection) and Map for primitive keys.
 * Enables strict equality for structurally equivalent variant instances.
 * 
 * Implementation note: This uses a hybrid approach where objects use WeakMap (for GC)
 * and primitives use regular Map. The Map structure is nested, so when the entire
 * MultiKeyWeakMap becomes unreachable, all nested Maps are garbage collected together.
 */
export class MultiKeyWeakMap {
    // Root map - can be either WeakMap (for object keys) or Map (for primitive keys)
    #root: WeakMap<object, any> | Map<any, any> = new Map();

    /**
     * Determines if a key is a primitive (needs Map) or object (can use WeakMap)
     */
    #isPrimitive(key: any): boolean {
        const type = typeof key;
        return key === null || key === undefined || 
               type === 'number' || type === 'string' || type === 'boolean' ||
               type === 'bigint' || type === 'symbol';
    }

    /**
     * Gets a value from the map using multiple keys.
     * @param keys Array of keys to traverse
     * @returns The stored value or undefined if not found
     */
    get(...keys: any[]): any | undefined {
        if (keys.length === 0) return undefined;
        
        let current: WeakMap<object, any> | Map<any, any> = this.#root;
        
        for (let i = 0; i < keys.length - 1; i++) {
            const next = current.get(keys[i]);
            if (next === undefined) return undefined;
            current = next;
        }
        
        // Last key retrieves the stored value
        return current.get(keys[keys.length - 1]);
    }

    /**
     * Stores a value in the map using multiple keys.
     * Creates nested Maps/WeakMaps based on key types.
     * @param keys Array of keys followed by the value to store
     */
    set(...keys: any[]): void {
        if (keys.length < 2) {
            throw new TypeError('MultiKeyWeakMap.set requires at least one key and a value');
        }
        
        const value = keys[keys.length - 1];
        const keyPath = keys.slice(0, -1);
        
        let current: WeakMap<object, any> | Map<any, any> = this.#root;
        
        for (let i = 0; i < keyPath.length - 1; i++) {
            const key = keyPath[i];
            let next = current.get(key);
            
            if (next === undefined) {
                // Create Map or WeakMap based on the NEXT key's type
                const nextKey = keyPath[i + 1];
                next = this.#isPrimitive(nextKey) ? new Map() : new WeakMap();
                current.set(key, next);
            }
            
            current = next;
        }
        
        // Set the value at the last key
        const lastKey = keyPath[keyPath.length - 1];
        current.set(lastKey, value);
    }
}
