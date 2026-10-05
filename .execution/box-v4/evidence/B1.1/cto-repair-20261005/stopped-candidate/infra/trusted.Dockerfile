FROM node:24.11.0-bookworm-slim@sha256:76d0ed0ed93bed4f4376211e9d8fddac4d8b3fbdb54cc45955696001a3c91152 AS dependencies
WORKDIR /workspace
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY scripts/tooling/package.json scripts/tooling/package-lock.json ./scripts/tooling/
COPY apps/private-console/package.json ./apps/private-console/
COPY apps/contributor-portal/package.json ./apps/contributor-portal/
COPY services/private-api/package.json ./services/private-api/
COPY services/external-api/package.json ./services/external-api/
COPY services/runner-controller/package.json ./services/runner-controller/
COPY packages/contracts/package.json ./packages/contracts/
COPY packages/runner-protocol/package.json ./packages/runner-protocol/
RUN npm ci --prefix scripts/tooling --ignore-scripts && node scripts/tooling/node_modules/pnpm/bin/pnpm.cjs install --frozen-lockfile

FROM dependencies AS private-build
COPY services/private-api/src ./services/private-api/src
COPY services/private-api/bootstrap ./services/private-api/bootstrap
COPY services/private-api/db ./services/private-api/db
COPY services/private-api/auth ./services/private-api/auth
COPY services/private-api/requests ./services/private-api/requests
COPY services/private-api/snapshots ./services/private-api/snapshots
COPY services/private-api/intents ./services/private-api/intents
COPY services/private-api/preparations ./services/private-api/preparations
COPY services/private-api/releases ./services/private-api/releases
COPY services/private-api/assignments ./services/private-api/assignments
COPY services/private-api/readiness ./services/private-api/readiness
COPY services/private-api/submission-import ./services/private-api/submission-import
COPY services/private-api/acceptance ./services/private-api/acceptance
COPY services/private-api/feedback ./services/private-api/feedback
COPY services/private-api/ledger ./services/private-api/ledger
COPY services/external-api/reservations ./services/external-api/reservations
COPY services/external-api/submissions ./services/external-api/submissions
COPY services/external-api/tasks ./services/external-api/tasks
COPY services/external-api/bridge ./services/external-api/bridge
COPY packages/evaluation/patch-validation ./packages/evaluation/patch-validation
COPY packages/evaluation/pipeline ./packages/evaluation/pipeline
COPY packages/evaluation/runner-results ./packages/evaluation/runner-results
COPY packages/evaluation/policy ./packages/evaluation/policy
COPY packages/evaluation/contracts ./packages/evaluation/contracts
COPY packages/analyzer/policy ./packages/analyzer/policy
COPY packages/runner-protocol/index.ts packages/runner-protocol/package.json ./packages/runner-protocol/
COPY packages/planner/retrieval ./packages/planner/retrieval
COPY packages/planner/prompts ./packages/planner/prompts
COPY packages/planner/providers ./packages/planner/providers
COPY packages/planner/partition ./packages/planner/partition
COPY packages/compiler ./packages/compiler
COPY templates/workspaces/catalogue.ts templates/workspaces/public-image-profile.ts ./templates/workspaces/
COPY packages/contracts/auth ./packages/contracts/auth
COPY packages/contracts/common.ts packages/contracts/hash.ts packages/contracts/paths.ts ./packages/contracts/
COPY packages/contracts/public ./packages/contracts/public
COPY packages/contracts/private ./packages/contracts/private
COPY packages/contracts/workflow ./packages/contracts/workflow
RUN node services/private-api/bootstrap/build.mjs

FROM dependencies AS external-build
COPY services/external-api/src ./services/external-api/src
COPY services/external-api/bootstrap ./services/external-api/bootstrap
COPY services/external-api/db ./services/external-api/db
COPY services/external-api/auth ./services/external-api/auth
COPY services/external-api/reservations ./services/external-api/reservations
COPY services/external-api/submissions ./services/external-api/submissions
COPY services/external-api/tasks ./services/external-api/tasks
COPY services/external-api/bridge ./services/external-api/bridge
COPY services/external-api/status ./services/external-api/status
COPY packages/evaluation/patch-validation ./packages/evaluation/patch-validation
COPY packages/contracts/auth ./packages/contracts/auth
COPY packages/contracts/common.ts packages/contracts/hash.ts packages/contracts/paths.ts ./packages/contracts/
COPY packages/contracts/public ./packages/contracts/public
COPY packages/contracts/workflow ./packages/contracts/workflow
RUN node services/external-api/bootstrap/build.mjs

FROM node:24.11.0-bookworm-slim@sha256:76d0ed0ed93bed4f4376211e9d8fddac4d8b3fbdb54cc45955696001a3c91152 AS private-api
WORKDIR /workspace
COPY --from=private-build /workspace/node_modules ./node_modules
COPY --from=private-build /workspace/services/private-api/package.json ./services/private-api/package.json
COPY --from=private-build /workspace/services/private-api/node_modules ./services/private-api/node_modules
COPY --from=private-build /workspace/services/private-api/dist ./services/private-api/dist
COPY --from=private-build /workspace/services/private-api/db/migrations ./services/private-api/db/migrations
COPY examples/private-shop/src ./examples/private-shop/src
COPY examples/private-shop/config ./examples/private-shop/config
COPY examples/private-shop/fixture.json ./examples/private-shop/fixture.json
RUN install -d -o node -g node -m 0700 /data/private
USER node
CMD ["node", "services/private-api/dist/main.js"]

FROM node:24.11.0-bookworm-slim@sha256:76d0ed0ed93bed4f4376211e9d8fddac4d8b3fbdb54cc45955696001a3c91152 AS external-api
WORKDIR /workspace
COPY --from=external-build /workspace/node_modules ./node_modules
COPY --from=external-build /workspace/services/external-api/package.json ./services/external-api/package.json
COPY --from=external-build /workspace/services/external-api/node_modules ./services/external-api/node_modules
COPY --from=external-build /workspace/services/external-api/dist ./services/external-api/dist
COPY --from=external-build /workspace/services/external-api/db/migrations ./services/external-api/db/migrations
RUN install -d -o node -g node -m 0700 /data/external
USER node
CMD ["node", "services/external-api/dist/main.js"]
