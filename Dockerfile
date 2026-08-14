FROM oven/bun:1.3.14 AS bun

FROM node:24-bookworm-slim AS dependencies

COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
ENV npm_config_nodedir=/usr/local

RUN apt-get update \
    && apt-get install --no-install-recommends --yes g++ make python3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/dsh
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

FROM node:24-bookworm-slim

ENV DSH_HOME=/dsh-home
ENV PATH=/opt/dsh/node_modules/.bin:$PATH

WORKDIR /workspace

RUN apt-get update \
    && apt-get install --no-install-recommends --yes dumb-init git socat \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir --parents /dsh-home /workspace \
    && chown --recursive node:node /dsh-home /workspace

COPY --from=dependencies --chown=node:node /opt/dsh/package.json /opt/dsh/package.json
COPY --from=dependencies --chown=node:node /opt/dsh/node_modules /opt/dsh/node_modules
COPY --chown=node:node docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

USER node
EXPOSE 3080

ENTRYPOINT ["dumb-init", "--", "/usr/local/bin/docker-entrypoint.sh"]
