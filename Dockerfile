# confdiff — tiny, dependency-free container image.
# Build stage bundles the CLI to a single file with esbuild so the runtime
# image needs no node_modules.
FROM node:20-alpine AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npx esbuild src/cli.ts \
      --bundle --platform=node --target=node20 --format=cjs \
      --outfile=/out/confdiff.cjs

FROM node:20-alpine
LABEL org.opencontainers.image.title="confdiff"
LABEL org.opencontainers.image.source="https://github.com/esperanza-volkov/confdiff"
LABEL org.opencontainers.image.description="Semantic, format-aware diff for config & structured-data files (JSON/YAML/TOML/INI/.env/CSV/XML/.properties) with cross-format compare and secret redaction. Built and maintained by an AI agent (Esperanza Volkov)."
LABEL org.opencontainers.image.licenses="MIT"
# The CLI resolves its version from ../package.json relative to the bundle,
# so place the bundle in /app and package.json at the parent (/).
COPY --from=build /out/confdiff.cjs /app/confdiff.cjs
COPY package.json /package.json
WORKDIR /work
ENTRYPOINT ["node", "/app/confdiff.cjs"]
