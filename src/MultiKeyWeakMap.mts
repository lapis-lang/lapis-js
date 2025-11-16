/**
 * A multi-key map that supports both object and primitive keys for object pooling.
 * Uses WeakMap for object keys (allows garbage collection) and Map for primitive keys.
 * Enables strict equality for structurally equivalent variant instances.
 */
export class MultiKeyWeakMap {
    #map = new WeakMap<object, any>();
    #primitiveMap = new Map<any, any>();
    #null = Object.create(null);
    #undefined = Object.create(null);

    /**
     * Boxes a primitive key to make it usable as a WeakMap key.
     * Objects and functions are returned as-is.
     */
    #objKey(key: any): object {
        if (key === null) return this.#null;
        if (key === undefined) return this.#undefined;
        
        const type = typeof key;
        if (type === 'object' || type === 'function') return key;
        
        // Box primitives
        if (type === 'number') {
            return this.#primitiveMap.get(key) ?? 
                this.#primitiveMap.set(key, new Number(key)).get(key)!;
        }
        if (type === 'string') {
            return this.#primitiveMap.get(key) ?? 
                this.#primitiveMap.set(key, new String(key)).get(key)!;
        }
        if (type === 'boolean') {
            return this.#primitiveMap.get(key) ?? 
                this.#primitiveMap.set(key, new Boolean(key)).get(key)!;
        }
        if (type === 'bigint') {
            return this.#primitiveMap.get(key) ?? 
                this.#primitiveMap.set(key, Object(key)).get(key)!;
        }
        if (type === 'symbol') {
            return this.#primitiveMap.get(key) ?? 
                this.#primitiveMap.set(key, Object(key)).get(key)!;
        }
        
        return key;
    }

    /**
     * Gets a value from the map using multiple keys.
     * @param keys Array of keys to traverse
     * @returns The stored value or undefined if not found
     */
    get(...keys: any[]): any | undefined {
        if (keys.length === 0) return undefined;
        
        let current: any = this.#map;
        
        for (let i = 0; i < keys.length - 1; i++) {
            const objKey = this.#objKey(keys[i]);
            const next = current.get(objKey);
            if (next === undefined) return undefined;
            current = next;
        }
        
        // Last key retrieves the stored value
        const lastKey = this.#objKey(keys[keys.length - 1]);
        return current.get(lastKey);
    }

    /**
     * Stores a value in the map using multiple keys.
     * @param keys Array of keys followed by the value to store
     */
    set(...keys: any[]): void {
        if (keys.length < 2) {
            throw new TypeError('MultiKeyWeakMap.set requires at least one key and a value');
        }
        
        const value = keys[keys.length - 1];
        const keyPath = keys.slice(0, -1);
        
        let current: any = this.#map;
        
        for (let i = 0; i < keyPath.length - 1; i++) {
            const objKey = this.#objKey(keyPath[i]);
            let next = current.get(objKey);
            if (next === undefined) {
                next = new WeakMap();
                current.set(objKey, next);
            }
            current = next;
        }
        
        // Set the value at the last key
        const lastKey = this.#objKey(keyPath[keyPath.length - 1]);
        current.set(lastKey, value);
    }
}
