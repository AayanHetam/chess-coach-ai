# Quick Deployment to chessmasti.com

## Step 1: Add Environment Variables to Vercel

Go to: https://vercel.com/dashboard → Your Project → Settings → Environment Variables

Add these (copy from your .env.local):

```
NEO4J_URI=neo4j+s://[your-instance-id].databases.neo4j.io
NEO4J_USERNAME=[your Neo4j username]
NEO4J_PASSWORD=[your Neo4j password]
ANTHROPIC_API_KEY=[your Anthropic key]
```

Plus all your NEXT_PUBLIC_FIREBASE_* variables.

## Step 2: Deploy

```bash
cd /Users/aayanhetamsaria/Downloads/Inspirit_project/chess-coach-ai
vercel --prod
```

Wait 2-3 minutes for build.

## Step 3: Test

Visit: https://chessmasti.com
Load demo game, click "Analyze My Game", verify puzzles work.

Done! 🎉
