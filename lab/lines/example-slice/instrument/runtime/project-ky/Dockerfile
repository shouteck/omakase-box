ARG RUNTIME_IMAGE=lab-a-replay-1
FROM ${RUNTIME_IMAGE}
USER root
COPY package*.json /opt/ky/
RUN cd /opt/ky && npm ci --ignore-scripts --no-audit --no-fund && mkdir -p /case && ln -s /opt/ky/node_modules /case/node_modules
USER 1000:1000
