FROM node@sha256:76d0ed0ed93bed4f4376211e9d8fddac4d8b3fbdb54cc45955696001a3c91152
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv strace && rm -rf /var/lib/apt/lists/*
RUN python3 -m venv /opt/labdeps/python && /opt/labdeps/python/bin/pip install --no-cache-dir --only-binary=:all: coverage==7.10.7 pytest==8.4.2
RUN mkdir -p /opt/labdeps/node && cd /opt/labdeps/node && npm install --ignore-scripts --no-audit --no-fund --save-exact typescript@6.0.3 source-map@0.7.6
COPY . /opt/instrument/
ENV PATH="/opt/labdeps/python/bin:${PATH}"
ENV PYTHONDONTWRITEBYTECODE=1
USER 1000:1000
WORKDIR /case
