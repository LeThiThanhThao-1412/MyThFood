"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Identifier = void 0;
/**
 * Base Identifier class for Domain-Driven Design.
 * All domain identifiers should extend this class.
 * Uses UUIDs by default for distributed-safe identity.
 */
class Identifier {
    _value;
    constructor(value) {
        this._value = value;
    }
    get value() {
        return this._value;
    }
    equals(other) {
        if (other === null || other === undefined) {
            return false;
        }
        if (!(other instanceof Identifier)) {
            return false;
        }
        return this._value === other._value;
    }
    toString() {
        return String(this._value);
    }
    toValue() {
        return this._value;
    }
}
exports.Identifier = Identifier;
//# sourceMappingURL=identifier.js.map