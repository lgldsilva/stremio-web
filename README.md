# Stremio - Freedom to Stream

[![Build](https://github.com/Stremio/stremio-web/actions/workflows/build.yml/badge.svg)](https://github.com/Stremio/stremio-web/actions/workflows/build.yml)
[![Github Page](https://img.shields.io/website?label=Page&logo=github&up_message=online&down_message=offline&url=https%3A%2F%2Fstremio.github.io%2Fstremio-web%2F)](https://stremio.github.io/stremio-web/development)

Stremio is a modern media center that's a one-stop solution for your video entertainment. You discover, watch and organize video content from easy to install addons.

## Build

### Prerequisites

* Node.js 12 or higher
* [pnpm](https://pnpm.io/installation) 10 or higher

### Install dependencies

```bash
pnpm install
```

### Start development server

```bash
pnpm start
```

### Production build

```bash
pnpm run build
```

### Run with Docker

```bash
docker build -t stremio-web .
docker run -p 8080:8080 stremio-web
```

### All-in-One Docker (Web + Server + ffmpeg)

This repository now includes a full Docker stack under `docker/` with:
- Web UI + stremio-server in one container
- Dynamic hardware backend selection (`auto`, `none`, `vaapi`, `nvidia`)
- HTTPS helpers, optional basic auth, and runtime tuning

Use from the project root:

```bash
cp docker/.env.example docker/.env
# edit docker/.env only if you need custom values
docker compose --env-file docker/.env -f docker/compose.simple.yaml up -d --build
```

NVIDIA variant:

```bash
docker compose --env-file docker/.env -f docker/compose.nvidia.yaml up -d --build
```

Important envs:
- `HWACCEL_BACKEND=auto|none|vaapi|nvidia`
- `STREMIO_PUBLIC_URL=https://your-domain/`
- `STREMIO_PUBLIC_HOST` and `STREMIO_HOST_IP` for container DNS (required when `.lan` is not resolvable inside container)
- `STREMIO_IPADDRESS=` (leave empty when using reverse proxy TLS)
- `NVIDIA_COMPAT_PATCH=1` (default)

Notes:
- If there is no GPU, keep `HWACCEL_BACKEND=auto` and it falls back to CPU (`none`) automatically.
- For Intel/AMD VAAPI, use `compose.simple.yaml` and expose `/dev/dri` in the service.

## Screenshots

### Board

![Board](/assets/screenshots/board.png)

### Discover

![Discover](/assets/screenshots/discover.png)

### Meta Details

![Meta Details](/assets/screenshots/metadetails.png)

## License

Stremio is copyright 2017-2023 Smart code and available under GPLv2 license. See the [LICENSE](/LICENSE.md) file in the project for more information.
