# 🚀 Deployment Guide for Chess Coach AI

This guide covers multiple deployment options for your Next.js application with API routes.

## 📋 Prerequisites

Before deploying, ensure you have:

1. **Environment Variables**:
   - `OPENAI_API_KEY` - Your OpenAI API key (required for AI features)
   - `SENTRY_ORG` (optional) - For error tracking
   - `SENTRY_PROJECT` (optional) - For error tracking

2. **AWS Account** (if using AWS):
   - AWS CLI configured
   - CDK CLI installed (`npm install -g aws-cdk`)
   - AWS credentials configured with appropriate permissions

3. **Domain Name** (optional):
   - Domain registered (e.g., `chess-masti-ai.com`)
   - DNS access for Route53 configuration

---

## 🎯 Deployment Options

### Option 1: Vercel (Recommended - Easiest)

**Best for**: Quick deployment with zero configuration for Next.js API routes

#### Steps:

1. **Install Vercel CLI** (if not already installed):
   ```bash
   npm install -g vercel
   ```

2. **Login to Vercel**:
   ```bash
   vercel login
   ```

3. **Deploy**:
   ```bash
   cd chess-coach-ai
   vercel
   ```

4. **Set Environment Variables**:
   - Go to your Vercel project dashboard
   - Navigate to Settings → Environment Variables
   - Add:
     - `OPENAI_API_KEY` = `your_openai_api_key`
     - `SENTRY_ORG` = `your_sentry_org` (optional)
     - `SENTRY_PROJECT` = `javascript-nextjs` (optional)

5. **Configure Custom Domain** (optional):
   - In Vercel dashboard: Settings → Domains
   - Add your domain and follow DNS configuration instructions

#### Advantages:
- ✅ Zero configuration for Next.js API routes
- ✅ Automatic HTTPS
- ✅ Global CDN
- ✅ Easy environment variable management
- ✅ Automatic deployments from Git

#### Cost:
- Free tier available (with limitations)
- Pro: $20/month

---

### Option 2: AWS Amplify (Good for AWS Integration)

**Best for**: AWS-native deployment with automatic scaling

#### Steps:

1. **Install AWS Amplify CLI**:
   ```bash
   npm install -g @aws-amplify/cli
   amplify configure
   ```

2. **Initialize Amplify**:
   ```bash
   cd chess-coach-ai
   amplify init
   ```
   - Choose your AWS profile
   - Select region
   - Choose Next.js as framework

3. **Add Hosting**:
   ```bash
   amplify add hosting
   ```
   - Choose "Hosting with Amplify Console"
   - Connect your Git repository (optional)

4. **Set Environment Variables**:
   - In Amplify Console → App Settings → Environment Variables
   - Add:
     - `OPENAI_API_KEY` = `your_openai_api_key`
     - `NEXT_PUBLIC_APP_URL` = `https://your-domain.com` (if needed)

5. **Deploy**:
   ```bash
   amplify publish
   ```

#### Advantages:
- ✅ Native AWS integration
- ✅ Automatic scaling
- ✅ Built-in CI/CD
- ✅ Supports Next.js API routes
- ✅ Custom domain support

#### Cost:
- Pay-as-you-go (very affordable for small apps)
- Free tier: 15 GB storage, 5 GB served per month

---

### Option 3: AWS CDK (Current Setup - Needs Modification)

**Current Issue**: Your app is configured for static export, but has API routes that need server-side execution.

**Solution**: We need to modify the deployment to support API routes.

#### Option 3A: Modify for Serverless Next.js

1. **Install Serverless Next.js CDK Construct**:
   ```bash
   cd chess-coach-ai
   npm install --save-dev @slack-nextjs/cdk-construct
   ```

2. **Modify `next.config.ts`**:
   Remove or conditionally disable static export:
   ```typescript
   const nextConfig = (phase: string): NextConfig => ({
     // Remove: output: phase === PHASE_PRODUCTION_BUILD ? "export" : undefined,
     trailingSlash: false,
     reactStrictMode: true,
     // ... rest of config
   });
   ```

3. **Update CDK Stack** to use serverless Next.js construct

#### Option 3B: Use Current Static Export + Separate API

Keep static export but deploy API routes separately:

1. **Deploy Static Site** (current CDK setup):
   ```bash
   npm run build
   npm run deploy
   ```

2. **Deploy API Routes** separately using:
   - AWS Lambda + API Gateway
   - Or use Vercel/Amplify just for API routes

---

### Option 4: Docker + AWS ECS/Fargate

**Best for**: Full control over deployment environment

#### Steps:

1. **Create Dockerfile**:
   ```dockerfile
   FROM node:18-alpine AS base
   
   FROM base AS deps
   RUN apk add --no-cache libc6-compat
   WORKDIR /app
   COPY package.json package-lock.json* ./
   RUN npm ci
   
   FROM base AS builder
   WORKDIR /app
   COPY --from=deps /app/node_modules ./node_modules
   COPY . .
   RUN npm run build
   
   FROM base AS runner
   WORKDIR /app
   ENV NODE_ENV production
   RUN addgroup --system --gid 1001 nodejs
   RUN adduser --system --uid 1001 nextjs
   COPY --from=builder /app/public ./public
   COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
   COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
   USER nextjs
   EXPOSE 3000
   ENV PORT 3000
   CMD ["node", "server.js"]
   ```

2. **Update `next.config.ts`** for standalone output:
   ```typescript
   output: 'standalone',
   ```

3. **Deploy to ECS/Fargate** using CDK

---

## 🔧 Pre-Deployment Checklist

Before deploying, ensure:

- [ ] All environment variables are set
- [ ] `npm run build` completes successfully
- [ ] `npm run lint` passes
- [ ] API routes are tested locally
- [ ] OpenAI API key is valid and has credits
- [ ] Domain DNS is configured (if using custom domain)
- [ ] CORS settings are correct (if needed)
- [ ] Error tracking is configured (Sentry)

---

## 🚀 Quick Start: Vercel Deployment

**Fastest way to get deployed:**

```bash
# 1. Install Vercel CLI
npm install -g vercel

# 2. Login
vercel login

# 3. Navigate to project
cd chess-coach-ai

# 4. Deploy
vercel

# 5. Set environment variables in Vercel dashboard
# 6. Redeploy to apply environment variables
vercel --prod
```

---

## 📝 Environment Variables Reference

### Required:
- `OPENAI_API_KEY` - Your OpenAI API key for AI coaching features

### Optional:
- `SENTRY_ORG` - Sentry organization for error tracking
- `SENTRY_PROJECT` - Sentry project name (default: `javascript-nextjs`)
- `NEXT_PUBLIC_APP_URL` - Public URL of your app (for CORS, etc.)

---

## 🔍 Post-Deployment Verification

After deployment, verify:

1. **Homepage loads**: Visit your deployed URL
2. **API routes work**: Test `/api/enhanced-analysis` endpoint
3. **AI features work**: Try the AI coach chat
4. **Stockfish works**: Verify chess engine analysis
5. **Environment variables**: Check that API calls succeed

---

## 🐛 Troubleshooting

### API Routes Not Working
- **Issue**: API routes return 404 or don't execute
- **Solution**: Ensure you're not using static export, or deploy API routes separately

### OpenAI API Errors
- **Issue**: "OpenAI API key not configured"
- **Solution**: Verify environment variables are set correctly in your deployment platform

### Build Failures
- **Issue**: Build fails with TypeScript errors
- **Solution**: Run `npm run lint` locally and fix all errors before deploying

### CORS Issues
- **Issue**: API calls blocked by CORS
- **Solution**: Configure CORS headers in your deployment platform or Next.js config

---

## 📚 Additional Resources

- [Vercel Deployment Docs](https://vercel.com/docs)
- [AWS Amplify Docs](https://docs.amplify.aws/)
- [Next.js Deployment](https://nextjs.org/docs/deployment)
- [AWS CDK Docs](https://docs.aws.amazon.com/cdk/)

---

## 💡 Recommendation

**For fastest deployment**: Use **Vercel** - it's specifically designed for Next.js and handles API routes automatically.

**For AWS integration**: Use **AWS Amplify** - it integrates well with other AWS services.

**For existing AWS infrastructure**: Modify the CDK setup to support serverless Next.js or use a hybrid approach.

