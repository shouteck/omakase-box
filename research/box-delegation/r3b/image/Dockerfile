FROM node:24.11.0-bookworm-slim@sha256:76d0ed0ed93bed4f4376211e9d8fddac4d8b3fbdb54cc45955696001a3c91152
RUN apt-get update -qq && apt-get install -y -qq --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*
RUN mkdir -p /src /out && chown node:node /src /out
USER node
WORKDIR /src
