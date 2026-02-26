# Edge Functions Deployment Guide

## Prerequisites

1. Supabase CLI installed:
```bash
npm install -g supabase
```

2. Supabase project đã được setup (xem `supabase/README.md`)

3. Environment variables configured trong Supabase Dashboard

## Deploy Single Function

### Deploy upload-image
```bash
supabase functions deploy upload-image
```

### Deploy với custom project
```bash
supabase functions deploy upload-image --project-ref YOUR_PROJECT_REF
```

## Deploy All Functions

```bash
supabase functions deploy
```

## Environment Variables

Edge Functions cần các environment variables sau (configure trong Supabase Dashboard):

### Required for all functions:
- `SUPABASE_URL`: Project URL (auto-injected)
- `SUPABASE_SERVICE_ROLE_KEY`: Service role key (auto-injected)

### Required for process-tryon:
- `REPLICATE_API_KEY`: Replicate API key cho Gemini Flash

### Configure Secrets

```bash
# Via CLI
supabase secrets set REPLICATE_API_KEY=your_api_key_here

# Via Dashboard
# Navigate to: Project Settings > Edge Functions > Secrets
```

## Local Testing

### Start Supabase locally
```bash
supabase start
```

### Serve function locally
```bash
supabase functions serve upload-image --env-file .env.local
```

### Create .env.local file
```bash
# .env.local
SUPABASE_URL=http://localhost:54321
SUPABASE_SERVICE_ROLE_KEY=your_local_service_role_key
REPLICATE_API_KEY=your_replicate_api_key
```

### Test với curl
```bash
# Get local JWT token first
supabase auth login

# Test upload-image
curl -X POST http://localhost:54321/functions/v1/upload-image \
  -H "Authorization: Bearer YOUR_LOCAL_TOKEN" \
  -H "Content-Type: application/json" \
  -d @supabase/functions/upload-image/test_payload.example.json
```

## Verify Deployment

### Check function logs
```bash
supabase functions logs upload-image
```

### Test deployed function
```bash
curl -X POST https://YOUR_PROJECT_REF.supabase.co/functions/v1/upload-image \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d @test_payload.json
```

## Troubleshooting

### Function not found
- Verify deployment: `supabase functions list`
- Check project ref: `supabase projects list`

### Authentication errors
- Verify JWT token is valid
- Check token expiration
- Ensure SUPABASE_SERVICE_ROLE_KEY is set

### Image processing errors
- Verify imagescript dependency is installed
- Check Deno version compatibility
- Review function logs

### Storage errors
- Verify 'users' bucket exists
- Check RLS policies on storage
- Ensure user has permission to upload

## Performance Optimization

### Cold Start
- First request sau deployment có thể chậm (cold start)
- Subsequent requests sẽ nhanh hơn

### Memory Limits
- Default: 150MB
- Có thể tăng trong Dashboard nếu cần

### Timeout
- Default: 60 seconds
- Có thể tăng trong Dashboard nếu cần

## Monitoring

### View Logs
```bash
# Real-time logs
supabase functions logs upload-image --follow

# Filter by level
supabase functions logs upload-image --level error
```

### Metrics
- View trong Supabase Dashboard > Edge Functions
- Monitor: Invocations, Errors, Duration

## Rollback

### Deploy previous version
```bash
# List versions
supabase functions list-versions upload-image

# Deploy specific version
supabase functions deploy upload-image --version VERSION_ID
```

## CI/CD Integration

### GitHub Actions Example
```yaml
name: Deploy Edge Functions

on:
  push:
    branches: [main]
    paths:
      - 'supabase/functions/**'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Supabase CLI
        uses: supabase/setup-cli@v1
        
      - name: Deploy Functions
        run: supabase functions deploy
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
          PROJECT_REF: ${{ secrets.PROJECT_REF }}
```

## Security Checklist

- [ ] REPLICATE_API_KEY stored in Secrets (not hardcoded)
- [ ] RLS policies enabled on all tables
- [ ] Storage RLS policies configured
- [ ] CORS headers configured correctly
- [ ] JWT validation implemented
- [ ] Input validation implemented
- [ ] Error messages don't expose internal details

## Next Steps

1. Deploy all Edge Functions
2. Test each endpoint
3. Monitor logs for errors
4. Setup CI/CD pipeline
5. Configure monitoring alerts
