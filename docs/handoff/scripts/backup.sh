#!/bin/bash
DATE=$(date +%Y%m%d-%H%M%S)
mkdir -p ~/volvix-backups/$DATE
git bundle create ~/volvix-backups/$DATE/repo.bundle --all
supabase db dump --linked > ~/volvix-backups/$DATE/db.sql 2>/dev/null
echo "Backup en ~/volvix-backups/$DATE/"
