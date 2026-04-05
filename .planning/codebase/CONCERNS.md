# Concerns

## 1. Planning / Repository Mismatch

The earlier `.planning/` artifacts and root docs described a full-stack system with FastAPI, Postgres, auth, AI proxying, and deployment. The repository only contains the frontend app under `client/`. Any future planning must start from the code on disk, not the old roadmap.

Evidence:
- `README.md`
- `docs/contract.md`
- missing `server/` and `shared/` directories

## 2. Backend Contract Is Unverified

`client/src/api/documentAPI.ts` defines the expected HTTP routes, but there is no server implementation in this repo to guarantee the contract.

Risk:
- a future backend can drift from the client expectations without immediate detection

## 3. Mock Mode Can Mask Integration Problems

The app can appear healthy in development while still being incompatible with a real backend because `client/src/api/mockAPI.ts` supplies all critical behaviors locally.

Risk:
- late discovery of route, payload, versioning, or error-shape mismatches

## 4. Documentation Overclaims

Some repo docs previously claimed more complete testing and broader implemented scope than the code could prove.

Risk:
- future contributors trust incorrect setup or verification instructions

## 5. Dependency Health Needs Follow-Up

`npm install` reports 8 vulnerabilities in the frontend dependency tree.

Risk:
- future upgrades may be required before external release or CI hardening
