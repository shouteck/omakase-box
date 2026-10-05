FROM node:24.11.0-bookworm-slim@sha256:76d0ed0ed93bed4f4376211e9d8fddac4d8b3fbdb54cc45955696001a3c91152 AS node
FROM mcr.microsoft.com/playwright:v1.63.0-noble@sha256:bc6ab0d6d44ff4826e4cb8c1e6d801e185bfc42bb0753f8e2a30efc70db054c7
COPY --from=node /usr/local/ /usr/local/
WORKDIR /opt/bootstrap
COPY bootstrap/package.json bootstrap/package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
WORKDIR /opt/toolchain
COPY toolchain/package.json toolchain/pnpm-lock.yaml toolchain/pnpm-workspace.yaml ./
RUN node /opt/bootstrap/node_modules/pnpm/bin/pnpm.cjs install --frozen-lockfile --ignore-scripts
COPY self-check.mjs ./self-check.mjs
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
USER pwuser
WORKDIR /work
CMD ["node", "/opt/toolchain/self-check.mjs"]
