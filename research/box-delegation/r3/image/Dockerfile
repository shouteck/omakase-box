FROM node:24.11.0-bookworm-slim@sha256:76d0ed0ed93bed4f4376211e9d8fddac4d8b3fbdb54cc45955696001a3c91152
RUN apt-get update -qq && apt-get install -y -qq --no-install-recommends git curl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN npm i -g pnpm@10.34.5 --silent
RUN curl -fsSL https://raw.githubusercontent.com/nubjs/nub/0ae8783f1f93763c56dfc827892cfb679e8a0a77/install.sh -o /tmp/n.sh && bash /tmp/n.sh 0.8.3 && rm /tmp/n.sh
ENV PATH=/root/.nub/bin:$PATH
WORKDIR /work
