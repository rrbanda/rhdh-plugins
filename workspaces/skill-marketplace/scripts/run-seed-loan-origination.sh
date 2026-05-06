#!/usr/bin/env bash
set -euo pipefail

NEO4J_URL="${NEO4J_URL:-}"
NEO4J_USER="${NEO4J_USER:-neo4j}"
NEO4J_PASS="${NEO4J_PASS:-}"

if [[ -z "$NEO4J_URL" || -z "$NEO4J_PASS" ]]; then
  echo "ERROR: Set NEO4J_URL and NEO4J_PASS environment variables"
  echo "  Example: NEO4J_URL=https://neo4j-http.example.com NEO4J_PASS=secret $0"
  exit 1
fi
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CYPHER_FILES=(
  "${SCRIPT_DIR}/seed-loan-origination.cypher"
  "${SCRIPT_DIR}/seed-loan-origination-relationships.cypher"
)

for f in "${CYPHER_FILES[@]}"; do
  if [[ ! -f "$f" ]]; then
    echo "ERROR: $f not found"
    exit 1
  fi
done

echo "Seeding Neo4j at $NEO4J_URL with loan origination skills..."

for CYPHER_FILE in "${CYPHER_FILES[@]}"; do
  echo ""
  echo "=== Processing: $(basename "$CYPHER_FILE") ==="
  python3 - "$CYPHER_FILE" "$NEO4J_URL" "$NEO4J_USER" "$NEO4J_PASS" <<'PYTHON'
import sys, json, urllib.request, urllib.error, base64

cypher_file = sys.argv[1]
neo4j_url = sys.argv[2]
neo4j_user = sys.argv[3]
neo4j_pass = sys.argv[4]

with open(cypher_file) as f:
    content = f.read()

lines = []
for line in content.split('\n'):
    stripped = line.strip()
    if stripped.startswith('//'):
        continue
    lines.append(line)
content = '\n'.join(lines)

statements = []
current = []
for line in content.split('\n'):
    current.append(line)
    if line.rstrip().endswith(';'):
        stmt = '\n'.join(current).strip().rstrip(';').strip()
        if stmt:
            statements.append(stmt)
        current = []
if current:
    stmt = '\n'.join(current).strip().rstrip(';').strip()
    if stmt:
        statements.append(stmt)

print(f"Parsed {len(statements)} Cypher statements")

auth = base64.b64encode(f"{neo4j_user}:{neo4j_pass}".encode()).decode()
endpoint = f"{neo4j_url}/db/neo4j/tx/commit"

BATCH_SIZE = 20
total_ok = 0
total_err = 0

for batch_start in range(0, len(statements), BATCH_SIZE):
    batch = statements[batch_start:batch_start + BATCH_SIZE]
    payload = {"statements": [{"statement": s} for s in batch]}
    body = json.dumps(payload).encode()
    req = urllib.request.Request(
        endpoint,
        data=body,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Basic {auth}",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            result = json.loads(resp.read())
            if result.get("errors"):
                for err in result["errors"]:
                    total_err += 1
                    print(f"  ERROR: {err['message'][:150]}")
                total_ok += len(batch) - len(result["errors"])
            else:
                total_ok += len(batch)
                print(f"  Batch {batch_start//BATCH_SIZE + 1}: {len(batch)} statements OK")
    except urllib.error.HTTPError as e:
        total_err += len(batch)
        print(f"  Batch {batch_start//BATCH_SIZE + 1}: HTTP {e.code}: {e.read().decode()[:150]}")
    except Exception as e:
        total_err += len(batch)
        print(f"  Batch {batch_start//BATCH_SIZE + 1}: {e}")

print(f"\nDone! {total_ok}/{total_ok+total_err} statements succeeded, {total_err} errors.")
PYTHON
done

echo ""
echo "=== All files processed ==="
