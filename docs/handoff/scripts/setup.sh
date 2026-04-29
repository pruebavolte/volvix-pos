#!/bin/bash
# Setup nueva máquina
git clone https://github.com/pruebavolte/volvix-pos
cd volvix-pos
npm install
echo "Ahora configura env vars (ver docs/handoff/SECRETS-TO-ADD.txt)"
echo "Después: vercel link && vercel --prod"
