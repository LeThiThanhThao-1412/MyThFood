"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ForbiddenError = exports.UnauthorizedError = exports.ValidationError = exports.BusinessRuleViolationError = exports.EntityNotFoundError = exports.DomainError = exports.Result = exports.BaseDomainEvent = exports.AggregateRoot = exports.Entity = exports.ValueObject = exports.Identifier = void 0;
// Domain building blocks
var identifier_1 = require("./domain/identifier");
Object.defineProperty(exports, "Identifier", { enumerable: true, get: function () { return identifier_1.Identifier; } });
var value_object_1 = require("./domain/value-object");
Object.defineProperty(exports, "ValueObject", { enumerable: true, get: function () { return value_object_1.ValueObject; } });
var entity_1 = require("./domain/entity");
Object.defineProperty(exports, "Entity", { enumerable: true, get: function () { return entity_1.Entity; } });
var aggregate_root_1 = require("./domain/aggregate-root");
Object.defineProperty(exports, "AggregateRoot", { enumerable: true, get: function () { return aggregate_root_1.AggregateRoot; } });
var domain_event_1 = require("./domain/domain-event");
Object.defineProperty(exports, "BaseDomainEvent", { enumerable: true, get: function () { return domain_event_1.BaseDomainEvent; } });
var result_1 = require("./domain/result");
Object.defineProperty(exports, "Result", { enumerable: true, get: function () { return result_1.Result; } });
var domain_error_1 = require("./domain/domain-error");
Object.defineProperty(exports, "DomainError", { enumerable: true, get: function () { return domain_error_1.DomainError; } });
Object.defineProperty(exports, "EntityNotFoundError", { enumerable: true, get: function () { return domain_error_1.EntityNotFoundError; } });
Object.defineProperty(exports, "BusinessRuleViolationError", { enumerable: true, get: function () { return domain_error_1.BusinessRuleViolationError; } });
Object.defineProperty(exports, "ValidationError", { enumerable: true, get: function () { return domain_error_1.ValidationError; } });
Object.defineProperty(exports, "UnauthorizedError", { enumerable: true, get: function () { return domain_error_1.UnauthorizedError; } });
Object.defineProperty(exports, "ForbiddenError", { enumerable: true, get: function () { return domain_error_1.ForbiddenError; } });
//# sourceMappingURL=index.js.map