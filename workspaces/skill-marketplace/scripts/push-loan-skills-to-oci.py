#!/usr/bin/env python3
"""
Push loan origination skills as proper skillimage-compatible OCI images.

Each skill is pushed as a FROM-scratch OCI image with:
- Layer: tar.gz containing skill.yaml (SkillCard v1alpha1) + SKILL.md
- Config: {"architecture":"amd64","os":"linux","rootfs":{"type":"layers","diff_ids":["sha256:..."]}}
- Manifest: OCI image manifest with io.skillimage.* annotations

Compatible with: skillctl inspect, skillctl pull, skillctl serve (catalog)
"""
import io
import json
import hashlib
import gzip
import tarfile
import base64
import urllib.request
import urllib.error
import time
import yaml

import os

REGISTRY = os.environ.get("OCI_REGISTRY", "quay.io")
REPO = os.environ.get("OCI_REPO", "rbrhssa/mortgage-ai")
USERNAME = os.environ.get("OCI_USERNAME", "rbrhssa")
PASSWORD = os.environ.get("OCI_PASSWORD", "")

SKILLS = [
    # --- Bundle A: Mortgage AI Business Skills ---
    {
        "name": "product-info-lookup",
        "display_name": "Product Info Lookup",
        "namespace": "mortgage-ai",
        "description": "Retrieve available mortgage product information including rates, terms, and eligibility criteria. Part of the public-facing mortgage assistant.",
        "tags": ["mortgage", "products", "financial-services"],
        "compatibility": "agents",
        "bundle": "mortgage-ai-business-skills",
    },
    {
        "name": "affordability-estimate",
        "display_name": "Affordability Estimate",
        "namespace": "mortgage-ai",
        "description": "Calculate mortgage affordability from income, debts, down payment, interest rate, and loan term. Returns maximum loan amount and monthly payment estimates.",
        "tags": ["mortgage", "calculator", "financial-services"],
        "compatibility": "agents",
        "bundle": "mortgage-ai-business-skills",
    },
    {
        "name": "application-intake",
        "display_name": "Application Intake",
        "namespace": "mortgage-ai",
        "description": "Start or continue a mortgage application, validate and store borrower data fields with progress tracking across multiple sections.",
        "tags": ["mortgage", "application", "intake"],
        "compatibility": "agents",
        "bundle": "mortgage-ai-business-skills",
    },
    {
        "name": "document-management",
        "display_name": "Document Management",
        "namespace": "mortgage-ai",
        "description": "Upload documents, check completeness against requirements, track processing status, and verify document quality for mortgage applications.",
        "tags": ["documents", "upload", "completeness"],
        "compatibility": "agents",
        "bundle": "mortgage-ai-business-skills",
    },
    {
        "name": "application-status-tracking",
        "display_name": "Application Status Tracking",
        "namespace": "mortgage-ai",
        "description": "Track application stage, pending actions, regulatory deadlines (Reg B, TRID), rate lock status, and disclosure acknowledgments.",
        "tags": ["mortgage", "status", "tracking"],
        "compatibility": "agents",
        "bundle": "mortgage-ai-business-skills",
    },
    {
        "name": "condition-response",
        "display_name": "Condition Response",
        "namespace": "mortgage-ai",
        "description": "List open underwriting conditions, respond with documentation or text, check whether conditions are satisfied by uploaded documents.",
        "tags": ["mortgage", "conditions", "underwriting"],
        "compatibility": "agents",
        "bundle": "mortgage-ai-business-skills",
    },
    {
        "name": "prequalification-estimate",
        "display_name": "Prequalification Estimate",
        "namespace": "mortgage-ai",
        "description": "Preliminary prequalification from self-reported financials and soft credit pull score for mortgage lending.",
        "tags": ["mortgage", "prequalification", "credit"],
        "compatibility": "agents",
        "bundle": "mortgage-ai-business-skills",
    },
    {
        "name": "pipeline-management",
        "display_name": "Pipeline Management",
        "namespace": "mortgage-ai",
        "description": "View loan pipeline by stage, review application details, check underwriting readiness, and submit applications to underwriting with stage transitions.",
        "tags": ["mortgage", "pipeline", "loan-officer"],
        "compatibility": "agents",
        "bundle": "mortgage-ai-business-skills",
    },
    {
        "name": "credit-bureau-pull",
        "display_name": "Credit Bureau Pull",
        "namespace": "mortgage-ai",
        "description": "Perform soft or hard credit pulls via credit bureau service, store credit reports, and use scores for prequalification decisions.",
        "tags": ["credit", "bureau", "loan-officer"],
        "compatibility": "agents",
        "bundle": "mortgage-ai-business-skills",
    },
    {
        "name": "compliance-kb-search",
        "display_name": "Compliance KB Search",
        "namespace": "mortgage-ai",
        "description": "Semantic search across tiered compliance knowledge base (federal regulations > agency guidelines > internal policies) with conflict detection.",
        "tags": ["compliance", "rag", "knowledge-base"],
        "compatibility": "agents",
        "bundle": "mortgage-ai-business-skills",
    },
    {
        "name": "communication-drafting",
        "display_name": "Communication Drafting",
        "namespace": "mortgage-ai",
        "description": "Draft communications to borrowers using application context (completeness, conditions, rate lock status) and record as audit events.",
        "tags": ["communication", "loan-officer"],
        "compatibility": "agents",
        "bundle": "mortgage-ai-business-skills",
    },
    {
        "name": "risk-assessment",
        "display_name": "Risk Assessment",
        "namespace": "mortgage-ai",
        "description": "Comprehensive risk assessment using MCP tools: DTI calculation, LTV analysis, credit risk evaluation, income stability, asset sufficiency, and aggregated recommendation.",
        "tags": ["risk", "underwriting", "mcp", "compliance"],
        "compatibility": "agents",
        "bundle": "mortgage-ai-business-skills",
    },
    {
        "name": "compliance-verification",
        "display_name": "Compliance Verification",
        "namespace": "mortgage-ai",
        "description": "Run ECOA, ATR/QM, and TRID compliance checks against application data, generate compliance results with pass/fail/warning status.",
        "tags": ["compliance", "ecoa", "trid", "atr-qm"],
        "compatibility": "agents",
        "bundle": "mortgage-ai-business-skills",
    },
    {
        "name": "condition-management",
        "display_name": "Condition Management",
        "namespace": "mortgage-ai",
        "description": "Issue, review, clear, waive, or return underwriting conditions with full lifecycle tracking and summary counts.",
        "tags": ["conditions", "underwriting", "lifecycle"],
        "compatibility": "agents",
        "bundle": "mortgage-ai-business-skills",
    },
    {
        "name": "underwriting-decision",
        "display_name": "Underwriting Decision",
        "namespace": "mortgage-ai",
        "description": "Two-phase decision rendering (propose then confirm), adverse action notice generation (ECOA/FCRA), Loan Estimate and Closing Disclosure document generation.",
        "tags": ["decision", "underwriting", "adverse-action"],
        "compatibility": "agents",
        "bundle": "mortgage-ai-business-skills",
    },
    {
        "name": "predictive-model-scoring",
        "display_name": "Predictive Model Scoring",
        "namespace": "mortgage-ai",
        "description": "External ML model prediction for loan approval likelihood via MCP tool, augmenting rule-based risk factors.",
        "tags": ["predictive", "ml", "mcp"],
        "compatibility": "agents",
        "bundle": "mortgage-ai-business-skills",
    },
    {
        "name": "pipeline-analytics",
        "display_name": "Pipeline Analytics",
        "namespace": "mortgage-ai",
        "description": "Executive pipeline summary: stage counts, pull-through rates, turn times, denial trends by reason/product, loan officer performance metrics.",
        "tags": ["analytics", "executive", "pipeline"],
        "compatibility": "agents",
        "bundle": "mortgage-ai-business-skills",
    },
    {
        "name": "audit-trail-query",
        "display_name": "Audit Trail Query",
        "namespace": "mortgage-ai",
        "description": "Query hash-chained audit events by application, search by date range and event type, trace decision lineage.",
        "tags": ["audit", "compliance", "traceability"],
        "compatibility": "agents",
        "bundle": "mortgage-ai-business-skills",
    },
    {
        "name": "model-performance-monitoring",
        "display_name": "Model Performance Monitoring",
        "namespace": "mortgage-ai",
        "description": "Monitor LLM model latency (p50/p95/p99), token usage, error rates, and routing distribution via MLflow/LangFuse.",
        "tags": ["monitoring", "mlflow", "observability"],
        "compatibility": "agents",
        "bundle": "mortgage-ai-business-skills",
    },
    # --- Bundle B: Multi-Agent Engineering Patterns ---
    {
        "name": "langgraph-multi-agent-orchestration",
        "display_name": "LangGraph Multi-Agent Orchestration",
        "namespace": "agent-patterns",
        "description": "Architecture pattern for routing N persona agents via RBAC. LangGraph StateGraph with input_shield, agent, tool_auth, and output_shield nodes.",
        "tags": ["pattern", "langgraph", "multi-agent", "orchestration"],
        "compatibility": "agents",
        "bundle": "multi-agent-engineering-patterns",
    },
    {
        "name": "compliance-rag-tiered-boosting",
        "display_name": "Compliance RAG Tiered Boosting",
        "namespace": "agent-patterns",
        "description": "RAG pattern with pgvector cosine similarity search and tiered source boosting: federal (1.5x) > agency (1.2x) > internal (1.0x). Includes conflict detection.",
        "tags": ["pattern", "rag", "pgvector", "compliance"],
        "compatibility": "agents",
        "bundle": "multi-agent-engineering-patterns",
    },
    {
        "name": "fair-lending-data-isolation",
        "display_name": "Fair Lending Data Isolation",
        "namespace": "agent-patterns",
        "description": "Pattern for HMDA demographic data isolation in a separate database schema with access controls preventing agent access to protected characteristics.",
        "tags": ["pattern", "fair-lending", "hmda", "security"],
        "compatibility": "agents",
        "bundle": "multi-agent-engineering-patterns",
    },
    {
        "name": "hash-chained-audit-trail",
        "display_name": "Hash-Chained Audit Trail",
        "namespace": "agent-patterns",
        "description": "Append-only audit event pattern with SHA-256 hash chaining and advisory locks for tamper-evident logging.",
        "tags": ["pattern", "audit", "hash-chain", "security"],
        "compatibility": "agents",
        "bundle": "multi-agent-engineering-patterns",
    },
    {
        "name": "role-scoped-agent-routing",
        "display_name": "Role-Scoped Agent Routing",
        "namespace": "agent-patterns",
        "description": "Pattern for RBAC-based agent selection: JWT role claim maps to agent config, per-tool allowed_roles enforcement, data scope narrowing per persona.",
        "tags": ["pattern", "rbac", "routing", "keycloak"],
        "compatibility": "agents",
        "bundle": "multi-agent-engineering-patterns",
    },
    {
        "name": "mcp-tool-server-pattern",
        "display_name": "MCP Tool Server Pattern",
        "namespace": "agent-patterns",
        "description": "Pattern for extracting domain logic into a standalone MCP server (FastMCP + Streamable HTTP). Enables reuse across agents and external ML model integration.",
        "tags": ["pattern", "mcp", "tool-server", "reuse"],
        "compatibility": "agents",
        "bundle": "multi-agent-engineering-patterns",
    },
    {
        "name": "howto-build-langgraph-agent-with-rbac",
        "display_name": "How-to: Build LangGraph Agent with RBAC",
        "namespace": "agent-patterns",
        "description": "Step-by-step guide to building a LangGraph agent with RBAC tool filtering: define StateGraph, add shield nodes, wire tool_auth to YAML-driven allowed_roles.",
        "tags": ["how-to", "langgraph", "rbac", "agent"],
        "compatibility": "agents",
        "bundle": "multi-agent-engineering-patterns",
    },
    {
        "name": "howto-implement-pgvector-rag",
        "display_name": "How-to: Implement pgvector RAG",
        "namespace": "agent-patterns",
        "description": "How to set up pgvector embeddings, ingest documents with tiered metadata, implement cosine similarity search with boost factors, and detect source conflicts.",
        "tags": ["how-to", "rag", "pgvector", "embeddings"],
        "compatibility": "agents",
        "bundle": "multi-agent-engineering-patterns",
    },
    {
        "name": "howto-add-pii-masking-middleware",
        "display_name": "How-to: PII Masking Middleware",
        "namespace": "agent-patterns",
        "description": "How to implement FastAPI middleware that recursively masks SSN, DOB, and account numbers in JSON responses based on user role data scope.",
        "tags": ["how-to", "pii", "masking", "fastapi"],
        "compatibility": "agents",
        "bundle": "multi-agent-engineering-patterns",
    },
    {
        "name": "howto-vision-document-extraction",
        "display_name": "How-to: Vision Document Extraction",
        "namespace": "agent-patterns",
        "description": "How to integrate a vision model for extracting text and structured data from uploaded document images within an agent tool.",
        "tags": ["how-to", "vision", "document-extraction"],
        "compatibility": "agents",
        "bundle": "multi-agent-engineering-patterns",
    },
    {
        "name": "howto-mcp-predictive-model",
        "display_name": "How-to: MCP Predictive Model",
        "namespace": "agent-patterns",
        "description": "How to connect an external predictive ML model as an MCP server tool, handle graceful degradation when unavailable, and integrate predictions into agent workflow.",
        "tags": ["how-to", "mcp", "predictive-model", "ml"],
        "compatibility": "agents",
        "bundle": "multi-agent-engineering-patterns",
    },
    {
        "name": "howto-safety-shields",
        "display_name": "How-to: Safety Shields",
        "namespace": "agent-patterns",
        "description": "How to implement input/output safety shields using NeMo Guardrails: LangGraph shield nodes, refusal detection, fail-closed error handling.",
        "tags": ["how-to", "safety-shields", "nemo", "guardrails"],
        "compatibility": "agents",
        "bundle": "multi-agent-engineering-patterns",
    },
    {
        "name": "howto-mlflow-agent-observability",
        "display_name": "How-to: MLflow Agent Observability",
        "namespace": "agent-patterns",
        "description": "How to configure MLflow on OpenShift AI for agent tracing, token usage tracking, latency histograms, and model evaluation.",
        "tags": ["how-to", "mlflow", "observability", "openshift-ai"],
        "compatibility": "agents",
        "bundle": "multi-agent-engineering-patterns",
    },
    {
        "name": "component-compliance-kb-ingestion",
        "display_name": "Component: Compliance KB Ingestion",
        "namespace": "agent-patterns",
        "description": "Reusable script for ingesting YAML-frontmatter Markdown documents into pgvector with chunk splitting, embedding generation, and tier metadata tagging.",
        "tags": ["reusable-code", "ingestion", "pgvector"],
        "compatibility": "agents",
        "bundle": "multi-agent-engineering-patterns",
    },
    {
        "name": "component-audit-event-model",
        "display_name": "Component: Audit Event Model",
        "namespace": "agent-patterns",
        "description": "SQLAlchemy model and service for append-only audit events with SHA-256 hash chaining, advisory locks, and typed event categories.",
        "tags": ["reusable-code", "audit", "sqlalchemy"],
        "compatibility": "agents",
        "bundle": "multi-agent-engineering-patterns",
    },
    {
        "name": "component-pii-masking-filter",
        "display_name": "Component: PII Masking Filter",
        "namespace": "agent-patterns",
        "description": "Extractable FastAPI middleware that recursively masks PII fields (SSN, DOB, account numbers) in JSON responses based on request-scoped flags.",
        "tags": ["reusable-code", "pii", "middleware", "fastapi"],
        "compatibility": "agents",
        "bundle": "multi-agent-engineering-patterns",
    },
    {
        "name": "component-agent-router",
        "display_name": "Component: Agent Router",
        "namespace": "agent-patterns",
        "description": "Role-based LangGraph agent router: loads YAML agent configs, resolves persona from JWT claims, builds per-role tool sets with allowed_roles filtering.",
        "tags": ["reusable-code", "router", "rbac", "langgraph"],
        "compatibility": "agents",
        "bundle": "multi-agent-engineering-patterns",
    },
    {
        "name": "component-document-extractor",
        "display_name": "Component: Document Extractor",
        "namespace": "agent-patterns",
        "description": "Vision model tool function for document image extraction: accepts image bytes, calls vision LLM endpoint, returns structured text and metadata.",
        "tags": ["reusable-code", "vision", "extraction"],
        "compatibility": "agents",
        "bundle": "multi-agent-engineering-patterns",
    },
    {
        "name": "component-safety-shield-chain",
        "display_name": "Component: Safety Shield Chain",
        "namespace": "agent-patterns",
        "description": "LangGraph pre/post processing nodes implementing NeMo Guardrails integration: input validation, output filtering, escalation detection, fail-closed semantics.",
        "tags": ["reusable-code", "safety", "guardrails", "langgraph"],
        "compatibility": "agents",
        "bundle": "multi-agent-engineering-patterns",
    },
]


def generate_skill_yaml(skill: dict) -> str:
    """Generate a proper SkillCard v1alpha1 YAML."""
    card = {
        "apiVersion": "skillimage.io/v1alpha1",
        "kind": "SkillCard",
        "metadata": {
            "name": skill["name"],
            "namespace": skill["namespace"],
            "version": "1.0.0",
            "description": skill["description"],
            "display-name": skill["display_name"],
            "tags": skill["tags"],
            "authors": [{"name": "Red Hat AI Quickstart"}],
            "license": "Apache-2.0",
            "compatibility": skill.get("compatibility", "agents"),
        },
        "provenance": {
            "source": "https://github.com/rrbanda/multi-agent-loan-origination",
        },
        "spec": {
            "prompt": "SKILL.md",
        },
    }
    return yaml.dump(card, default_flow_style=False, sort_keys=False)


def generate_skill_md(skill: dict) -> str:
    """Generate the SKILL.md prompt content."""
    return f"""# {skill['display_name']}

{skill['description']}

## Overview

This skill is part of the **{skill['bundle']}** bundle from the Multi-Agent Loan Origination system.

## Source

- Repository: [rrbanda/multi-agent-loan-origination](https://github.com/rrbanda/multi-agent-loan-origination)
- Provider: Red Hat AI Quickstart
- License: Apache-2.0
"""


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def build_tar_gz(skill_yaml: str, skill_md: str) -> tuple:
    """
    Build a tar.gz containing skill.yaml + SKILL.md.
    Returns (compressed_bytes, uncompressed_sha256).
    """
    tar_buf = io.BytesIO()
    with tarfile.open(fileobj=tar_buf, mode="w") as tar:
        # Add skill.yaml
        yaml_bytes = skill_yaml.encode("utf-8")
        info = tarfile.TarInfo(name="skill.yaml")
        info.size = len(yaml_bytes)
        info.mtime = int(time.time())
        tar.addfile(info, io.BytesIO(yaml_bytes))

        # Add SKILL.md
        md_bytes = skill_md.encode("utf-8")
        info = tarfile.TarInfo(name="SKILL.md")
        info.size = len(md_bytes)
        info.mtime = int(time.time())
        tar.addfile(info, io.BytesIO(md_bytes))

    tar_bytes = tar_buf.getvalue()
    uncompressed_digest = sha256_bytes(tar_bytes)
    compressed = gzip.compress(tar_bytes)
    return compressed, uncompressed_digest


def get_token() -> str:
    auth = base64.b64encode(f"{USERNAME}:{PASSWORD}".encode()).decode()
    url = f"https://{REGISTRY}/v2/auth?service=quay.io&scope=repository:{REPO}:push,pull"
    req = urllib.request.Request(url, headers={"Authorization": f"Basic {auth}"})
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read())
        return data["token"]


def upload_blob(token: str, content: bytes) -> str:
    digest = f"sha256:{sha256_bytes(content)}"
    # Check if exists
    check_url = f"https://{REGISTRY}/v2/{REPO}/blobs/{digest}"
    req = urllib.request.Request(
        check_url, method="HEAD", headers={"Authorization": f"Bearer {token}"}
    )
    try:
        urllib.request.urlopen(req)
        return digest
    except urllib.error.HTTPError:
        pass

    # Start upload
    start_url = f"https://{REGISTRY}/v2/{REPO}/blobs/uploads/"
    req = urllib.request.Request(
        start_url, method="POST", headers={"Authorization": f"Bearer {token}"}
    )
    with urllib.request.urlopen(req) as resp:
        location = resp.headers["Location"]

    # Complete monolithic upload
    sep = "&" if "?" in location else "?"
    put_url = f"{location}{sep}digest={digest}"
    req = urllib.request.Request(
        put_url,
        data=content,
        method="PUT",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/octet-stream",
            "Content-Length": str(len(content)),
        },
    )
    urllib.request.urlopen(req)
    return digest


def push_skill(token: str, skill: dict, idx: int):
    skill_yaml = generate_skill_yaml(skill)
    skill_md = generate_skill_md(skill)

    # Build proper tar.gz layer
    layer_compressed, uncompressed_hash = build_tar_gz(skill_yaml, skill_md)
    layer_digest = upload_blob(token, layer_compressed)

    # Build image config with rootfs.diff_ids
    image_config = json.dumps({
        "architecture": "amd64",
        "os": "linux",
        "rootfs": {
            "type": "layers",
            "diff_ids": [f"sha256:{uncompressed_hash}"],
        },
    }).encode()
    config_digest = upload_blob(token, image_config)

    # Build manifest with skillimage annotations
    word_count = len(skill_md.split())
    annotations = {
        "org.opencontainers.image.title": skill["display_name"],
        "org.opencontainers.image.version": "1.0.0",
        "org.opencontainers.image.description": skill["description"][:256],
        "org.opencontainers.image.authors": "Red Hat AI Quickstart",
        "org.opencontainers.image.created": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "org.opencontainers.image.vendor": skill["namespace"],
        "org.opencontainers.image.licenses": "Apache-2.0",
        "org.opencontainers.image.source": "https://github.com/rrbanda/multi-agent-loan-origination",
        "io.skillimage.status": "published",
        "io.skillimage.tags": json.dumps(skill["tags"]),
        "io.skillimage.compatibility": skill.get("compatibility", "agents"),
        "io.skillimage.wordcount": str(word_count),
    }

    manifest = {
        "schemaVersion": 2,
        "mediaType": "application/vnd.oci.image.manifest.v1+json",
        "config": {
            "mediaType": "application/vnd.oci.image.config.v1+json",
            "digest": config_digest,
            "size": len(image_config),
        },
        "layers": [
            {
                "mediaType": "application/vnd.oci.image.layer.v1.tar+gzip",
                "digest": layer_digest,
                "size": len(layer_compressed),
            }
        ],
        "annotations": annotations,
    }

    # Tag: {name}-1.0.0 (published = bare version per skillimage convention)
    tag = f"{skill['name']}-1.0.0"
    manifest_json = json.dumps(manifest).encode()
    url = f"https://{REGISTRY}/v2/{REPO}/manifests/{tag}"
    req = urllib.request.Request(
        url,
        data=manifest_json,
        method="PUT",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/vnd.oci.image.manifest.v1+json",
        },
    )
    try:
        urllib.request.urlopen(req)
        if (idx + 1) % 5 == 0:
            print(f"  [{idx+1}/{len(SKILLS)}] pushed")
    except urllib.error.HTTPError as e:
        print(f"  ERROR pushing {skill['name']}: {e.code} {e.read().decode()[:100]}")


def main():
    print("Authenticating with Quay.io...")
    token = get_token()
    print(f"Pushing {len(SKILLS)} skills to {REGISTRY}/{REPO} (skillimage format)...")
    for i, skill in enumerate(SKILLS):
        push_skill(token, skill, i)
    print(f"\nDone! Pushed {len(SKILLS)} skills as proper skillimage OCI images.")
    print(f"Registry: {REGISTRY}/{REPO}")

    print("\nTriggering catalog sync...")
    try:
        req = urllib.request.Request(
            "https://skillctl-catalog-skill-catalog.apps.ocp.v7hjl.sandbox2288.opentlc.com/api/v1/sync",
            method="POST",
        )
        with urllib.request.urlopen(req) as resp:
            print(f"  Sync response: {resp.read().decode()}")
    except Exception as e:
        print(f"  Sync trigger failed (catalog may need configmap update): {e}")


if __name__ == "__main__":
    main()
