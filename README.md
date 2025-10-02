# backend_middleware_api

## .env
DIRECTUS_BACKEND=
UMAMI_API_CLIENT_USER_ID=
UMAMI_API_CLIENT_SECRET=
UMAMI_API_CLIENT_ENDPOINT=
<br>
PORT=8000

## Run command
```
node index.mjs
```

##  Endpoints

### Whitelabel
```
GET /v1/wl/domain
POST /v1/wl/domain
PATCH /v1/wl/domain/:domain

{
  "domain": "string",
  "status": "string",
  "logo": {
    "id": "string"
  },
  "banner": {
    "id": "string"
  },
  "settings": "object",
  ...any other fields
}
```

### Files
```
GET /v1/file/:fileId
PATCH /v1/file/:fileId
POST /v1/file/upload
POST /v1/file/rename
```


## Starknet Cron Job

node starknetNftContractCreate.mjs