// ============================================================================
// Skills Marketplace Neo4j Seed: Multi-Agent Loan Origination
// Two bundles: (A) Mortgage AI Business Skills, (B) Multi-Agent Engineering Patterns
// Source: https://github.com/rrbanda/multi-agent-loan-origination
// ============================================================================

// --- DOMAINS ---
MERGE (d1:Domain {name: 'financial-services'})
SET d1.description = 'Financial services and mortgage lending domain',
    d1.color = '#2563eb';

MERGE (d2:Domain {name: 'compliance'})
SET d2.description = 'Regulatory compliance (ECOA, TRID, ATR/QM, FCRA, HMDA)',
    d2.color = '#dc2626';

MERGE (d3:Domain {name: 'agent-engineering'})
SET d3.description = 'Patterns and components for building multi-agent AI systems',
    d3.color = '#7c3aed';

MERGE (d4:Domain {name: 'document-processing'})
SET d4.description = 'Document extraction, validation, and management',
    d4.color = '#059669';

MERGE (d5:Domain {name: 'observability'})
SET d5.description = 'Monitoring, tracing, and evaluation of AI systems',
    d5.color = '#d97706';

MERGE (d6:Domain {name: 'security'})
SET d6.description = 'Security patterns including PII masking, RBAC, and safety shields',
    d6.color = '#e11d48';

// Domain hierarchy
MERGE (d1)-[:PARENT_OF]->(d2);

// --- TAGS ---
MERGE (tag_rag:Tag {name: 'rag'});
MERGE (tag_compliance:Tag {name: 'compliance'});
MERGE (tag_fair_lending:Tag {name: 'fair-lending'});
MERGE (tag_multi_agent:Tag {name: 'multi-agent'});
MERGE (tag_langgraph:Tag {name: 'langgraph'});
MERGE (tag_regulated:Tag {name: 'regulated-industry'});
MERGE (tag_mortgage:Tag {name: 'mortgage'});
MERGE (tag_rbac:Tag {name: 'rbac'});
MERGE (tag_pii:Tag {name: 'pii'});
MERGE (tag_audit:Tag {name: 'audit'});
MERGE (tag_safety:Tag {name: 'safety-shields'});
MERGE (tag_vision:Tag {name: 'vision'});
MERGE (tag_mcp:Tag {name: 'mcp'});
MERGE (tag_pattern:Tag {name: 'pattern'});
MERGE (tag_howto:Tag {name: 'how-to'});
MERGE (tag_component:Tag {name: 'reusable-code'});
MERGE (tag_risk:Tag {name: 'risk-assessment'});
MERGE (tag_underwriting:Tag {name: 'underwriting'});
MERGE (tag_analytics:Tag {name: 'analytics'});
MERGE (tag_fastapi:Tag {name: 'fastapi'});
MERGE (tag_pgvector:Tag {name: 'pgvector'});
MERGE (tag_openshift:Tag {name: 'openshift-ai'});

// --- TOOLS ---
MERGE (t_pgvector:Tool {name: 'pgvector-rag'})
SET t_pgvector.description = 'PostgreSQL pgvector for semantic similarity search with tiered compliance boosting',
    t_pgvector.version = '0.7.0';

MERGE (t_vision:Tool {name: 'vision-extraction'})
SET t_vision.description = 'Vision model integration for extracting text/data from document images';

MERGE (t_mcp_predict:Tool {name: 'mcp-predictive-model'})
SET t_mcp_predict.description = 'MCP server exposing check_loan_approval predictive ML tool',
    t_mcp_predict.version = '1.0.0';

MERGE (t_mcp_risk:Tool {name: 'mcp-risk-assessment'})
SET t_mcp_risk.description = 'FastMCP server with DTI, LTV, credit risk, income stability, asset sufficiency, and risk recommendation tools',
    t_mcp_risk.version = '1.0.0';

MERGE (t_langgraph:Tool {name: 'langgraph'})
SET t_langgraph.description = 'LangGraph framework for stateful multi-agent orchestration',
    t_langgraph.version = '0.2.0';

MERGE (t_sqlalchemy:Tool {name: 'sqlalchemy'})
SET t_sqlalchemy.description = 'SQLAlchemy 2.0 async ORM for PostgreSQL with Alembic migrations',
    t_sqlalchemy.version = '2.0';

MERGE (t_mlflow:Tool {name: 'mlflow'})
SET t_mlflow.description = 'MLflow on OpenShift AI for agent tracing, evaluation, and model monitoring';

MERGE (t_keycloak:Tool {name: 'keycloak'})
SET t_keycloak.description = 'Keycloak OIDC for identity, role-based access control, and JWT validation';

MERGE (t_minio:Tool {name: 'minio-s3'})
SET t_minio.description = 'MinIO S3-compatible object storage for document management';

MERGE (t_fastapi:Tool {name: 'fastapi'})
SET t_fastapi.description = 'FastAPI async web framework with WebSocket support for agent chat';

MERGE (t_nemo:Tool {name: 'nemo-guardrails'})
SET t_nemo.description = 'NVIDIA NeMo Guardrails for input/output safety filtering';

MERGE (t_prometheus:Tool {name: 'prometheus'})
SET t_prometheus.description = 'Prometheus metrics for LLM token usage, latency, and tool call tracking';

// --- AGENTS (5 mortgage lending agents) ---
MERGE (a1:Agent {name: 'public-assistant', namespace: 'mortgage-ai'})
SET a1.description = 'Public-facing assistant for prospects: product info and affordability estimates',
    a1.framework = 'langgraph',
    a1.protocol = 'a2a',
    a1.status = 'active',
    a1.provider = 'red-hat-ai-quickstart',
    a1.workloadType = 'deployment',
    a1.version = '1.0.0',
    a1.updatedAt = datetime();

MERGE (a2:Agent {name: 'borrower-assistant', namespace: 'mortgage-ai'})
SET a2.description = 'Borrower-facing assistant: application intake, document upload, status tracking, condition response, prequalification',
    a2.framework = 'langgraph',
    a2.protocol = 'a2a',
    a2.status = 'active',
    a2.provider = 'red-hat-ai-quickstart',
    a2.workloadType = 'deployment',
    a2.version = '1.0.0',
    a2.updatedAt = datetime();

MERGE (a3:Agent {name: 'loan-officer-assistant', namespace: 'mortgage-ai'})
SET a3.description = 'Loan officer assistant: pipeline management, application review, communication drafting, underwriting submission, credit pulls',
    a3.framework = 'langgraph',
    a3.protocol = 'a2a',
    a3.status = 'active',
    a3.provider = 'red-hat-ai-quickstart',
    a3.workloadType = 'deployment',
    a3.version = '1.0.0',
    a3.updatedAt = datetime();

MERGE (a4:Agent {name: 'underwriter-assistant', namespace: 'mortgage-ai'})
SET a4.description = 'Underwriter assistant: risk assessment via MCP tools, compliance verification (ECOA/ATR-QM/TRID), condition management, decision rendering, adverse action notices',
    a4.framework = 'langgraph',
    a4.protocol = 'a2a',
    a4.status = 'active',
    a4.provider = 'red-hat-ai-quickstart',
    a4.workloadType = 'deployment',
    a4.version = '1.0.0',
    a4.updatedAt = datetime();

MERGE (a5:Agent {name: 'ceo-assistant', namespace: 'mortgage-ai'})
SET a5.description = 'CEO assistant: pipeline analytics, audit trail exploration, decision trace, model performance monitoring',
    a5.framework = 'langgraph',
    a5.protocol = 'a2a',
    a5.status = 'active',
    a5.provider = 'red-hat-ai-quickstart',
    a5.workloadType = 'deployment',
    a5.version = '1.0.0',
    a5.updatedAt = datetime();

// ============================================================================
// BUNDLE A: Mortgage AI Business Skills
// ============================================================================

MERGE (bundleA:SkillBundle {name: 'mortgage-ai-business-skills'})
SET bundleA.id = randomUUID(),
    bundleA.description = 'Business-domain skills from the multi-agent mortgage lending system. Covers prospect inquiry, borrower application, loan officer pipeline management, underwriting, and executive analytics.',
    bundleA.author = 'red-hat-ai-quickstart',
    bundleA.status = 'published',
    bundleA.source = 'github',
    bundleA.createdAt = datetime(),
    bundleA.updatedAt = datetime();

// --- Business Skills ---

// Public Assistant skills
MERGE (bs_product_info:Skill {name: 'product-info-lookup'})
SET bs_product_info.description = 'Retrieve available mortgage product information including rates, terms, and eligibility criteria',
    bs_product_info.category = 'financial-services',
    bs_product_info.lifecycleState = 'published',
    bs_product_info.complexity = 'basic',
    bs_product_info.provenanceSource = 'github:rrbanda/multi-agent-loan-origination',
    bs_product_info.tags = ['mortgage', 'products', 'financial-services'],
    bs_product_info.author = 'red-hat-ai-quickstart',
    bs_product_info.updatedAt = datetime();

MERGE (bs_affordability:Skill {name: 'affordability-estimate'})
SET bs_affordability.description = 'Calculate mortgage affordability from income, debts, down payment, interest rate, and loan term. Returns maximum loan amount and monthly payment estimates.',
    bs_affordability.category = 'financial-services',
    bs_affordability.lifecycleState = 'published',
    bs_affordability.complexity = 'basic',
    bs_affordability.provenanceSource = 'github:rrbanda/multi-agent-loan-origination',
    bs_affordability.tags = ['mortgage', 'calculator', 'financial-services'],
    bs_affordability.author = 'red-hat-ai-quickstart',
    bs_affordability.updatedAt = datetime();

// Borrower Assistant skills
MERGE (bs_app_intake:Skill {name: 'application-intake'})
SET bs_app_intake.description = 'Start or continue a mortgage application, validate and store borrower data fields with progress tracking across multiple sections',
    bs_app_intake.category = 'financial-services',
    bs_app_intake.lifecycleState = 'published',
    bs_app_intake.complexity = 'intermediate',
    bs_app_intake.provenanceSource = 'github:rrbanda/multi-agent-loan-origination',
    bs_app_intake.tags = ['mortgage', 'application', 'intake'],
    bs_app_intake.author = 'red-hat-ai-quickstart',
    bs_app_intake.updatedAt = datetime();

MERGE (bs_doc_mgmt:Skill {name: 'document-management'})
SET bs_doc_mgmt.description = 'Upload documents, check completeness against requirements, track processing status, and verify document quality',
    bs_doc_mgmt.category = 'document-processing',
    bs_doc_mgmt.lifecycleState = 'published',
    bs_doc_mgmt.complexity = 'intermediate',
    bs_doc_mgmt.provenanceSource = 'github:rrbanda/multi-agent-loan-origination',
    bs_doc_mgmt.tags = ['documents', 'upload', 'completeness'],
    bs_doc_mgmt.author = 'red-hat-ai-quickstart',
    bs_doc_mgmt.updatedAt = datetime();

MERGE (bs_status_tracking:Skill {name: 'application-status-tracking'})
SET bs_status_tracking.description = 'Track application stage, pending actions, regulatory deadlines (Reg B, TRID), rate lock status, and disclosure acknowledgments',
    bs_status_tracking.category = 'financial-services',
    bs_status_tracking.lifecycleState = 'published',
    bs_status_tracking.complexity = 'basic',
    bs_status_tracking.provenanceSource = 'github:rrbanda/multi-agent-loan-origination',
    bs_status_tracking.tags = ['mortgage', 'status', 'tracking'],
    bs_status_tracking.author = 'red-hat-ai-quickstart',
    bs_status_tracking.updatedAt = datetime();

MERGE (bs_condition_response:Skill {name: 'condition-response'})
SET bs_condition_response.description = 'List open conditions, respond with documentation or text, check whether conditions are satisfied by uploaded documents',
    bs_condition_response.category = 'financial-services',
    bs_condition_response.lifecycleState = 'published',
    bs_condition_response.complexity = 'intermediate',
    bs_condition_response.provenanceSource = 'github:rrbanda/multi-agent-loan-origination',
    bs_condition_response.tags = ['mortgage', 'conditions', 'underwriting'],
    bs_condition_response.author = 'red-hat-ai-quickstart',
    bs_condition_response.updatedAt = datetime();

MERGE (bs_prequalification:Skill {name: 'prequalification-estimate'})
SET bs_prequalification.description = 'Preliminary prequalification from self-reported financials and soft credit pull score',
    bs_prequalification.category = 'financial-services',
    bs_prequalification.lifecycleState = 'published',
    bs_prequalification.complexity = 'intermediate',
    bs_prequalification.provenanceSource = 'github:rrbanda/multi-agent-loan-origination',
    bs_prequalification.tags = ['mortgage', 'prequalification', 'credit'],
    bs_prequalification.author = 'red-hat-ai-quickstart',
    bs_prequalification.updatedAt = datetime();

// Loan Officer skills
MERGE (bs_pipeline_mgmt:Skill {name: 'pipeline-management'})
SET bs_pipeline_mgmt.description = 'View pipeline by stage, review application details, check underwriting readiness, and submit applications to underwriting with stage transitions',
    bs_pipeline_mgmt.category = 'financial-services',
    bs_pipeline_mgmt.lifecycleState = 'published',
    bs_pipeline_mgmt.complexity = 'intermediate',
    bs_pipeline_mgmt.provenanceSource = 'github:rrbanda/multi-agent-loan-origination',
    bs_pipeline_mgmt.tags = ['mortgage', 'pipeline', 'loan-officer'],
    bs_pipeline_mgmt.author = 'red-hat-ai-quickstart',
    bs_pipeline_mgmt.updatedAt = datetime();

MERGE (bs_credit_pull:Skill {name: 'credit-bureau-pull'})
SET bs_credit_pull.description = 'Perform soft or hard credit pulls via credit bureau service, store credit reports, and use scores for prequalification decisions',
    bs_credit_pull.category = 'financial-services',
    bs_credit_pull.lifecycleState = 'published',
    bs_credit_pull.complexity = 'advanced',
    bs_credit_pull.provenanceSource = 'github:rrbanda/multi-agent-loan-origination',
    bs_credit_pull.tags = ['credit', 'bureau', 'loan-officer'],
    bs_credit_pull.author = 'red-hat-ai-quickstart',
    bs_credit_pull.updatedAt = datetime();

MERGE (bs_compliance_kb:Skill {name: 'compliance-kb-search'})
SET bs_compliance_kb.description = 'Semantic search across tiered compliance knowledge base (federal regulations > agency guidelines > internal policies) with conflict detection',
    bs_compliance_kb.category = 'compliance',
    bs_compliance_kb.lifecycleState = 'published',
    bs_compliance_kb.complexity = 'advanced',
    bs_compliance_kb.provenanceSource = 'github:rrbanda/multi-agent-loan-origination',
    bs_compliance_kb.tags = ['compliance', 'rag', 'knowledge-base'],
    bs_compliance_kb.author = 'red-hat-ai-quickstart',
    bs_compliance_kb.updatedAt = datetime();

MERGE (bs_communication:Skill {name: 'communication-drafting'})
SET bs_communication.description = 'Draft communications to borrowers using application context (completeness, conditions, rate lock status) and record as audit events',
    bs_communication.category = 'financial-services',
    bs_communication.lifecycleState = 'published',
    bs_communication.complexity = 'basic',
    bs_communication.provenanceSource = 'github:rrbanda/multi-agent-loan-origination',
    bs_communication.tags = ['communication', 'loan-officer'],
    bs_communication.author = 'red-hat-ai-quickstart',
    bs_communication.updatedAt = datetime();

// Underwriter skills
MERGE (bs_risk_assessment:Skill {name: 'risk-assessment'})
SET bs_risk_assessment.description = 'Comprehensive risk assessment using MCP tools: DTI calculation, LTV analysis, credit risk evaluation, income stability, asset sufficiency, and aggregated recommendation (Approve/Conditions/Suspend/Deny)',
    bs_risk_assessment.category = 'compliance',
    bs_risk_assessment.lifecycleState = 'published',
    bs_risk_assessment.complexity = 'advanced',
    bs_risk_assessment.provenanceSource = 'github:rrbanda/multi-agent-loan-origination',
    bs_risk_assessment.tags = ['risk', 'underwriting', 'mcp', 'compliance'],
    bs_risk_assessment.author = 'red-hat-ai-quickstart',
    bs_risk_assessment.updatedAt = datetime();

MERGE (bs_compliance_check:Skill {name: 'compliance-verification'})
SET bs_compliance_check.description = 'Run ECOA, ATR/QM, and TRID compliance checks against application data, generate compliance results with pass/fail/warning status',
    bs_compliance_check.category = 'compliance',
    bs_compliance_check.lifecycleState = 'published',
    bs_compliance_check.complexity = 'advanced',
    bs_compliance_check.provenanceSource = 'github:rrbanda/multi-agent-loan-origination',
    bs_compliance_check.tags = ['compliance', 'ecoa', 'trid', 'atr-qm', 'underwriting'],
    bs_compliance_check.author = 'red-hat-ai-quickstart',
    bs_compliance_check.updatedAt = datetime();

MERGE (bs_condition_mgmt:Skill {name: 'condition-management'})
SET bs_condition_mgmt.description = 'Issue, review, clear, waive, or return underwriting conditions with full lifecycle tracking and summary counts',
    bs_condition_mgmt.category = 'financial-services',
    bs_condition_mgmt.lifecycleState = 'published',
    bs_condition_mgmt.complexity = 'intermediate',
    bs_condition_mgmt.provenanceSource = 'github:rrbanda/multi-agent-loan-origination',
    bs_condition_mgmt.tags = ['conditions', 'underwriting', 'lifecycle'],
    bs_condition_mgmt.author = 'red-hat-ai-quickstart',
    bs_condition_mgmt.updatedAt = datetime();

MERGE (bs_decision:Skill {name: 'underwriting-decision'})
SET bs_decision.description = 'Two-phase decision rendering (propose then confirm), adverse action notice generation (ECOA/FCRA), Loan Estimate and Closing Disclosure document generation',
    bs_decision.category = 'compliance',
    bs_decision.lifecycleState = 'published',
    bs_decision.complexity = 'advanced',
    bs_decision.provenanceSource = 'github:rrbanda/multi-agent-loan-origination',
    bs_decision.tags = ['decision', 'underwriting', 'adverse-action', 'disclosure'],
    bs_decision.author = 'red-hat-ai-quickstart',
    bs_decision.updatedAt = datetime();

MERGE (bs_predictive:Skill {name: 'predictive-model-scoring'})
SET bs_predictive.description = 'External ML model prediction for loan approval likelihood via MCP tool, augmenting rule-based risk factors',
    bs_predictive.category = 'financial-services',
    bs_predictive.lifecycleState = 'published',
    bs_predictive.complexity = 'advanced',
    bs_predictive.provenanceSource = 'github:rrbanda/multi-agent-loan-origination',
    bs_predictive.tags = ['predictive', 'ml', 'mcp', 'underwriting'],
    bs_predictive.author = 'red-hat-ai-quickstart',
    bs_predictive.updatedAt = datetime();

// CEO skills
MERGE (bs_analytics:Skill {name: 'pipeline-analytics'})
SET bs_analytics.description = 'Executive pipeline summary: stage counts, pull-through rates, turn times, denial trends by reason/product, loan officer performance metrics',
    bs_analytics.category = 'financial-services',
    bs_analytics.lifecycleState = 'published',
    bs_analytics.complexity = 'intermediate',
    bs_analytics.provenanceSource = 'github:rrbanda/multi-agent-loan-origination',
    bs_analytics.tags = ['analytics', 'executive', 'pipeline'],
    bs_analytics.author = 'red-hat-ai-quickstart',
    bs_analytics.updatedAt = datetime();

MERGE (bs_audit_trail:Skill {name: 'audit-trail-query'})
SET bs_audit_trail.description = 'Query hash-chained audit events by application, search by date range and event type, trace decision lineage',
    bs_audit_trail.category = 'compliance',
    bs_audit_trail.lifecycleState = 'published',
    bs_audit_trail.complexity = 'intermediate',
    bs_audit_trail.provenanceSource = 'github:rrbanda/multi-agent-loan-origination',
    bs_audit_trail.tags = ['audit', 'compliance', 'traceability'],
    bs_audit_trail.author = 'red-hat-ai-quickstart',
    bs_audit_trail.updatedAt = datetime();

MERGE (bs_model_monitoring:Skill {name: 'model-performance-monitoring'})
SET bs_model_monitoring.description = 'Monitor LLM model latency (p50/p95/p99), token usage, error rates, and routing distribution via MLflow/LangFuse',
    bs_model_monitoring.category = 'observability',
    bs_model_monitoring.lifecycleState = 'published',
    bs_model_monitoring.complexity = 'intermediate',
    bs_model_monitoring.provenanceSource = 'github:rrbanda/multi-agent-loan-origination',
    bs_model_monitoring.tags = ['monitoring', 'mlflow', 'observability'],
    bs_model_monitoring.author = 'red-hat-ai-quickstart',
    bs_model_monitoring.updatedAt = datetime();

// ============================================================================
// BUNDLE B: Multi-Agent Engineering Patterns
// ============================================================================

MERGE (bundleB:SkillBundle {name: 'multi-agent-engineering-patterns'})
SET bundleB.id = randomUUID(),
    bundleB.description = 'Engineering skills for building multi-agent AI systems in regulated industries. Covers LangGraph orchestration, compliance RAG, safety shields, audit trails, and reusable code components.',
    bundleB.author = 'red-hat-ai-quickstart',
    bundleB.status = 'published',
    bundleB.source = 'github',
    bundleB.createdAt = datetime(),
    bundleB.updatedAt = datetime();

// --- Engineering Skills: Level 1 (Patterns) ---

MERGE (es_orchestration:Skill {name: 'langgraph-multi-agent-orchestration'})
SET es_orchestration.description = 'Architecture pattern for routing N persona agents via RBAC. LangGraph StateGraph with input_shield, agent, tool_auth, and output_shield nodes. Role-based tool filtering from YAML config.',
    es_orchestration.category = 'agent-engineering',
    es_orchestration.lifecycleState = 'published',
    es_orchestration.complexity = 'advanced',
    es_orchestration.provenanceSource = 'github:rrbanda/multi-agent-loan-origination',
    es_orchestration.tags = ['pattern', 'langgraph', 'multi-agent', 'rbac', 'orchestration'],
    es_orchestration.author = 'red-hat-ai-quickstart',
    es_orchestration.updatedAt = datetime();

MERGE (es_rag_tiered:Skill {name: 'compliance-rag-tiered-boosting'})
SET es_rag_tiered.description = 'RAG pattern with pgvector cosine similarity search and tiered source boosting: federal regulations (1.5x) > agency guidelines (1.2x) > internal policies (1.0x). Includes conflict detection between sources.',
    es_rag_tiered.category = 'agent-engineering',
    es_rag_tiered.lifecycleState = 'published',
    es_rag_tiered.complexity = 'advanced',
    es_rag_tiered.provenanceSource = 'github:rrbanda/multi-agent-loan-origination',
    es_rag_tiered.tags = ['pattern', 'rag', 'pgvector', 'compliance', 'boosting'],
    es_rag_tiered.author = 'red-hat-ai-quickstart',
    es_rag_tiered.updatedAt = datetime();

MERGE (es_fair_lending:Skill {name: 'fair-lending-data-isolation'})
SET es_fair_lending.description = 'Pattern for HMDA demographic data isolation in a separate database schema with access controls preventing agent access to protected characteristics during decisioning.',
    es_fair_lending.category = 'security',
    es_fair_lending.lifecycleState = 'published',
    es_fair_lending.complexity = 'advanced',
    es_fair_lending.provenanceSource = 'github:rrbanda/multi-agent-loan-origination',
    es_fair_lending.tags = ['pattern', 'fair-lending', 'hmda', 'data-isolation', 'compliance'],
    es_fair_lending.author = 'red-hat-ai-quickstart',
    es_fair_lending.updatedAt = datetime();

MERGE (es_audit_pattern:Skill {name: 'hash-chained-audit-trail'})
SET es_audit_pattern.description = 'Append-only audit event pattern with SHA-256 hash chaining and advisory locks for tamper-evident logging. Each event references the previous hash for integrity verification.',
    es_audit_pattern.category = 'security',
    es_audit_pattern.lifecycleState = 'published',
    es_audit_pattern.complexity = 'advanced',
    es_audit_pattern.provenanceSource = 'github:rrbanda/multi-agent-loan-origination',
    es_audit_pattern.tags = ['pattern', 'audit', 'hash-chain', 'tamper-evident', 'compliance'],
    es_audit_pattern.author = 'red-hat-ai-quickstart',
    es_audit_pattern.updatedAt = datetime();

MERGE (es_role_routing:Skill {name: 'role-scoped-agent-routing'})
SET es_role_routing.description = 'Pattern for RBAC-based agent selection: JWT role claim maps to agent config, per-tool allowed_roles enforcement, data scope narrowing per persona.',
    es_role_routing.category = 'agent-engineering',
    es_role_routing.lifecycleState = 'published',
    es_role_routing.complexity = 'intermediate',
    es_role_routing.provenanceSource = 'github:rrbanda/multi-agent-loan-origination',
    es_role_routing.tags = ['pattern', 'rbac', 'routing', 'keycloak', 'agent-selection'],
    es_role_routing.author = 'red-hat-ai-quickstart',
    es_role_routing.updatedAt = datetime();

MERGE (es_mcp_pattern:Skill {name: 'mcp-tool-server-pattern'})
SET es_mcp_pattern.description = 'Pattern for extracting domain logic into a standalone MCP server (FastMCP + Streamable HTTP). Enables reuse across agents and external ML model integration.',
    es_mcp_pattern.category = 'agent-engineering',
    es_mcp_pattern.lifecycleState = 'published',
    es_mcp_pattern.complexity = 'intermediate',
    es_mcp_pattern.provenanceSource = 'github:rrbanda/multi-agent-loan-origination',
    es_mcp_pattern.tags = ['pattern', 'mcp', 'tool-server', 'reuse'],
    es_mcp_pattern.author = 'red-hat-ai-quickstart',
    es_mcp_pattern.updatedAt = datetime();

// --- Engineering Skills: Level 2 (How-to) ---

MERGE (es_howto_langgraph:Skill {name: 'howto-build-langgraph-agent-with-rbac'})
SET es_howto_langgraph.description = 'Step-by-step guide to building a LangGraph agent with RBAC tool filtering: define StateGraph, add shield nodes, wire tool_auth to YAML-driven allowed_roles, handle tool errors gracefully.',
    es_howto_langgraph.category = 'agent-engineering',
    es_howto_langgraph.lifecycleState = 'published',
    es_howto_langgraph.complexity = 'intermediate',
    es_howto_langgraph.provenanceSource = 'github:rrbanda/multi-agent-loan-origination',
    es_howto_langgraph.tags = ['how-to', 'langgraph', 'rbac', 'agent'],
    es_howto_langgraph.author = 'red-hat-ai-quickstart',
    es_howto_langgraph.updatedAt = datetime();

MERGE (es_howto_rag:Skill {name: 'howto-implement-pgvector-rag'})
SET es_howto_rag.description = 'How to set up pgvector embeddings, ingest documents with tiered metadata, implement cosine similarity search with boost factors, and detect source conflicts.',
    es_howto_rag.category = 'agent-engineering',
    es_howto_rag.lifecycleState = 'published',
    es_howto_rag.complexity = 'intermediate',
    es_howto_rag.provenanceSource = 'github:rrbanda/multi-agent-loan-origination',
    es_howto_rag.tags = ['how-to', 'rag', 'pgvector', 'embeddings'],
    es_howto_rag.author = 'red-hat-ai-quickstart',
    es_howto_rag.updatedAt = datetime();

MERGE (es_howto_pii:Skill {name: 'howto-add-pii-masking-middleware'})
SET es_howto_pii.description = 'How to implement FastAPI middleware that recursively masks SSN, DOB, and account numbers in JSON responses based on user role data scope.',
    es_howto_pii.category = 'security',
    es_howto_pii.lifecycleState = 'published',
    es_howto_pii.complexity = 'basic',
    es_howto_pii.provenanceSource = 'github:rrbanda/multi-agent-loan-origination',
    es_howto_pii.tags = ['how-to', 'pii', 'masking', 'middleware', 'fastapi'],
    es_howto_pii.author = 'red-hat-ai-quickstart',
    es_howto_pii.updatedAt = datetime();

MERGE (es_howto_vision:Skill {name: 'howto-vision-document-extraction'})
SET es_howto_vision.description = 'How to integrate a vision model for extracting text and structured data from uploaded document images within an agent tool.',
    es_howto_vision.category = 'document-processing',
    es_howto_vision.lifecycleState = 'published',
    es_howto_vision.complexity = 'intermediate',
    es_howto_vision.provenanceSource = 'github:rrbanda/multi-agent-loan-origination',
    es_howto_vision.tags = ['how-to', 'vision', 'document-extraction', 'ocr'],
    es_howto_vision.author = 'red-hat-ai-quickstart',
    es_howto_vision.updatedAt = datetime();

MERGE (es_howto_mcp:Skill {name: 'howto-mcp-predictive-model'})
SET es_howto_mcp.description = 'How to connect an external predictive ML model as an MCP server tool, handle graceful degradation when unavailable, and integrate predictions into agent workflow.',
    es_howto_mcp.category = 'agent-engineering',
    es_howto_mcp.lifecycleState = 'published',
    es_howto_mcp.complexity = 'intermediate',
    es_howto_mcp.provenanceSource = 'github:rrbanda/multi-agent-loan-origination',
    es_howto_mcp.tags = ['how-to', 'mcp', 'predictive-model', 'ml'],
    es_howto_mcp.author = 'red-hat-ai-quickstart',
    es_howto_mcp.updatedAt = datetime();

MERGE (es_howto_safety:Skill {name: 'howto-safety-shields'})
SET es_howto_safety.description = 'How to implement input/output safety shields using NeMo Guardrails: LangGraph shield nodes, refusal detection, fail-closed error handling, escalation pattern detection.',
    es_howto_safety.category = 'security',
    es_howto_safety.lifecycleState = 'published',
    es_howto_safety.complexity = 'intermediate',
    es_howto_safety.provenanceSource = 'github:rrbanda/multi-agent-loan-origination',
    es_howto_safety.tags = ['how-to', 'safety-shields', 'nemo', 'guardrails'],
    es_howto_safety.author = 'red-hat-ai-quickstart',
    es_howto_safety.updatedAt = datetime();

MERGE (es_howto_mlflow:Skill {name: 'howto-mlflow-agent-observability'})
SET es_howto_mlflow.description = 'How to configure MLflow on OpenShift AI for agent tracing, token usage tracking, latency histograms, and model evaluation with RBAC ServiceAccount setup.',
    es_howto_mlflow.category = 'observability',
    es_howto_mlflow.lifecycleState = 'published',
    es_howto_mlflow.complexity = 'intermediate',
    es_howto_mlflow.provenanceSource = 'github:rrbanda/multi-agent-loan-origination',
    es_howto_mlflow.tags = ['how-to', 'mlflow', 'observability', 'openshift-ai'],
    es_howto_mlflow.author = 'red-hat-ai-quickstart',
    es_howto_mlflow.updatedAt = datetime();

// --- Engineering Skills: Level 3 (Reusable Code Components) ---

MERGE (es_comp_kb_ingest:Skill {name: 'component-compliance-kb-ingestion'})
SET es_comp_kb_ingest.description = 'Reusable script for ingesting YAML-frontmatter Markdown documents into pgvector with chunk splitting, embedding generation, and tier metadata tagging.',
    es_comp_kb_ingest.category = 'agent-engineering',
    es_comp_kb_ingest.lifecycleState = 'published',
    es_comp_kb_ingest.complexity = 'intermediate',
    es_comp_kb_ingest.provenanceSource = 'github:rrbanda/multi-agent-loan-origination',
    es_comp_kb_ingest.tags = ['reusable-code', 'ingestion', 'pgvector', 'knowledge-base'],
    es_comp_kb_ingest.author = 'red-hat-ai-quickstart',
    es_comp_kb_ingest.updatedAt = datetime();

MERGE (es_comp_audit:Skill {name: 'component-audit-event-model'})
SET es_comp_audit.description = 'SQLAlchemy model and service for append-only audit events with SHA-256 hash chaining, advisory locks, and typed event categories.',
    es_comp_audit.category = 'security',
    es_comp_audit.lifecycleState = 'published',
    es_comp_audit.complexity = 'intermediate',
    es_comp_audit.provenanceSource = 'github:rrbanda/multi-agent-loan-origination',
    es_comp_audit.tags = ['reusable-code', 'audit', 'sqlalchemy', 'hash-chain'],
    es_comp_audit.author = 'red-hat-ai-quickstart',
    es_comp_audit.updatedAt = datetime();

MERGE (es_comp_pii:Skill {name: 'component-pii-masking-filter'})
SET es_comp_pii.description = 'Extractable FastAPI middleware that recursively masks PII fields (SSN, DOB, account numbers) in JSON responses based on request-scoped flags.',
    es_comp_pii.category = 'security',
    es_comp_pii.lifecycleState = 'published',
    es_comp_pii.complexity = 'basic',
    es_comp_pii.provenanceSource = 'github:rrbanda/multi-agent-loan-origination',
    es_comp_pii.tags = ['reusable-code', 'pii', 'middleware', 'fastapi'],
    es_comp_pii.author = 'red-hat-ai-quickstart',
    es_comp_pii.updatedAt = datetime();

MERGE (es_comp_router:Skill {name: 'component-agent-router'})
SET es_comp_router.description = 'Role-based LangGraph agent router: loads YAML agent configs, resolves persona from JWT claims, builds per-role tool sets with allowed_roles filtering.',
    es_comp_router.category = 'agent-engineering',
    es_comp_router.lifecycleState = 'published',
    es_comp_router.complexity = 'intermediate',
    es_comp_router.provenanceSource = 'github:rrbanda/multi-agent-loan-origination',
    es_comp_router.tags = ['reusable-code', 'router', 'rbac', 'langgraph'],
    es_comp_router.author = 'red-hat-ai-quickstart',
    es_comp_router.updatedAt = datetime();

MERGE (es_comp_extractor:Skill {name: 'component-document-extractor'})
SET es_comp_extractor.description = 'Vision model tool function for document image extraction: accepts image bytes, calls vision LLM endpoint, returns structured text and metadata.',
    es_comp_extractor.category = 'document-processing',
    es_comp_extractor.lifecycleState = 'published',
    es_comp_extractor.complexity = 'intermediate',
    es_comp_extractor.provenanceSource = 'github:rrbanda/multi-agent-loan-origination',
    es_comp_extractor.tags = ['reusable-code', 'vision', 'extraction', 'document'],
    es_comp_extractor.author = 'red-hat-ai-quickstart',
    es_comp_extractor.updatedAt = datetime();

MERGE (es_comp_safety:Skill {name: 'component-safety-shield-chain'})
SET es_comp_safety.description = 'LangGraph pre/post processing nodes implementing NeMo Guardrails integration: input validation, output filtering, escalation detection, fail-closed semantics.',
    es_comp_safety.category = 'security',
    es_comp_safety.lifecycleState = 'published',
    es_comp_safety.complexity = 'intermediate',
    es_comp_safety.provenanceSource = 'github:rrbanda/multi-agent-loan-origination',
    es_comp_safety.tags = ['reusable-code', 'safety', 'guardrails', 'langgraph'],
    es_comp_safety.author = 'red-hat-ai-quickstart',
    es_comp_safety.updatedAt = datetime();
