# Small image for CI runners and cron hosts that do not have Node available.
#
#   docker build -t sitewalk .
#   docker run --rm sitewalk https://example.com --steps 100
FROM node:22-alpine

WORKDIR /app

# No runtime dependencies, so there is nothing to install.
COPY package.json ./
COPY bin ./bin
COPY src ./src

RUN adduser -D -H sitewalk
USER sitewalk

ENTRYPOINT ["node", "/app/bin/cli.js"]
CMD ["--help"]
