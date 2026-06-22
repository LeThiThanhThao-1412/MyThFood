# Contributing to MyThFood

Thank you for considering contributing to MyThFood! 🎉

## How to Contribute

### 1. Fork & Clone

```bash
git clone https://github.com/LeThiThanhThao-1412/MyThFood.git
cd MyThFood/mythfood
pnpm install
```

### 2. Branch Convention

- `feature/<name>` — New features
- `fix/<name>` — Bug fixes
- `refactor/<name>` — Code refactors
- `docs/<name>` — Documentation

### 3. Commit Convention

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add user registration endpoint
fix: resolve password hashing race condition
refactor: extract JWT config to shared module
test: add unit tests for User aggregate
docs: update API documentation
```

### 4. Code Standards

- **TypeScript strict mode** is enabled — no `any` types without explicit justification
- **Domain-Driven Design** — domain logic must remain in the domain layer, free of framework dependencies
- **CQRS** — use commands for writes, queries for reads
- **Result Pattern** — use `Result<T, E>` for fallible operations instead of throwing exceptions
- **Value Objects** — all domain values must be immutable and self-validating
- **No unused imports/variables** — the build enforces `noUnusedLocals` and `noUnusedParameters`

### 5. Before Submitting

```bash
# Lint
pnpm --filter @mythfood/identity-service lint

# Test
pnpm --filter @mythfood/identity-service test

# Build check
pnpm --filter @mythfood/identity-service build
```

### 6. Pull Request Checklist

- [ ] Code follows the project architecture (DDD + Clean Architecture)
- [ ] New features have corresponding unit tests
- [ ] All existing tests pass
- [ ] No unused imports or variables
- [ ] Commit messages follow Conventional Commits
- [ ] Documentation updated if necessary

## Project Architecture

```
Domain Layer (innermost, no dependencies)
  ↓
Application Layer (use cases, commands/queries)
  ↓
Infrastructure Layer (persistence, external services)
  ↓
Presentation Layer (controllers, modules)
```

Dependencies only flow inward. Domain code never imports from Infrastructure or Presentation.

## Questions?

Open a [GitHub Issue](https://github.com/LeThiThanhThao-1412/MyThFood/issues).