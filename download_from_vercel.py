#!/usr/bin/env python3
"""Descarga todos los archivos de un deployment de Vercel"""
import json
import os
import urllib.request
import urllib.error

TOKEN = "vca_4nRlTh6b0tbavvpC9sHpa27QB1wHXk6CVwiACASkj5v2klo1tB3mq102"
TEAM_ID = "team_AtHSWVUCrU0jPVxtbFe1MwB5"
DEPLOY_ID = "dpl_2cnqsW9xkPJqNBkekhSqUrvHg4q2"
BASE_DIR = "D:/github/volvix-pos"

HEADERS = {"Authorization": f"Bearer {TOKEN}"}

def fetch(url):
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        return urllib.request.urlopen(req, timeout=30).read()
    except urllib.error.HTTPError as e:
        print(f"  ❌ HTTP {e.code}: {url[:80]}")
        return None
    except Exception as e:
        print(f"  ❌ {e}: {url[:80]}")
        return None

def list_files():
    url = f"https://api.vercel.com/v6/deployments/{DEPLOY_ID}/files?teamId={TEAM_ID}"
    data = fetch(url)
    return json.loads(data)

def download_file(uid, path):
    url = f"https://api.vercel.com/v7/deployments/{DEPLOY_ID}/files/{uid}?teamId={TEAM_ID}"
    raw = fetch(url)
    if raw is None:
        return False

    # Vercel returns base64-encoded JSON
    try:
        wrapped = json.loads(raw)
        if "data" in wrapped:
            import base64
            content = base64.b64decode(wrapped["data"])
        else:
            content = raw
    except (json.JSONDecodeError, KeyError):
        content = raw

    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(content)
    return True

def walk_tree(node, current_path, downloaded=[0], failed=[0]):
    """Recurse through the tree, downloading files"""
    for child in node.get("children", []):
        name = child["name"]
        full_path = os.path.join(current_path, name).replace("\\", "/")

        if child["type"] == "directory":
            walk_tree(child, full_path, downloaded, failed)
        elif child["type"] == "file":
            uid = child.get("uid")
            if uid:
                if downloaded[0] % 20 == 0:
                    print(f"  [{downloaded[0]}] {full_path[-70:]}")
                if download_file(uid, full_path):
                    downloaded[0] += 1
                else:
                    failed[0] += 1

def main():
    print("📥 Listando archivos del deployment...")
    tree = list_files()

    if not isinstance(tree, list):
        print(f"❌ Error: respuesta inesperada: {tree}")
        return

    print(f"✅ Estructura raíz: {len(tree)} entradas")

    downloaded = [0]
    failed = [0]

    for entry in tree:
        name = entry["name"]
        full_path = os.path.join(BASE_DIR, name).replace("\\", "/")

        if entry["type"] == "directory":
            print(f"\n📁 Procesando: {name}/")
            walk_tree(entry, full_path, downloaded, failed)
        elif entry["type"] == "file":
            uid = entry.get("uid")
            if uid:
                print(f"📄 {name}")
                if download_file(uid, full_path):
                    downloaded[0] += 1
                else:
                    failed[0] += 1

    print(f"\n✅ Descargados: {downloaded[0]}")
    if failed[0] > 0:
        print(f"⚠️  Fallaron: {failed[0]}")

if __name__ == "__main__":
    main()
