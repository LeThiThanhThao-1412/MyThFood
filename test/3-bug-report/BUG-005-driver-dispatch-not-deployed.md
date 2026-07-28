# BUG-005: Driver & Dispatch Services Not Included in Docker Compose

| Field | Value |
|-------|-------|
| **Bug ID** | BUG-005 |
| **Title** | Driver Service and Dispatch Service are not included in docker-compose deployment |
| **Severity** | High (P1) |
| **Priority** | High |
| **Status** | Open |
| **Found Date** | 2026-07-15 |
| **Service** | Driver Service (3007), Dispatch Service (3008) |
| **Environment** | Docker Compose (local dev) |

---

## Description

While Driver and Dispatch services ARE defined in `docker-compose.yml`, they apparently failed to deploy or were excluded during the API testing phase. This prevents end-to-end testing of the full delivery flow.

## Evidence

From `docs/API_TEST_CASES.md`:
```
| 7 | Driver/Dispatch chưa có trong docker-compose | High | DevOps |
```

## Impact

- Cannot test driver registration, activation, online/offline flow
- Cannot test dispatch creation, driver assignment, accept/decline flow
- 7 API test cases blocked (🚫 NOT DEPLOYED)
- Full E2E flow incomplete (steps 6, 9-10)

## Resolution

Both services are defined in `docker-compose.yml` (lines 220-269) and have Dockerfiles. They need to be deployed and included in the test suite.

## Related Files

- `mythfood/docker-compose.yml` (lines 220-269)
- `apps/driver-service/Dockerfile`
- `apps/driver-service/src/modules/driver/presentation/driver.controller.ts`
- `apps/dispatch-service/Dockerfile`
- `apps/dispatch-service/src/modules/dispatch/presentation/dispatch.controller.ts`