# Northwind agent runtime

The Ask Northwind agent, and the one piece of this project that is not on
Vercel.

## Why this is a container

The Agent SDK ships a ~213MB native executable
(`@anthropic-ai/claude-agent-sdk-linux-x64/claude`) and launches it — and
`/bin/bash` — with `spawn`. A Vercel function caps at 250MB uncompressed and
has a read-only filesystem outside `/tmp`, so the binary alone would leave
about 37MB for everything else. This is not a configuration problem; the
process model is different.

That is also why the storefront's `/api/assistant/*` routes are a facade. They
hold the session cookie and the origin allowlist, and forward to this service
over a bearer token. The browser never sees an Anthropic key.

## What it needs from a host

- **A long-lived process**, not per-request serverless. It streams SSE for the
  length of an agent turn.
- **Linux x64 or arm64 with glibc.** The binary is dynamically linked against
  `/lib64/ld-linux-x86-64`. Alpine/musl needs the `-musl` variant package and
  does not ship bash, which the SDK spawns directly. `node:22-slim` is Debian,
  which is why the Dockerfile uses it.
- **~1GB image, 1GB memory.** Node plus a spawned CLI process.
- **No response buffering**, or streaming breaks.
- **Outbound HTTPS** to `api.anthropic.com` and MongoDB.
- **A writable filesystem** for the CLI's temp/home.

| Variable | Required | Notes |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | yes | |
| `ASSISTANT_RUNTIME_TOKEN` | yes | Must match the storefront's exactly, or every request is a 401 |
| `MONGODB_URI` | no | Without it, proposals report unavailable and sessions are not persisted |
| `MONGODB_DB` | no | Defaults to `northwind_support` |
| `PORT` | no | Defaults to 8790; Cloud Run injects its own and the server honours it |

## Local

`npm run dev:all` from the repo root starts this alongside the API, the course
and the shop, and points the storefront's `ASSISTANT_ORIGIN` at it. Nothing
below is needed to work on the assistant.

## Deploying to Cloud Run

Store the secrets first. Generate the shared token rather than inventing one —
it is the only thing standing between the public internet and an agent holding
an API key.

```bash
printf '%s' "sk-ant-..."      | gcloud secrets create anthropic-api-key      --data-file=-
openssl rand -hex 32          | gcloud secrets create assistant-runtime-token --data-file=-
printf '%s' "mongodb+srv://…" | gcloud secrets create mongodb-uri            --data-file=-
```

Let the Cloud Run service account read them:

```bash
PROJECT_NUMBER=$(gcloud projects describe "$(gcloud config get-value project)" --format='value(projectNumber)')
for secret in anthropic-api-key assistant-runtime-token mongodb-uri; do
  gcloud secrets add-iam-policy-binding "$secret" \
    --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
    --role=roles/secretmanager.secretAccessor
done
```

Deploy from the repository root:

```bash
gcloud run deploy northwind-agent \
  --source agent-runtime \
  --region us-east1 \
  --memory 1Gi --cpu 1 \
  --timeout 120 --concurrency 10 \
  --allow-unauthenticated \
  --set-env-vars MONGODB_DB=northwind_support \
  --set-secrets ANTHROPIC_API_KEY=anthropic-api-key:latest,ASSISTANT_RUNTIME_TOKEN=assistant-runtime-token:latest,MONGODB_URI=mongodb-uri:latest
```

`--allow-unauthenticated` is right here and is not the same as unprotected:
this service authenticates callers with its own bearer token, because the
caller is a Vercel function with no Google identity. Cloud Run IAM instead
would mean minting ID tokens from a service account in Vercel.

`--concurrency 10` because every in-flight request spawns a CLI subprocess.
For a workshop, add `--min-instances 1` on the day: a cold start has to load
that 213MB binary, and the first learner should not pay for it.

Verify before touching Vercel:

```bash
curl -s "$(gcloud run services describe northwind-agent --region us-east1 --format='value(status.url)')/healthz"
# {"status":"ok","storage":"configured"}
```

`"storage":"absent"` means `MONGODB_URI` did not arrive and the propose and
confirm flows will not work, even though chat will.

## Wiring the storefront

Only the **storefront** Vercel project needs these. The course site calls the
storefront, not this service, so it needs nothing.

```
ASSISTANT_ORIGIN=https://northwind-agent-<hash>-ue.a.run.app
ASSISTANT_RUNTIME_TOKEN=<the same value stored in assistant-runtime-token>
```

Redeploy the storefront afterwards — Vercel does not apply new environment
variables to an existing deployment.

The `.run.app` URL is a perfectly good `ASSISTANT_ORIGIN`. Mapping
`agent.northwind.mlynn.dev` to it is cosmetic and needs domain verification, so
it is worth doing after the thing works, not before.

## MongoDB Atlas will reject this by default

Cloud Run's egress IPs are dynamic, and Atlas allowlists by IP. A correct URI
still times out until you either allow `0.0.0.0/0` (acceptable for a fictional
workshop dataset behind SCRAM auth, not in general) or give the service a
static egress IP with a VPC connector and Cloud NAT.

The symptom is specific: `/healthz` says `"storage":"configured"`, chat works,
and only the propose and confirm paths fail — because that is the only code
that touches Mongo on the request path.
