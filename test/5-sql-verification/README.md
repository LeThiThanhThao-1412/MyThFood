# MyThFood - SQL Verification Scripts

> **Database:** PostgreSQL 16  
> **Source:** `docker/init-db/01-create-databases.sql`, `docker-compose.yml`  
> **Total Databases:** 9  

---

## Connection Info

```
Host: localhost
Port: 5432
User: mythfood
Password: mythfood_secret_dev
```

Connection string:
```
postgresql://mythfood:mythfood_secret_dev@localhost:5432/mythfood_identity
```

---

## Script Overview

| # | Script | Purpose |
|---|--------|---------|
| 1 | `01-database-list.sql` | Verify all 9 databases exist |
| 2 | `02-table-structure.sql` | Check table schemas per service |
| 3 | `03-data-integrity.sql` | Verify constraints and relations |
| 4 | `04-business-rules.sql` | Validate business rules from code |

---

## How to Run

### Using psql (if installed):
```bash
psql -h localhost -U mythfood -d mythfood_identity -f 01-database-list.sql
psql -h localhost -U mythfood -d mythfood_identity -f 02-table-structure.sql
psql -h localhost -U mythfood -d mythfood_identity -f 03-data-integrity.sql
psql -h localhost -U mythfood -d mythfood_identity -f 04-business-rules.sql
```

### Using Docker:
```bash
docker exec -i mythfood-postgres psql -U mythfood -d mythfood_identity < 01-database-list.sql
docker exec -i mythfood-postgres psql -U mythfood -d mythfood_identity < 02-table-structure.sql
docker exec -i mythfood-postgres psql -U mythfood -d mythfood_identity < 03-data-integrity.sql
docker exec -i mythfood-postgres psql -U mythfood -d mythfood_identity < 04-business-rules.sql
```

---

## Expected Results

All scripts should execute without errors and return the expected counts:
- 9 databases
- Tables per service matching entity definitions
- Foreign keys and unique constraints valid
- Business rules: split 70/20/10, wallet balance ≥ 0, order status transitions valid