# The `driver` service of `compose.yaml`: `node:24-alpine` plus the one
# package neither `js` nor `observer` needs, `docker-cli`, so a process in
# this container can `docker exec` into `js` and `rust` (`../src/
# docker-net.js`'s own `dockerSpawn`) over the host's own Docker socket,
# compose's own bind mount of it into this container. Nothing else is
# baked in: `compose.yaml` mounts the repository live, so an edit to `src/`
# or `test/` after this image is built still runs on the next `docker
# compose run driver`.
FROM node:24-alpine
RUN apk add --no-cache docker-cli
WORKDIR /quo/examples/e2e
