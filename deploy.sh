#!/bin/bash

# Quick Deployment Script for Chess Coach AI
# This script helps you deploy to Vercel (recommended) or prepare for AWS deployment

set -e

echo "🚀 Chess Coach AI Deployment Helper"
echo "===================================="
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: package.json not found. Please run this script from the chess-coach-ai directory."
    exit 1
fi

# Check for required environment variables
if [ -z "$OPENAI_API_KEY" ]; then
    echo "⚠️  Warning: OPENAI_API_KEY not set in environment"
    echo "   You'll need to set this in your deployment platform"
    echo ""
fi

# Function to deploy to Vercel
deploy_vercel() {
    echo "📦 Deploying to Vercel..."
    echo ""
    
    # Check if Vercel CLI is installed
    if ! command -v vercel &> /dev/null; then
        echo "Installing Vercel CLI..."
        npm install -g vercel
    fi
    
    # Check if logged in
    if ! vercel whoami &> /dev/null; then
        echo "Please login to Vercel:"
        vercel login
    fi
    
    echo "Building and deploying..."
    vercel --prod
    
    echo ""
    echo "✅ Deployment complete!"
    echo ""
    echo "📝 Next steps:"
    echo "1. Go to your Vercel dashboard"
    echo "2. Navigate to Settings → Environment Variables"
    echo "3. Add OPENAI_API_KEY with your API key"
    echo "4. Redeploy to apply environment variables"
}

# Function to prepare for AWS deployment
prepare_aws() {
    echo "☁️  Preparing for AWS deployment..."
    echo ""
    
    # Check if CDK is installed
    if ! command -v cdk &> /dev/null; then
        echo "Installing AWS CDK..."
        npm install -g aws-cdk
    fi
    
    # Check AWS credentials
    if ! aws sts get-caller-identity &> /dev/null; then
        echo "❌ AWS credentials not configured"
        echo "   Please run: aws configure"
        exit 1
    fi
    
    echo "⚠️  Important: Your app has API routes that need server-side execution."
    echo "   The current CDK setup is for static sites only."
    echo ""
    echo "   Options:"
    echo "   1. Use Vercel (recommended) - supports API routes automatically"
    echo "   2. Use AWS Amplify - supports Next.js API routes"
    echo "   3. Modify CDK to use serverless Next.js construct"
    echo ""
    echo "   See DEPLOYMENT_GUIDE.md for details"
}

# Main menu
echo "Select deployment method:"
echo "1) Vercel (Recommended - Easiest)"
echo "2) Prepare for AWS (Check setup)"
echo "3) Build only (Test build)"
echo ""
read -p "Enter choice [1-3]: " choice

case $choice in
    1)
        deploy_vercel
        ;;
    2)
        prepare_aws
        ;;
    3)
        echo "🔨 Building application..."
        npm run build
        echo "✅ Build complete!"
        ;;
    *)
        echo "❌ Invalid choice"
        exit 1
        ;;
esac

