"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Entity = void 0;
/**
 * Base Entity class for Domain-Driven Design.
 * Entities are defined by their identity (ID), not their attributes.
 * Two entities are equal if they have the same ID.
 */
class Entity {
  _id;
  _createdAt;
  _updatedAt;
  constructor(id) {
    this._id = id;
    this._createdAt = new Date();
    this._updatedAt = new Date();
  }
  get id() {
    return this._id;
  }
  get createdAt() {
    return this._createdAt;
  }
  get updatedAt() {
    return this._updatedAt;
  }
  markUpdated() {
    this._updatedAt = new Date();
  }
  equals(other) {
    if (other === null || other === undefined) {
      return false;
    }
    if (!(other instanceof Entity)) {
      return false;
    }
    return this._id.equals(other._id);
  }
  /**
   * Check if the entity is new (no changes since creation).
   */
  isNew() {
    return this._createdAt.getTime() === this._updatedAt.getTime();
  }
}
exports.Entity = Entity;
//# sourceMappingURL=entity.js.map
