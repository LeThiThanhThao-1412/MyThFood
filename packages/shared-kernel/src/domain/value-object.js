"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ValueObject = void 0;
/**
 * Base Value Object class for Domain-Driven Design.
 * Value Objects are immutable and compared by their structural properties.
 * Two Value Objects are equal when all their properties are equal.
 */
class ValueObject {
  props;
  constructor(props) {
    this.props = Object.freeze({ ...props });
  }
  equals(other) {
    if (other === null || other === undefined) {
      return false;
    }
    if (other.constructor !== this.constructor) {
      return false;
    }
    return JSON.stringify(this.props) === JSON.stringify(other.props);
  }
  getProps() {
    return this.props;
  }
  /**
   * Serialize the value object for persistence or transfer.
   * Override in subclasses for custom serialization logic.
   */
  toJSON() {
    return { ...this.props };
  }
}
exports.ValueObject = ValueObject;
//# sourceMappingURL=value-object.js.map
