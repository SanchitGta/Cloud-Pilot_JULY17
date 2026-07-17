# Cloud-Pilot_JULY17

Cloud Pilot: connect a single AWS account and scan its infrastructure.

## Prerequisites

- Node 20+

## Setup

```bash
npm install
cp server/.env.example server/.env
```

Edit `server/.env` and set `CONNECTION_ENCRYPTION_KEY` to a 32-byte base64 key:

```bash
openssl rand -base64 32
```

## Run

In two terminals:

```bash
npm run dev:server   # API on http://localhost:3000
npm run dev:web      # Web app on http://localhost:5173
```
