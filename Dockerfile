FROM oven/bun:1.3.14 AS bun

FROM node:24-bookworm-slim AS dependencies

COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
ENV npm_config_nodedir=/usr/local

RUN apt-get update \
    && apt-get install --no-install-recommends --yes g++ make python3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/dsh

# Resolve the current npm `latest` release inside the image. The repository's
# package manifests are intentionally not part of this build.
RUN printf '%s\n' '{"private":true}' > package.json \
    && bun add --exact @deepseek-ai/dsh@latest
COPY scripts/patch-dsh-web-client.mjs /opt/dsh/scripts/patch-dsh-web-client.mjs
RUN node /opt/dsh/scripts/patch-dsh-web-client.mjs

FROM node:24-bookworm-slim

ENV DSH_HOME=/dsh-home
ENV PATH=/opt/dsh/node_modules/.bin:$PATH

WORKDIR /home/node

RUN apt-get update \
    && apt-get install --no-install-recommends --yes dumb-init git socat \
    && npm install --global pnpm@10 \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir --parents /dsh-home /home/node \
    && chown --recursive node:node /dsh-home /home/node

COPY --from=dependencies --chown=node:node /opt/dsh/package.json /opt/dsh/package.json
COPY --from=dependencies --chown=node:node /opt/dsh/node_modules /opt/dsh/node_modules
COPY --chown=node:node docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

USER node
EXPOSE 3080

ENTRYPOINT ["dumb-init", "--", "/usr/local/bin/docker-entrypoint.sh"]
