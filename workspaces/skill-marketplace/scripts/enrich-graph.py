#!/usr/bin/env python3
"""
Enrich the Neo4j skill graph with:
1. 768-dim embeddings for all skills (via LlamaStack nomic-embed-text-v1-5)
2. Vector index (skill_embedding_idx)
3. SIMILAR_TO edges computed from cosine similarity >= 0.70
4. DEPENDS_ON edges (logical workflow dependencies)
5. COMPLEMENTS edges (complementary skills)
6. ALTERNATIVE_TO edges (different granularity of same concept)
"""
import json
import urllib.request
import urllib.error
import base64
import time

import os

EMBEDDING_URL = os.environ.get("EMBEDDING_URL", "https://llamastack-llamastack.apps.ocp.v7hjl.sandbox2288.opentlc.com/v1/embeddings")
EMBEDDING_MODEL = os.environ.get("EMBEDDING_MODEL", "vllm-embedding/nomic-embed-text-v1-5")
NEO4J_URL = os.environ.get("NEO4J_HTTP_URL", "https://neo4j-http-skills-marketplace.apps.ocp.v7hjl.sandbox2288.opentlc.com")
NEO4J_USER = os.environ.get("NEO4J_USER", "neo4j")
NEO4J_PASS = os.environ.get("NEO4J_PASSWORD", "")
NEO4J_DB = os.environ.get("NEO4J_DATABASE", "neo4j")

SIMILARITY_THRESHOLD = 0.70
SIMILAR_TO_TOP_K = 5


def neo4j_query(statements):
    auth = base64.b64encode(f"{NEO4J_USER}:{NEO4J_PASS}".encode()).decode()
    body = json.dumps({"statements": statements}).encode()
    req = urllib.request.Request(
        f"{NEO4J_URL}/db/{NEO4J_DB}/tx/commit",
        data=body,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Basic {auth}",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read())


def get_embeddings(texts):
    body = json.dumps({"model": EMBEDDING_MODEL, "input": texts}).encode()
    req = urllib.request.Request(
        EMBEDDING_URL,
        data=body,
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = json.loads(resp.read())
    return [item["embedding"] for item in data["data"]]


def phase1_generate_embeddings():
    """Generate embeddings for all skills and store in Neo4j."""
    print("\n=== Phase 1: Generate Embeddings ===")

    result = neo4j_query([{
        "statement": "MATCH (s:Skill) RETURN s.name AS name, s.description AS description ORDER BY s.name"
    }])
    skills = [(r["row"][0], r["row"][1]) for r in result["results"][0]["data"]]
    print(f"Found {len(skills)} skills to embed")

    # Embed in batches of 10
    BATCH_SIZE = 10
    all_embeddings = []
    for i in range(0, len(skills), BATCH_SIZE):
        batch = skills[i:i + BATCH_SIZE]
        texts = [f"{name}: {desc}" for name, desc in batch]
        embeddings = get_embeddings(texts)
        all_embeddings.extend(zip([s[0] for s in batch], embeddings))
        print(f"  Embedded {min(i + BATCH_SIZE, len(skills))}/{len(skills)}")

    # Store embeddings in Neo4j
    print("  Storing embeddings in Neo4j...")
    for name, embedding in all_embeddings:
        neo4j_query([{
            "statement": "MATCH (s:Skill {name: $name}) SET s.embedding = $embedding",
            "parameters": {"name": name, "embedding": embedding},
        }])

    print(f"  Stored {len(all_embeddings)} embeddings")
    return all_embeddings


def phase2_create_vector_index():
    """Create the vector index for semantic search."""
    print("\n=== Phase 2: Create Vector Index ===")

    # Create index with name that works for both smp-agents and backend
    # smp-agents uses 'skill_embedding_idx', backend uses 'skill_embedding'
    # Create both names pointing to same property
    for idx_name in ["skill_embedding_idx", "skill_embedding"]:
        try:
            neo4j_query([{
                "statement": f"DROP INDEX {idx_name} IF EXISTS"
            }])
        except Exception:
            pass

        result = neo4j_query([{
            "statement": f"""
                CREATE VECTOR INDEX {idx_name} IF NOT EXISTS
                FOR (s:Skill) ON (s.embedding)
                OPTIONS {{indexConfig: {{
                    `vector.dimensions`: 768,
                    `vector.similarity_function`: 'cosine'
                }}}}
            """
        }])
        if result.get("errors"):
            print(f"  Warning creating {idx_name}: {result['errors'][0]['message'][:100]}")
        else:
            print(f"  Created vector index: {idx_name}")

    # Wait for index to come online
    time.sleep(3)
    result = neo4j_query([{
        "statement": "SHOW INDEXES YIELD name, state WHERE name IN ['skill_embedding_idx', 'skill_embedding'] RETURN name, state"
    }])
    for r in result["results"][0]["data"]:
        print(f"  Index {r['row'][0]}: {r['row'][1]}")


def phase3_compute_similar_to():
    """Compute SIMILAR_TO edges from embedding similarity."""
    print("\n=== Phase 3: Compute SIMILAR_TO Edges ===")

    # Get all skills with embeddings
    result = neo4j_query([{
        "statement": "MATCH (s:Skill) WHERE s.embedding IS NOT NULL RETURN s.name AS name"
    }])
    skill_names = [r["row"][0] for r in result["results"][0]["data"]]
    print(f"  {len(skill_names)} skills with embeddings")

    # For each skill, find similar ones via vector index
    edges_created = 0
    for name in skill_names:
        result = neo4j_query([{
            "statement": """
                MATCH (source:Skill {name: $name})
                CALL db.index.vector.queryNodes('skill_embedding_idx', $topK, source.embedding)
                YIELD node, score
                WHERE node.name <> $name AND score >= $threshold
                WITH source, node, score
                MERGE (source)-[r:SIMILAR_TO]-(node)
                SET r.score = score
                RETURN count(r) AS created
            """,
            "parameters": {
                "name": name,
                "topK": SIMILAR_TO_TOP_K + 1,
                "threshold": SIMILARITY_THRESHOLD,
            },
        }])
        created = result["results"][0]["data"][0]["row"][0] if result["results"][0]["data"] else 0
        edges_created += created

    print(f"  Created/updated {edges_created} SIMILAR_TO edges (threshold >= {SIMILARITY_THRESHOLD})")


def phase4_add_depends_on():
    """Add DEPENDS_ON edges for logical workflow dependencies."""
    print("\n=== Phase 4: Add DEPENDS_ON Edges ===")

    dependencies = [
        # Underwriting depends on risk + compliance
        ("underwriting-decision", "risk-assessment"),
        ("underwriting-decision", "compliance-verification"),
        ("underwriting-decision", "condition-management"),
        # Risk assessment depends on credit and compliance KB
        ("risk-assessment", "credit-bureau-pull"),
        ("risk-assessment", "compliance-kb-search"),
        # Pipeline management depends on document completeness
        ("pipeline-management", "document-management"),
        # Application intake is a prerequisite for status tracking
        ("application-status-tracking", "application-intake"),
        # Condition response depends on document management
        ("condition-response", "document-management"),
        # Prequalification depends on affordability
        ("prequalification-estimate", "affordability-estimate"),
        # Predictive model uses risk assessment
        ("predictive-model-scoring", "risk-assessment"),
        # Pipeline analytics depends on pipeline management
        ("pipeline-analytics", "pipeline-management"),
        # Audit trail underpins compliance verification
        ("compliance-verification", "audit-trail-query"),
        # Engineering: how-to depends on pattern
        ("howto-build-langgraph-agent-with-rbac", "langgraph-multi-agent-orchestration"),
        ("howto-implement-pgvector-rag", "compliance-rag-tiered-boosting"),
        ("howto-add-pii-masking-middleware", "fair-lending-data-isolation"),
        ("howto-safety-shields", "langgraph-multi-agent-orchestration"),
        # Components depend on their how-to guides
        ("component-agent-router", "howto-build-langgraph-agent-with-rbac"),
        ("component-compliance-kb-ingestion", "howto-implement-pgvector-rag"),
        ("component-pii-masking-filter", "howto-add-pii-masking-middleware"),
        ("component-safety-shield-chain", "howto-safety-shields"),
    ]

    statements = []
    for source, target in dependencies:
        statements.append({
            "statement": """
                MATCH (a:Skill {name: $source}), (b:Skill {name: $target})
                MERGE (a)-[:DEPENDS_ON]->(b)
            """,
            "parameters": {"source": source, "target": target},
        })

    # Execute in batch
    result = neo4j_query(statements)
    errors = result.get("errors", [])
    print(f"  Created {len(dependencies) - len(errors)} DEPENDS_ON edges")
    if errors:
        for e in errors:
            print(f"  Error: {e['message'][:100]}")


def phase5_add_complements():
    """Add COMPLEMENTS edges between skills that work well together."""
    print("\n=== Phase 5: Add COMPLEMENTS Edges ===")

    complements = [
        # Business skill complements
        ("pipeline-management", "communication-drafting"),
        ("application-intake", "prequalification-estimate"),
        ("credit-bureau-pull", "prequalification-estimate"),
        ("risk-assessment", "predictive-model-scoring"),
        ("compliance-verification", "compliance-kb-search"),
        ("condition-management", "condition-response"),
        ("pipeline-analytics", "model-performance-monitoring"),
        ("document-management", "application-status-tracking"),
        ("audit-trail-query", "model-performance-monitoring"),
        # Engineering skill complements
        ("langgraph-multi-agent-orchestration", "role-scoped-agent-routing"),
        ("compliance-rag-tiered-boosting", "fair-lending-data-isolation"),
        ("hash-chained-audit-trail", "mcp-tool-server-pattern"),
        ("howto-build-langgraph-agent-with-rbac", "howto-safety-shields"),
        ("howto-implement-pgvector-rag", "howto-mlflow-agent-observability"),
        # Cross-track complements
        ("risk-assessment", "mcp-tool-server-pattern"),
        ("compliance-kb-search", "compliance-rag-tiered-boosting"),
    ]

    statements = []
    for source, target in complements:
        statements.append({
            "statement": """
                MATCH (a:Skill {name: $source}), (b:Skill {name: $target})
                MERGE (a)-[:COMPLEMENTS]->(b)
            """,
            "parameters": {"source": source, "target": target},
        })

    result = neo4j_query(statements)
    errors = result.get("errors", [])
    print(f"  Created {len(complements) - len(errors)} COMPLEMENTS edges")


def phase6_add_alternative_to():
    """Add ALTERNATIVE_TO edges for skills that serve similar purposes at different levels."""
    print("\n=== Phase 6: Add ALTERNATIVE_TO Edges ===")

    alternatives = [
        # Pattern vs Component (same concept, different granularity)
        ("howto-add-pii-masking-middleware", "component-pii-masking-filter"),
        ("howto-build-langgraph-agent-with-rbac", "component-agent-router"),
        ("howto-safety-shields", "component-safety-shield-chain"),
        ("howto-implement-pgvector-rag", "component-compliance-kb-ingestion"),
        # Business alternatives
        ("condition-management", "condition-response"),
        ("prequalification-estimate", "affordability-estimate"),
    ]

    statements = []
    for source, target in alternatives:
        statements.append({
            "statement": """
                MATCH (a:Skill {name: $source}), (b:Skill {name: $target})
                MERGE (a)-[:ALTERNATIVE_TO]->(b)
            """,
            "parameters": {"source": source, "target": target},
        })

    result = neo4j_query(statements)
    errors = result.get("errors", [])
    print(f"  Created {len(alternatives) - len(errors)} ALTERNATIVE_TO edges")


def verify():
    """Print final graph stats."""
    print("\n=== Final Verification ===")
    result = neo4j_query([
        {"statement": "MATCH (s:Skill) WHERE s.embedding IS NOT NULL RETURN count(s) AS withEmbeddings"},
        {"statement": "MATCH ()-[r:SIMILAR_TO]->() RETURN count(r) AS similarTo"},
        {"statement": "MATCH ()-[r:DEPENDS_ON]->() RETURN count(r) AS dependsOn"},
        {"statement": "MATCH ()-[r:COMPLEMENTS]->() RETURN count(r) AS complements"},
        {"statement": "MATCH ()-[r:ALTERNATIVE_TO]->() RETURN count(r) AS alternativeTo"},
        {"statement": "MATCH ()-[r]->() RETURN type(r) AS rel, count(r) AS cnt ORDER BY cnt DESC"},
    ])
    print(f"  Embeddings: {result['results'][0]['data'][0]['row'][0]}")
    print(f"  SIMILAR_TO: {result['results'][1]['data'][0]['row'][0]}")
    print(f"  DEPENDS_ON: {result['results'][2]['data'][0]['row'][0]}")
    print(f"  COMPLEMENTS: {result['results'][3]['data'][0]['row'][0]}")
    print(f"  ALTERNATIVE_TO: {result['results'][4]['data'][0]['row'][0]}")
    print(f"\n  All relationships:")
    for r in result["results"][5]["data"]:
        print(f"    {r['row'][0]}: {r['row'][1]}")


if __name__ == "__main__":
    print("Enriching Neo4j skill graph for agentic graph RAG...")
    phase1_generate_embeddings()
    phase2_create_vector_index()
    phase3_compute_similar_to()
    phase4_add_depends_on()
    phase5_add_complements()
    phase6_add_alternative_to()
    verify()
    print("\nDone! Graph is now ready for agentic RAG.")
