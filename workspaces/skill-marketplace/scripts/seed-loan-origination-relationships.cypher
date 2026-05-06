// ============================================================================
// Relationships that reference nodes by property (not variable scope)
// Run AFTER the node-creation seed script
// ============================================================================

// --- Domain hierarchy ---
MATCH (d1:Domain {name: 'financial-services'}), (d2:Domain {name: 'compliance'})
MERGE (d1)-[:PARENT_OF]->(d2);

// ============================================================================
// BUNDLE A INCLUDES (business skills)
// ============================================================================
MATCH (b:SkillBundle {name: 'mortgage-ai-business-skills'}), (s:Skill {name: 'product-info-lookup'})
MERGE (b)-[:INCLUDES {addedBy: 'seed', addedAt: datetime()}]->(s);

MATCH (b:SkillBundle {name: 'mortgage-ai-business-skills'}), (s:Skill {name: 'affordability-estimate'})
MERGE (b)-[:INCLUDES {addedBy: 'seed', addedAt: datetime()}]->(s);

MATCH (b:SkillBundle {name: 'mortgage-ai-business-skills'}), (s:Skill {name: 'application-intake'})
MERGE (b)-[:INCLUDES {addedBy: 'seed', addedAt: datetime()}]->(s);

MATCH (b:SkillBundle {name: 'mortgage-ai-business-skills'}), (s:Skill {name: 'document-management'})
MERGE (b)-[:INCLUDES {addedBy: 'seed', addedAt: datetime()}]->(s);

MATCH (b:SkillBundle {name: 'mortgage-ai-business-skills'}), (s:Skill {name: 'application-status-tracking'})
MERGE (b)-[:INCLUDES {addedBy: 'seed', addedAt: datetime()}]->(s);

MATCH (b:SkillBundle {name: 'mortgage-ai-business-skills'}), (s:Skill {name: 'condition-response'})
MERGE (b)-[:INCLUDES {addedBy: 'seed', addedAt: datetime()}]->(s);

MATCH (b:SkillBundle {name: 'mortgage-ai-business-skills'}), (s:Skill {name: 'prequalification-estimate'})
MERGE (b)-[:INCLUDES {addedBy: 'seed', addedAt: datetime()}]->(s);

MATCH (b:SkillBundle {name: 'mortgage-ai-business-skills'}), (s:Skill {name: 'pipeline-management'})
MERGE (b)-[:INCLUDES {addedBy: 'seed', addedAt: datetime()}]->(s);

MATCH (b:SkillBundle {name: 'mortgage-ai-business-skills'}), (s:Skill {name: 'credit-bureau-pull'})
MERGE (b)-[:INCLUDES {addedBy: 'seed', addedAt: datetime()}]->(s);

MATCH (b:SkillBundle {name: 'mortgage-ai-business-skills'}), (s:Skill {name: 'compliance-kb-search'})
MERGE (b)-[:INCLUDES {addedBy: 'seed', addedAt: datetime()}]->(s);

MATCH (b:SkillBundle {name: 'mortgage-ai-business-skills'}), (s:Skill {name: 'communication-drafting'})
MERGE (b)-[:INCLUDES {addedBy: 'seed', addedAt: datetime()}]->(s);

MATCH (b:SkillBundle {name: 'mortgage-ai-business-skills'}), (s:Skill {name: 'risk-assessment'})
MERGE (b)-[:INCLUDES {addedBy: 'seed', addedAt: datetime()}]->(s);

MATCH (b:SkillBundle {name: 'mortgage-ai-business-skills'}), (s:Skill {name: 'compliance-verification'})
MERGE (b)-[:INCLUDES {addedBy: 'seed', addedAt: datetime()}]->(s);

MATCH (b:SkillBundle {name: 'mortgage-ai-business-skills'}), (s:Skill {name: 'condition-management'})
MERGE (b)-[:INCLUDES {addedBy: 'seed', addedAt: datetime()}]->(s);

MATCH (b:SkillBundle {name: 'mortgage-ai-business-skills'}), (s:Skill {name: 'underwriting-decision'})
MERGE (b)-[:INCLUDES {addedBy: 'seed', addedAt: datetime()}]->(s);

MATCH (b:SkillBundle {name: 'mortgage-ai-business-skills'}), (s:Skill {name: 'predictive-model-scoring'})
MERGE (b)-[:INCLUDES {addedBy: 'seed', addedAt: datetime()}]->(s);

MATCH (b:SkillBundle {name: 'mortgage-ai-business-skills'}), (s:Skill {name: 'pipeline-analytics'})
MERGE (b)-[:INCLUDES {addedBy: 'seed', addedAt: datetime()}]->(s);

MATCH (b:SkillBundle {name: 'mortgage-ai-business-skills'}), (s:Skill {name: 'audit-trail-query'})
MERGE (b)-[:INCLUDES {addedBy: 'seed', addedAt: datetime()}]->(s);

MATCH (b:SkillBundle {name: 'mortgage-ai-business-skills'}), (s:Skill {name: 'model-performance-monitoring'})
MERGE (b)-[:INCLUDES {addedBy: 'seed', addedAt: datetime()}]->(s);

// ============================================================================
// BUNDLE B INCLUDES (engineering skills)
// ============================================================================
MATCH (b:SkillBundle {name: 'multi-agent-engineering-patterns'}), (s:Skill {name: 'langgraph-multi-agent-orchestration'})
MERGE (b)-[:INCLUDES {addedBy: 'seed', addedAt: datetime()}]->(s);

MATCH (b:SkillBundle {name: 'multi-agent-engineering-patterns'}), (s:Skill {name: 'compliance-rag-tiered-boosting'})
MERGE (b)-[:INCLUDES {addedBy: 'seed', addedAt: datetime()}]->(s);

MATCH (b:SkillBundle {name: 'multi-agent-engineering-patterns'}), (s:Skill {name: 'fair-lending-data-isolation'})
MERGE (b)-[:INCLUDES {addedBy: 'seed', addedAt: datetime()}]->(s);

MATCH (b:SkillBundle {name: 'multi-agent-engineering-patterns'}), (s:Skill {name: 'hash-chained-audit-trail'})
MERGE (b)-[:INCLUDES {addedBy: 'seed', addedAt: datetime()}]->(s);

MATCH (b:SkillBundle {name: 'multi-agent-engineering-patterns'}), (s:Skill {name: 'role-scoped-agent-routing'})
MERGE (b)-[:INCLUDES {addedBy: 'seed', addedAt: datetime()}]->(s);

MATCH (b:SkillBundle {name: 'multi-agent-engineering-patterns'}), (s:Skill {name: 'mcp-tool-server-pattern'})
MERGE (b)-[:INCLUDES {addedBy: 'seed', addedAt: datetime()}]->(s);

MATCH (b:SkillBundle {name: 'multi-agent-engineering-patterns'}), (s:Skill {name: 'howto-build-langgraph-agent-with-rbac'})
MERGE (b)-[:INCLUDES {addedBy: 'seed', addedAt: datetime()}]->(s);

MATCH (b:SkillBundle {name: 'multi-agent-engineering-patterns'}), (s:Skill {name: 'howto-implement-pgvector-rag'})
MERGE (b)-[:INCLUDES {addedBy: 'seed', addedAt: datetime()}]->(s);

MATCH (b:SkillBundle {name: 'multi-agent-engineering-patterns'}), (s:Skill {name: 'howto-add-pii-masking-middleware'})
MERGE (b)-[:INCLUDES {addedBy: 'seed', addedAt: datetime()}]->(s);

MATCH (b:SkillBundle {name: 'multi-agent-engineering-patterns'}), (s:Skill {name: 'howto-vision-document-extraction'})
MERGE (b)-[:INCLUDES {addedBy: 'seed', addedAt: datetime()}]->(s);

MATCH (b:SkillBundle {name: 'multi-agent-engineering-patterns'}), (s:Skill {name: 'howto-mcp-predictive-model'})
MERGE (b)-[:INCLUDES {addedBy: 'seed', addedAt: datetime()}]->(s);

MATCH (b:SkillBundle {name: 'multi-agent-engineering-patterns'}), (s:Skill {name: 'howto-safety-shields'})
MERGE (b)-[:INCLUDES {addedBy: 'seed', addedAt: datetime()}]->(s);

MATCH (b:SkillBundle {name: 'multi-agent-engineering-patterns'}), (s:Skill {name: 'howto-mlflow-agent-observability'})
MERGE (b)-[:INCLUDES {addedBy: 'seed', addedAt: datetime()}]->(s);

MATCH (b:SkillBundle {name: 'multi-agent-engineering-patterns'}), (s:Skill {name: 'component-compliance-kb-ingestion'})
MERGE (b)-[:INCLUDES {addedBy: 'seed', addedAt: datetime()}]->(s);

MATCH (b:SkillBundle {name: 'multi-agent-engineering-patterns'}), (s:Skill {name: 'component-audit-event-model'})
MERGE (b)-[:INCLUDES {addedBy: 'seed', addedAt: datetime()}]->(s);

MATCH (b:SkillBundle {name: 'multi-agent-engineering-patterns'}), (s:Skill {name: 'component-pii-masking-filter'})
MERGE (b)-[:INCLUDES {addedBy: 'seed', addedAt: datetime()}]->(s);

MATCH (b:SkillBundle {name: 'multi-agent-engineering-patterns'}), (s:Skill {name: 'component-agent-router'})
MERGE (b)-[:INCLUDES {addedBy: 'seed', addedAt: datetime()}]->(s);

MATCH (b:SkillBundle {name: 'multi-agent-engineering-patterns'}), (s:Skill {name: 'component-document-extractor'})
MERGE (b)-[:INCLUDES {addedBy: 'seed', addedAt: datetime()}]->(s);

MATCH (b:SkillBundle {name: 'multi-agent-engineering-patterns'}), (s:Skill {name: 'component-safety-shield-chain'})
MERGE (b)-[:INCLUDES {addedBy: 'seed', addedAt: datetime()}]->(s);

// ============================================================================
// AGENT CAPABILITIES + EXPOSES + IMPLEMENTED_BY
// ============================================================================

// Public Assistant
MATCH (a:Agent {name: 'public-assistant', namespace: 'mortgage-ai'})
MERGE (ac:AgentCapability {skillId: 'product-info-lookup', agentName: 'public-assistant', agentNamespace: 'mortgage-ai'})
SET ac.name = 'Product Info', ac.description = 'Retrieve mortgage product information', ac.updatedAt = datetime()
WITH a, ac
MERGE (a)-[:EXPOSES]->(ac)
WITH ac
MATCH (s:Skill {name: 'product-info-lookup'})
MERGE (ac)-[:IMPLEMENTED_BY {confidence: 1.0, matchType: 'name', matchedAt: datetime()}]->(s);

MATCH (a:Agent {name: 'public-assistant', namespace: 'mortgage-ai'})
MERGE (ac:AgentCapability {skillId: 'affordability-estimate', agentName: 'public-assistant', agentNamespace: 'mortgage-ai'})
SET ac.name = 'Affordability', ac.description = 'Calculate mortgage affordability', ac.updatedAt = datetime()
WITH a, ac
MERGE (a)-[:EXPOSES]->(ac)
WITH ac
MATCH (s:Skill {name: 'affordability-estimate'})
MERGE (ac)-[:IMPLEMENTED_BY {confidence: 1.0, matchType: 'name', matchedAt: datetime()}]->(s);

// Borrower Assistant
MATCH (a:Agent {name: 'borrower-assistant', namespace: 'mortgage-ai'})
MERGE (ac:AgentCapability {skillId: 'application-intake', agentName: 'borrower-assistant', agentNamespace: 'mortgage-ai'})
SET ac.name = 'Application Intake', ac.description = 'Start or continue mortgage application', ac.updatedAt = datetime()
WITH a, ac
MERGE (a)-[:EXPOSES]->(ac)
WITH ac
MATCH (s:Skill {name: 'application-intake'})
MERGE (ac)-[:IMPLEMENTED_BY {confidence: 1.0, matchType: 'name', matchedAt: datetime()}]->(s);

MATCH (a:Agent {name: 'borrower-assistant', namespace: 'mortgage-ai'})
MERGE (ac:AgentCapability {skillId: 'document-management', agentName: 'borrower-assistant', agentNamespace: 'mortgage-ai'})
SET ac.name = 'Document Management', ac.description = 'Upload and track documents', ac.updatedAt = datetime()
WITH a, ac
MERGE (a)-[:EXPOSES]->(ac)
WITH ac
MATCH (s:Skill {name: 'document-management'})
MERGE (ac)-[:IMPLEMENTED_BY {confidence: 1.0, matchType: 'name', matchedAt: datetime()}]->(s);

MATCH (a:Agent {name: 'borrower-assistant', namespace: 'mortgage-ai'})
MERGE (ac:AgentCapability {skillId: 'application-status-tracking', agentName: 'borrower-assistant', agentNamespace: 'mortgage-ai'})
SET ac.name = 'Status Tracking', ac.description = 'Track application progress', ac.updatedAt = datetime()
WITH a, ac
MERGE (a)-[:EXPOSES]->(ac)
WITH ac
MATCH (s:Skill {name: 'application-status-tracking'})
MERGE (ac)-[:IMPLEMENTED_BY {confidence: 1.0, matchType: 'name', matchedAt: datetime()}]->(s);

MATCH (a:Agent {name: 'borrower-assistant', namespace: 'mortgage-ai'})
MERGE (ac:AgentCapability {skillId: 'condition-response', agentName: 'borrower-assistant', agentNamespace: 'mortgage-ai'})
SET ac.name = 'Condition Response', ac.description = 'Respond to underwriting conditions', ac.updatedAt = datetime()
WITH a, ac
MERGE (a)-[:EXPOSES]->(ac)
WITH ac
MATCH (s:Skill {name: 'condition-response'})
MERGE (ac)-[:IMPLEMENTED_BY {confidence: 1.0, matchType: 'name', matchedAt: datetime()}]->(s);

// Loan Officer
MATCH (a:Agent {name: 'loan-officer-assistant', namespace: 'mortgage-ai'})
MERGE (ac:AgentCapability {skillId: 'pipeline-management', agentName: 'loan-officer-assistant', agentNamespace: 'mortgage-ai'})
SET ac.name = 'Pipeline Management', ac.description = 'Manage loan pipeline and submissions', ac.updatedAt = datetime()
WITH a, ac
MERGE (a)-[:EXPOSES]->(ac)
WITH ac
MATCH (s:Skill {name: 'pipeline-management'})
MERGE (ac)-[:IMPLEMENTED_BY {confidence: 1.0, matchType: 'name', matchedAt: datetime()}]->(s);

MATCH (a:Agent {name: 'loan-officer-assistant', namespace: 'mortgage-ai'})
MERGE (ac:AgentCapability {skillId: 'credit-bureau-pull', agentName: 'loan-officer-assistant', agentNamespace: 'mortgage-ai'})
SET ac.name = 'Credit Pull', ac.description = 'Pull credit reports', ac.updatedAt = datetime()
WITH a, ac
MERGE (a)-[:EXPOSES]->(ac)
WITH ac
MATCH (s:Skill {name: 'credit-bureau-pull'})
MERGE (ac)-[:IMPLEMENTED_BY {confidence: 1.0, matchType: 'name', matchedAt: datetime()}]->(s);

MATCH (a:Agent {name: 'loan-officer-assistant', namespace: 'mortgage-ai'})
MERGE (ac:AgentCapability {skillId: 'compliance-kb-search', agentName: 'loan-officer-assistant', agentNamespace: 'mortgage-ai'})
SET ac.name = 'KB Search', ac.description = 'Search compliance knowledge base', ac.updatedAt = datetime()
WITH a, ac
MERGE (a)-[:EXPOSES]->(ac)
WITH ac
MATCH (s:Skill {name: 'compliance-kb-search'})
MERGE (ac)-[:IMPLEMENTED_BY {confidence: 1.0, matchType: 'name', matchedAt: datetime()}]->(s);

// Underwriter
MATCH (a:Agent {name: 'underwriter-assistant', namespace: 'mortgage-ai'})
MERGE (ac:AgentCapability {skillId: 'risk-assessment', agentName: 'underwriter-assistant', agentNamespace: 'mortgage-ai'})
SET ac.name = 'Risk Assessment', ac.description = 'Comprehensive risk assessment via MCP tools', ac.updatedAt = datetime()
WITH a, ac
MERGE (a)-[:EXPOSES]->(ac)
WITH ac
MATCH (s:Skill {name: 'risk-assessment'})
MERGE (ac)-[:IMPLEMENTED_BY {confidence: 1.0, matchType: 'name', matchedAt: datetime()}]->(s);

MATCH (a:Agent {name: 'underwriter-assistant', namespace: 'mortgage-ai'})
MERGE (ac:AgentCapability {skillId: 'compliance-verification', agentName: 'underwriter-assistant', agentNamespace: 'mortgage-ai'})
SET ac.name = 'Compliance Verification', ac.description = 'ECOA/ATR-QM/TRID compliance checks', ac.updatedAt = datetime()
WITH a, ac
MERGE (a)-[:EXPOSES]->(ac)
WITH ac
MATCH (s:Skill {name: 'compliance-verification'})
MERGE (ac)-[:IMPLEMENTED_BY {confidence: 1.0, matchType: 'name', matchedAt: datetime()}]->(s);

MATCH (a:Agent {name: 'underwriter-assistant', namespace: 'mortgage-ai'})
MERGE (ac:AgentCapability {skillId: 'condition-management', agentName: 'underwriter-assistant', agentNamespace: 'mortgage-ai'})
SET ac.name = 'Condition Management', ac.description = 'Issue and manage underwriting conditions', ac.updatedAt = datetime()
WITH a, ac
MERGE (a)-[:EXPOSES]->(ac)
WITH ac
MATCH (s:Skill {name: 'condition-management'})
MERGE (ac)-[:IMPLEMENTED_BY {confidence: 1.0, matchType: 'name', matchedAt: datetime()}]->(s);

MATCH (a:Agent {name: 'underwriter-assistant', namespace: 'mortgage-ai'})
MERGE (ac:AgentCapability {skillId: 'underwriting-decision', agentName: 'underwriter-assistant', agentNamespace: 'mortgage-ai'})
SET ac.name = 'Underwriting Decision', ac.description = 'Render decisions and generate disclosures', ac.updatedAt = datetime()
WITH a, ac
MERGE (a)-[:EXPOSES]->(ac)
WITH ac
MATCH (s:Skill {name: 'underwriting-decision'})
MERGE (ac)-[:IMPLEMENTED_BY {confidence: 1.0, matchType: 'name', matchedAt: datetime()}]->(s);

// CEO
MATCH (a:Agent {name: 'ceo-assistant', namespace: 'mortgage-ai'})
MERGE (ac:AgentCapability {skillId: 'pipeline-analytics', agentName: 'ceo-assistant', agentNamespace: 'mortgage-ai'})
SET ac.name = 'Pipeline Analytics', ac.description = 'Executive pipeline and performance metrics', ac.updatedAt = datetime()
WITH a, ac
MERGE (a)-[:EXPOSES]->(ac)
WITH ac
MATCH (s:Skill {name: 'pipeline-analytics'})
MERGE (ac)-[:IMPLEMENTED_BY {confidence: 1.0, matchType: 'name', matchedAt: datetime()}]->(s);

MATCH (a:Agent {name: 'ceo-assistant', namespace: 'mortgage-ai'})
MERGE (ac:AgentCapability {skillId: 'audit-trail-query', agentName: 'ceo-assistant', agentNamespace: 'mortgage-ai'})
SET ac.name = 'Audit Trail', ac.description = 'Query audit events and decision traces', ac.updatedAt = datetime()
WITH a, ac
MERGE (a)-[:EXPOSES]->(ac)
WITH ac
MATCH (s:Skill {name: 'audit-trail-query'})
MERGE (ac)-[:IMPLEMENTED_BY {confidence: 1.0, matchType: 'name', matchedAt: datetime()}]->(s);

MATCH (a:Agent {name: 'ceo-assistant', namespace: 'mortgage-ai'})
MERGE (ac:AgentCapability {skillId: 'model-performance-monitoring', agentName: 'ceo-assistant', agentNamespace: 'mortgage-ai'})
SET ac.name = 'Model Monitoring', ac.description = 'Monitor LLM performance metrics', ac.updatedAt = datetime()
WITH a, ac
MERGE (a)-[:EXPOSES]->(ac)
WITH ac
MATCH (s:Skill {name: 'model-performance-monitoring'})
MERGE (ac)-[:IMPLEMENTED_BY {confidence: 1.0, matchType: 'name', matchedAt: datetime()}]->(s);

// ============================================================================
// USES_TOOL relationships
// ============================================================================

MATCH (s:Skill {name: 'compliance-kb-search'}), (t:Tool {name: 'pgvector-rag'})
MERGE (s)-[:USES_TOOL]->(t);

MATCH (s:Skill {name: 'risk-assessment'}), (t:Tool {name: 'mcp-risk-assessment'})
MERGE (s)-[:USES_TOOL]->(t);

MATCH (s:Skill {name: 'predictive-model-scoring'}), (t:Tool {name: 'mcp-predictive-model'})
MERGE (s)-[:USES_TOOL]->(t);

MATCH (s:Skill {name: 'document-management'}), (t:Tool {name: 'minio-s3'})
MERGE (s)-[:USES_TOOL]->(t);

MATCH (s:Skill {name: 'model-performance-monitoring'}), (t:Tool {name: 'mlflow'})
MERGE (s)-[:USES_TOOL]->(t);

MATCH (s:Skill {name: 'langgraph-multi-agent-orchestration'}), (t:Tool {name: 'langgraph'})
MERGE (s)-[:USES_TOOL]->(t);

MATCH (s:Skill {name: 'compliance-rag-tiered-boosting'}), (t:Tool {name: 'pgvector-rag'})
MERGE (s)-[:USES_TOOL]->(t);

MATCH (s:Skill {name: 'role-scoped-agent-routing'}), (t:Tool {name: 'keycloak'})
MERGE (s)-[:USES_TOOL]->(t);

MATCH (s:Skill {name: 'mcp-tool-server-pattern'}), (t:Tool {name: 'mcp-risk-assessment'})
MERGE (s)-[:USES_TOOL]->(t);

MATCH (s:Skill {name: 'howto-build-langgraph-agent-with-rbac'}), (t:Tool {name: 'langgraph'})
MERGE (s)-[:USES_TOOL]->(t);

MATCH (s:Skill {name: 'howto-implement-pgvector-rag'}), (t:Tool {name: 'pgvector-rag'})
MERGE (s)-[:USES_TOOL]->(t);

MATCH (s:Skill {name: 'howto-add-pii-masking-middleware'}), (t:Tool {name: 'fastapi'})
MERGE (s)-[:USES_TOOL]->(t);

MATCH (s:Skill {name: 'howto-safety-shields'}), (t:Tool {name: 'nemo-guardrails'})
MERGE (s)-[:USES_TOOL]->(t);

MATCH (s:Skill {name: 'howto-mlflow-agent-observability'}), (t:Tool {name: 'mlflow'})
MERGE (s)-[:USES_TOOL]->(t);

MATCH (s:Skill {name: 'component-compliance-kb-ingestion'}), (t:Tool {name: 'pgvector-rag'})
MERGE (s)-[:USES_TOOL]->(t);

MATCH (s:Skill {name: 'component-audit-event-model'}), (t:Tool {name: 'sqlalchemy'})
MERGE (s)-[:USES_TOOL]->(t);

MATCH (s:Skill {name: 'component-pii-masking-filter'}), (t:Tool {name: 'fastapi'})
MERGE (s)-[:USES_TOOL]->(t);

MATCH (s:Skill {name: 'component-agent-router'}), (t:Tool {name: 'langgraph'})
MERGE (s)-[:USES_TOOL]->(t);

MATCH (s:Skill {name: 'component-safety-shield-chain'}), (t:Tool {name: 'nemo-guardrails'})
MERGE (s)-[:USES_TOOL]->(t);

MATCH (s:Skill {name: 'component-safety-shield-chain'}), (t:Tool {name: 'langgraph'})
MERGE (s)-[:USES_TOOL]->(t);

// ============================================================================
// BELONGS_TO domain relationships
// ============================================================================

MATCH (s:Skill {name: 'product-info-lookup'}), (d:Domain {name: 'financial-services'})
MERGE (s)-[:BELONGS_TO {primary: true}]->(d);

MATCH (s:Skill {name: 'affordability-estimate'}), (d:Domain {name: 'financial-services'})
MERGE (s)-[:BELONGS_TO {primary: true}]->(d);

MATCH (s:Skill {name: 'application-intake'}), (d:Domain {name: 'financial-services'})
MERGE (s)-[:BELONGS_TO {primary: true}]->(d);

MATCH (s:Skill {name: 'document-management'}), (d:Domain {name: 'document-processing'})
MERGE (s)-[:BELONGS_TO {primary: true}]->(d);

MATCH (s:Skill {name: 'application-status-tracking'}), (d:Domain {name: 'financial-services'})
MERGE (s)-[:BELONGS_TO {primary: true}]->(d);

MATCH (s:Skill {name: 'condition-response'}), (d:Domain {name: 'financial-services'})
MERGE (s)-[:BELONGS_TO {primary: true}]->(d);

MATCH (s:Skill {name: 'prequalification-estimate'}), (d:Domain {name: 'financial-services'})
MERGE (s)-[:BELONGS_TO {primary: true}]->(d);

MATCH (s:Skill {name: 'pipeline-management'}), (d:Domain {name: 'financial-services'})
MERGE (s)-[:BELONGS_TO {primary: true}]->(d);

MATCH (s:Skill {name: 'credit-bureau-pull'}), (d:Domain {name: 'financial-services'})
MERGE (s)-[:BELONGS_TO {primary: true}]->(d);

MATCH (s:Skill {name: 'compliance-kb-search'}), (d:Domain {name: 'compliance'})
MERGE (s)-[:BELONGS_TO {primary: true}]->(d);

MATCH (s:Skill {name: 'communication-drafting'}), (d:Domain {name: 'financial-services'})
MERGE (s)-[:BELONGS_TO {primary: true}]->(d);

MATCH (s:Skill {name: 'risk-assessment'}), (d:Domain {name: 'compliance'})
MERGE (s)-[:BELONGS_TO {primary: true}]->(d);

MATCH (s:Skill {name: 'compliance-verification'}), (d:Domain {name: 'compliance'})
MERGE (s)-[:BELONGS_TO {primary: true}]->(d);

MATCH (s:Skill {name: 'condition-management'}), (d:Domain {name: 'financial-services'})
MERGE (s)-[:BELONGS_TO {primary: true}]->(d);

MATCH (s:Skill {name: 'underwriting-decision'}), (d:Domain {name: 'compliance'})
MERGE (s)-[:BELONGS_TO {primary: true}]->(d);

MATCH (s:Skill {name: 'predictive-model-scoring'}), (d:Domain {name: 'financial-services'})
MERGE (s)-[:BELONGS_TO {primary: true}]->(d);

MATCH (s:Skill {name: 'pipeline-analytics'}), (d:Domain {name: 'financial-services'})
MERGE (s)-[:BELONGS_TO {primary: true}]->(d);

MATCH (s:Skill {name: 'audit-trail-query'}), (d:Domain {name: 'compliance'})
MERGE (s)-[:BELONGS_TO {primary: true}]->(d);

MATCH (s:Skill {name: 'model-performance-monitoring'}), (d:Domain {name: 'observability'})
MERGE (s)-[:BELONGS_TO {primary: true}]->(d);

MATCH (s:Skill {name: 'langgraph-multi-agent-orchestration'}), (d:Domain {name: 'agent-engineering'})
MERGE (s)-[:BELONGS_TO {primary: true}]->(d);

MATCH (s:Skill {name: 'compliance-rag-tiered-boosting'}), (d:Domain {name: 'agent-engineering'})
MERGE (s)-[:BELONGS_TO {primary: true}]->(d);

MATCH (s:Skill {name: 'fair-lending-data-isolation'}), (d:Domain {name: 'security'})
MERGE (s)-[:BELONGS_TO {primary: true}]->(d);

MATCH (s:Skill {name: 'hash-chained-audit-trail'}), (d:Domain {name: 'security'})
MERGE (s)-[:BELONGS_TO {primary: true}]->(d);

MATCH (s:Skill {name: 'role-scoped-agent-routing'}), (d:Domain {name: 'agent-engineering'})
MERGE (s)-[:BELONGS_TO {primary: true}]->(d);

MATCH (s:Skill {name: 'mcp-tool-server-pattern'}), (d:Domain {name: 'agent-engineering'})
MERGE (s)-[:BELONGS_TO {primary: true}]->(d);

MATCH (s:Skill {name: 'howto-build-langgraph-agent-with-rbac'}), (d:Domain {name: 'agent-engineering'})
MERGE (s)-[:BELONGS_TO {primary: true}]->(d);

MATCH (s:Skill {name: 'howto-implement-pgvector-rag'}), (d:Domain {name: 'agent-engineering'})
MERGE (s)-[:BELONGS_TO {primary: true}]->(d);

MATCH (s:Skill {name: 'howto-add-pii-masking-middleware'}), (d:Domain {name: 'security'})
MERGE (s)-[:BELONGS_TO {primary: true}]->(d);

MATCH (s:Skill {name: 'howto-vision-document-extraction'}), (d:Domain {name: 'document-processing'})
MERGE (s)-[:BELONGS_TO {primary: true}]->(d);

MATCH (s:Skill {name: 'howto-mcp-predictive-model'}), (d:Domain {name: 'agent-engineering'})
MERGE (s)-[:BELONGS_TO {primary: true}]->(d);

MATCH (s:Skill {name: 'howto-safety-shields'}), (d:Domain {name: 'security'})
MERGE (s)-[:BELONGS_TO {primary: true}]->(d);

MATCH (s:Skill {name: 'howto-mlflow-agent-observability'}), (d:Domain {name: 'observability'})
MERGE (s)-[:BELONGS_TO {primary: true}]->(d);

MATCH (s:Skill {name: 'component-compliance-kb-ingestion'}), (d:Domain {name: 'agent-engineering'})
MERGE (s)-[:BELONGS_TO {primary: true}]->(d);

MATCH (s:Skill {name: 'component-audit-event-model'}), (d:Domain {name: 'security'})
MERGE (s)-[:BELONGS_TO {primary: true}]->(d);

MATCH (s:Skill {name: 'component-pii-masking-filter'}), (d:Domain {name: 'security'})
MERGE (s)-[:BELONGS_TO {primary: true}]->(d);

MATCH (s:Skill {name: 'component-agent-router'}), (d:Domain {name: 'agent-engineering'})
MERGE (s)-[:BELONGS_TO {primary: true}]->(d);

MATCH (s:Skill {name: 'component-document-extractor'}), (d:Domain {name: 'document-processing'})
MERGE (s)-[:BELONGS_TO {primary: true}]->(d);

MATCH (s:Skill {name: 'component-safety-shield-chain'}), (d:Domain {name: 'security'})
MERGE (s)-[:BELONGS_TO {primary: true}]->(d);

// ============================================================================
// TAGGED_WITH relationships
// ============================================================================

MATCH (s:Skill {name: 'risk-assessment'}), (t:Tag {name: 'risk-assessment'})
MERGE (s)-[:TAGGED_WITH]->(t);
MATCH (s:Skill {name: 'risk-assessment'}), (t:Tag {name: 'mcp'})
MERGE (s)-[:TAGGED_WITH]->(t);
MATCH (s:Skill {name: 'risk-assessment'}), (t:Tag {name: 'compliance'})
MERGE (s)-[:TAGGED_WITH]->(t);

MATCH (s:Skill {name: 'compliance-verification'}), (t:Tag {name: 'compliance'})
MERGE (s)-[:TAGGED_WITH]->(t);
MATCH (s:Skill {name: 'compliance-verification'}), (t:Tag {name: 'regulated-industry'})
MERGE (s)-[:TAGGED_WITH]->(t);

MATCH (s:Skill {name: 'compliance-kb-search'}), (t:Tag {name: 'rag'})
MERGE (s)-[:TAGGED_WITH]->(t);
MATCH (s:Skill {name: 'compliance-kb-search'}), (t:Tag {name: 'compliance'})
MERGE (s)-[:TAGGED_WITH]->(t);
MATCH (s:Skill {name: 'compliance-kb-search'}), (t:Tag {name: 'pgvector'})
MERGE (s)-[:TAGGED_WITH]->(t);

MATCH (s:Skill {name: 'audit-trail-query'}), (t:Tag {name: 'audit'})
MERGE (s)-[:TAGGED_WITH]->(t);
MATCH (s:Skill {name: 'predictive-model-scoring'}), (t:Tag {name: 'mcp'})
MERGE (s)-[:TAGGED_WITH]->(t);
MATCH (s:Skill {name: 'model-performance-monitoring'}), (t:Tag {name: 'analytics'})
MERGE (s)-[:TAGGED_WITH]->(t);
MATCH (s:Skill {name: 'document-management'}), (t:Tag {name: 'vision'})
MERGE (s)-[:TAGGED_WITH]->(t);

MATCH (s:Skill {name: 'langgraph-multi-agent-orchestration'}), (t:Tag {name: 'langgraph'})
MERGE (s)-[:TAGGED_WITH]->(t);
MATCH (s:Skill {name: 'langgraph-multi-agent-orchestration'}), (t:Tag {name: 'multi-agent'})
MERGE (s)-[:TAGGED_WITH]->(t);
MATCH (s:Skill {name: 'langgraph-multi-agent-orchestration'}), (t:Tag {name: 'pattern'})
MERGE (s)-[:TAGGED_WITH]->(t);

MATCH (s:Skill {name: 'compliance-rag-tiered-boosting'}), (t:Tag {name: 'rag'})
MERGE (s)-[:TAGGED_WITH]->(t);
MATCH (s:Skill {name: 'compliance-rag-tiered-boosting'}), (t:Tag {name: 'pgvector'})
MERGE (s)-[:TAGGED_WITH]->(t);
MATCH (s:Skill {name: 'compliance-rag-tiered-boosting'}), (t:Tag {name: 'pattern'})
MERGE (s)-[:TAGGED_WITH]->(t);

MATCH (s:Skill {name: 'fair-lending-data-isolation'}), (t:Tag {name: 'fair-lending'})
MERGE (s)-[:TAGGED_WITH]->(t);
MATCH (s:Skill {name: 'fair-lending-data-isolation'}), (t:Tag {name: 'pattern'})
MERGE (s)-[:TAGGED_WITH]->(t);

MATCH (s:Skill {name: 'hash-chained-audit-trail'}), (t:Tag {name: 'audit'})
MERGE (s)-[:TAGGED_WITH]->(t);
MATCH (s:Skill {name: 'hash-chained-audit-trail'}), (t:Tag {name: 'pattern'})
MERGE (s)-[:TAGGED_WITH]->(t);

MATCH (s:Skill {name: 'role-scoped-agent-routing'}), (t:Tag {name: 'rbac'})
MERGE (s)-[:TAGGED_WITH]->(t);
MATCH (s:Skill {name: 'role-scoped-agent-routing'}), (t:Tag {name: 'pattern'})
MERGE (s)-[:TAGGED_WITH]->(t);

MATCH (s:Skill {name: 'mcp-tool-server-pattern'}), (t:Tag {name: 'mcp'})
MERGE (s)-[:TAGGED_WITH]->(t);
MATCH (s:Skill {name: 'mcp-tool-server-pattern'}), (t:Tag {name: 'pattern'})
MERGE (s)-[:TAGGED_WITH]->(t);

MATCH (s:Skill {name: 'howto-build-langgraph-agent-with-rbac'}), (t:Tag {name: 'langgraph'})
MERGE (s)-[:TAGGED_WITH]->(t);
MATCH (s:Skill {name: 'howto-build-langgraph-agent-with-rbac'}), (t:Tag {name: 'how-to'})
MERGE (s)-[:TAGGED_WITH]->(t);

MATCH (s:Skill {name: 'howto-implement-pgvector-rag'}), (t:Tag {name: 'rag'})
MERGE (s)-[:TAGGED_WITH]->(t);
MATCH (s:Skill {name: 'howto-implement-pgvector-rag'}), (t:Tag {name: 'how-to'})
MERGE (s)-[:TAGGED_WITH]->(t);

MATCH (s:Skill {name: 'howto-add-pii-masking-middleware'}), (t:Tag {name: 'pii'})
MERGE (s)-[:TAGGED_WITH]->(t);
MATCH (s:Skill {name: 'howto-add-pii-masking-middleware'}), (t:Tag {name: 'how-to'})
MERGE (s)-[:TAGGED_WITH]->(t);

MATCH (s:Skill {name: 'howto-safety-shields'}), (t:Tag {name: 'safety-shields'})
MERGE (s)-[:TAGGED_WITH]->(t);
MATCH (s:Skill {name: 'howto-safety-shields'}), (t:Tag {name: 'how-to'})
MERGE (s)-[:TAGGED_WITH]->(t);

MATCH (s:Skill {name: 'howto-mlflow-agent-observability'}), (t:Tag {name: 'how-to'})
MERGE (s)-[:TAGGED_WITH]->(t);
MATCH (s:Skill {name: 'howto-mlflow-agent-observability'}), (t:Tag {name: 'openshift-ai'})
MERGE (s)-[:TAGGED_WITH]->(t);

MATCH (s:Skill {name: 'component-agent-router'}), (t:Tag {name: 'reusable-code'})
MERGE (s)-[:TAGGED_WITH]->(t);
MATCH (s:Skill {name: 'component-agent-router'}), (t:Tag {name: 'langgraph'})
MERGE (s)-[:TAGGED_WITH]->(t);

MATCH (s:Skill {name: 'component-audit-event-model'}), (t:Tag {name: 'reusable-code'})
MERGE (s)-[:TAGGED_WITH]->(t);
MATCH (s:Skill {name: 'component-audit-event-model'}), (t:Tag {name: 'audit'})
MERGE (s)-[:TAGGED_WITH]->(t);

MATCH (s:Skill {name: 'component-pii-masking-filter'}), (t:Tag {name: 'reusable-code'})
MERGE (s)-[:TAGGED_WITH]->(t);
MATCH (s:Skill {name: 'component-pii-masking-filter'}), (t:Tag {name: 'pii'})
MERGE (s)-[:TAGGED_WITH]->(t);

MATCH (s:Skill {name: 'component-safety-shield-chain'}), (t:Tag {name: 'reusable-code'})
MERGE (s)-[:TAGGED_WITH]->(t);
MATCH (s:Skill {name: 'component-safety-shield-chain'}), (t:Tag {name: 'safety-shields'})
MERGE (s)-[:TAGGED_WITH]->(t);

// ============================================================================
// RELATED_TO: Cross-track relationships
// ============================================================================

MATCH (s1:Skill {name: 'risk-assessment'}), (s2:Skill {name: 'mcp-tool-server-pattern'})
MERGE (s1)-[:RELATED_TO {description: 'Engineering pattern that powers this business skill'}]->(s2);

MATCH (s1:Skill {name: 'compliance-kb-search'}), (s2:Skill {name: 'compliance-rag-tiered-boosting'})
MERGE (s1)-[:RELATED_TO {description: 'Engineering pattern that powers this business skill'}]->(s2);

MATCH (s1:Skill {name: 'compliance-verification'}), (s2:Skill {name: 'fair-lending-data-isolation'})
MERGE (s1)-[:RELATED_TO {description: 'Engineering pattern for fair lending safeguards'}]->(s2);

MATCH (s1:Skill {name: 'audit-trail-query'}), (s2:Skill {name: 'hash-chained-audit-trail'})
MERGE (s1)-[:RELATED_TO {description: 'Engineering pattern for hash-chained audit'}]->(s2);

MATCH (s1:Skill {name: 'pipeline-management'}), (s2:Skill {name: 'role-scoped-agent-routing'})
MERGE (s1)-[:RELATED_TO {description: 'Engineering pattern for role-based routing'}]->(s2);

MATCH (s1:Skill {name: 'underwriting-decision'}), (s2:Skill {name: 'langgraph-multi-agent-orchestration'})
MERGE (s1)-[:RELATED_TO {description: 'Engineering pattern for multi-agent orchestration'}]->(s2);

// ============================================================================
// Update bundle skill counts
// ============================================================================
MATCH (b:SkillBundle {name: 'mortgage-ai-business-skills'})-[:INCLUDES]->(s:Skill)
WITH b, count(s) AS cnt
SET b.skillCount = cnt;

MATCH (b:SkillBundle {name: 'multi-agent-engineering-patterns'})-[:INCLUDES]->(s:Skill)
WITH b, count(s) AS cnt
SET b.skillCount = cnt;
