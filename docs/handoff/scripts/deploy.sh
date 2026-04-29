#!/bin/bash
# Deploy a producción
cd "$(dirname "$0")/../../.."
git push origin main && vercel --prod --yes
