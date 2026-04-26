/*
 * Copyright Red Hat, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import type { LoggerService } from '@backstage/backend-plugin-api';

type QueryMap = Record<string, string | Record<string, string>>;

const DEFAULTS: Record<string, QueryMap> = {
  schema: {
    constraints: {
      skillNameUnique:
        'CREATE CONSTRAINT skill_name IF NOT EXISTS FOR (s:Skill) REQUIRE s.name IS UNIQUE',
      toolNameUnique:
        'CREATE CONSTRAINT tool_name IF NOT EXISTS FOR (t:Tool) REQUIRE t.name IS UNIQUE',
      domainNameUnique:
        'CREATE CONSTRAINT domain_name IF NOT EXISTS FOR (d:Domain) REQUIRE d.name IS UNIQUE',
      agentNodeKey:
        'CREATE CONSTRAINT agent_name_ns IF NOT EXISTS FOR (a:Agent) REQUIRE (a.name, a.namespace) IS NODE KEY',
      agentCapNodeKey:
        'CREATE CONSTRAINT agentcap_key IF NOT EXISTS FOR (c:AgentCapability) REQUIRE (c.skillId, c.agentName, c.agentNamespace) IS NODE KEY',
      tagNameUnique:
        'CREATE CONSTRAINT tag_name IF NOT EXISTS FOR (t:Tag) REQUIRE t.name IS UNIQUE',
      bundleIdUnique:
        'CREATE CONSTRAINT bundle_id IF NOT EXISTS FOR (b:SkillBundle) REQUIRE b.id IS UNIQUE',
    },
    indexes: {
      skillCategory:
        'CREATE INDEX skill_category IF NOT EXISTS FOR (s:Skill) ON (s.category)',
      skillOciRef:
        'CREATE INDEX skill_ociref IF NOT EXISTS FOR (s:Skill) ON (s.ociReference)',
      skillSearchFulltext:
        'CREATE FULLTEXT INDEX skill_search IF NOT EXISTS FOR (s:Skill) ON EACH [s.name, s.description, s.category, s.author]',
      agentStatus:
        'CREATE INDEX agent_status IF NOT EXISTS FOR (a:Agent) ON (a.status)',
      agentCapSearch:
        'CREATE FULLTEXT INDEX agentcap_search IF NOT EXISTS FOR (c:AgentCapability) ON EACH [c.name, c.description]',
      tagNameIndex:
        'CREATE INDEX tag_name_idx IF NOT EXISTS FOR (t:Tag) ON (t.name)',
    },
    vectorIndex:
      "CREATE VECTOR INDEX skill_embedding IF NOT EXISTS FOR (s:Skill) ON s.embedding OPTIONS {indexConfig: {`vector.dimensions`: $dimensions, `vector.similarity_function`: 'cosine'}}",
  },
  read: {
    discoverSchemaLabels:
      'MATCH (n) WITH labels(n) AS lbls UNWIND lbls AS lbl RETURN lbl AS name, count(*) AS count ORDER BY count DESC',
    discoverSchemaRelTypes:
      'MATCH ()-[r]->() RETURN type(r) AS type, count(*) AS count ORDER BY count DESC',
    countAllNodes: 'MATCH (n) RETURN count(n) AS c',
    countAllRels: 'MATCH ()-[r]->() RETURN count(r) AS c',
    discoverPluginGroups:
      'MATCH (n) WHERE n.category IS NOT NULL RETURN n.category AS plugin, n.pluginColor AS color, count(*) AS count ORDER BY count DESC',
    fetchFullGraphNodes:
      'MATCH (n) RETURN n, labels(n) AS lbls, elementId(n) AS eid ORDER BY labels(n)[0], n.name LIMIT $limit',
    fetchRelsByElementIds:
      'MATCH (a)-[r]->(b) WHERE elementId(a) IN $eids AND elementId(b) IN $eids RETURN elementId(a) AS fromEid, elementId(b) AS toEid, type(r) AS rType, properties(r) AS rProps, elementId(r) AS rEid',
    searchGraphFulltext:
      'CALL db.index.fulltext.queryNodes("skill_search", $query) YIELD node, score WHERE score > 0.3 RETURN node AS n, labels(node) AS lbls, elementId(node) AS eid ORDER BY score DESC LIMIT 50',
    searchGraphFallback:
      "MATCH (n) WITH n, labels(n) AS lbls, elementId(n) AS eid, [key IN keys(n) WHERE n[key] =~ '(?i).*' + $query + '.*' | key] AS matchedKeys WHERE size(matchedKeys) > 0 RETURN n, lbls, eid LIMIT 50",
    fetchAgentsBySkill:
      'MATCH (a:Agent)-[:EXPOSES]->(c:AgentCapability)-[:IMPLEMENTED_BY]->(s:Skill {name: $skillName}) RETURN a.name AS name, a.namespace AS namespace, a.status AS status, a.description AS description, a.framework AS framework, a.version AS version, a.url AS url, a.streaming AS streaming, a.skillCount AS skillCount, c.skillId AS skillId ORDER BY a.name',
    fetchSkillsByAgent:
      'MATCH (a:Agent {name: $name, namespace: $namespace})-[:EXPOSES]->(c:AgentCapability)-[r:IMPLEMENTED_BY]->(s:Skill) RETURN s.name AS name, s.description AS description, s.category AS category, s.version AS version, s.complexity AS complexity, s.author AS author, c.skillId AS skillId, r.confidence AS confidence ORDER BY s.name',
    listAllAgents:
      'MATCH (a:Agent) OPTIONAL MATCH (a)-[:EXPOSES]->(c:AgentCapability) RETURN a.name AS name, a.namespace AS namespace, a.status AS status, a.description AS description, a.framework AS framework, a.version AS version, a.url AS url, a.streaming AS streaming, a.pushNotifications AS pushNotifications, a.provider AS provider, a.protocol AS protocol, a.workloadType AS workloadType, count(c) AS skillCount ORDER BY a.name',
    countAllAgents: 'MATCH (a:Agent) RETURN count(a) AS c',
    listAgentCapabilities:
      'MATCH (a:Agent {name: $agentName, namespace: $agentNamespace})-[:EXPOSES]->(c:AgentCapability) OPTIONAL MATCH (c)-[r:IMPLEMENTED_BY]->(s:Skill) RETURN c.skillId AS skillId, c.name AS name, c.description AS description, c.tags AS tags, c.examples AS examples, c.inputModes AS inputModes, c.outputModes AS outputModes, c.completeness AS completeness, s.name AS matchedSkillName, r.confidence AS matchConfidence, r.matchType AS matchType, r.verified AS verified, r.verifiedBy AS verifiedBy, r.matchedAt AS matchedAt, r.matchCount AS matchCount ORDER BY c.name',
    findUnmatchedCapabilities:
      'MATCH (a:Agent)-[:EXPOSES]->(c:AgentCapability) WHERE NOT (c)-[:IMPLEMENTED_BY]->(:Skill) RETURN c.skillId AS skillId, c.name AS name, c.description AS description, c.tags AS tags, a.name AS agentName, a.namespace AS agentNamespace ORDER BY a.name, c.name',
    findUnusedSkills:
      'MATCH (s:Skill) WHERE NOT (:AgentCapability)-[:IMPLEMENTED_BY]->(s) RETURN s.name AS name, s.description AS description, s.category AS category, s.version AS version ORDER BY s.name LIMIT $limit',
    listTags:
      'MATCH (t:Tag) OPTIONAL MATCH (s:Skill)-[:TAGGED_WITH]->(t) WITH t, count(DISTINCT s) AS sc OPTIONAL MATCH (c:AgentCapability)-[:TAGGED_WITH]->(t) RETURN t.name AS name, sc AS skillCount, count(DISTINCT c) AS capabilityCount ORDER BY sc + count(DISTINCT c) DESC LIMIT $limit',
    listSyncEvents:
      'MATCH (e:SyncEvent) RETURN e.timestamp AS timestamp, e.skillsUpserted AS skillsUpserted, e.capabilitiesCreated AS capabilitiesCreated, e.matchesCreated AS matchesCreated, e.gapsFound AS gapsFound, e.durationMs AS durationMs ORDER BY e.timestamp DESC LIMIT $limit',
    qualityAggregate:
      'OPTIONAL MATCH (s:Skill) WHERE s.completeness IS NOT NULL WITH avg(s.completeness) AS avgSkill, count(s) AS skillCount OPTIONAL MATCH (a:Agent) WHERE a.completeness IS NOT NULL WITH avgSkill, skillCount, avg(a.completeness) AS avgAgent, count(a) AS agentCount OPTIONAL MATCH (c:AgentCapability) WHERE c.completeness IS NOT NULL RETURN avgSkill, skillCount, avgAgent, agentCount, avg(c.completeness) AS avgCapability, count(c) AS capabilityCount',
    countCatalogGaps:
      'MATCH (a:Agent)-[:EXPOSES]->(c:AgentCapability) WHERE NOT (c)-[:IMPLEMENTED_BY]->(:Skill) RETURN count(c) AS gaps',
    fetchNeighborhood:
      'MATCH (center) WHERE center.name = $nodeId OR center.id = $nodeId OR center.uid = $nodeId OR center.uuid = $nodeId OR center.slug = $nodeId OR elementId(center) = $nodeId WITH center LIMIT 1 OPTIONAL MATCH path = (center)-[*1..{{depth}}]-(neighbor) WITH center, collect(DISTINCT neighbor) AS neighbors, collect(DISTINCT path) AS paths WITH [center] + [n IN neighbors WHERE n IS NOT NULL] AS allNodes, [p IN paths WHERE p IS NOT NULL | relationships(p)] AS allRelPaths UNWIND allNodes AS n WITH collect(DISTINCT n)[0..$limit] AS nodes, allRelPaths RETURN nodes, allRelPaths',
  },
  sync: {
    upsertSkill:
      'MERGE (s:Skill {name: $name}) ON CREATE SET s.namespace = $namespace, s.version = $version, s.description = $description, s.author = $author, s.license = $license, s.ociReference = $ociReference, s.category = $category, s.complexity = $complexity, s.contentHash = $hash, s.pluginColor = $pluginColor, s.tags = $tags, s.displayName = $displayName, s.lifecycleState = $lifecycleState, s.provenanceSource = $provenanceSource, s.provenanceCommit = $provenanceCommit, s.prompt = $prompt, s.examples = $examples, s.compatibility = $compatibility, s.completeness = $completeness, s.createdAt = datetime() ON MATCH SET s.namespace = $namespace, s.version = $version, s.description = $description, s.author = $author, s.license = $license, s.ociReference = $ociReference, s.category = $category, s.complexity = $complexity, s.contentHash = $hash, s.pluginColor = $pluginColor, s.tags = $tags, s.displayName = $displayName, s.lifecycleState = $lifecycleState, s.provenanceSource = $provenanceSource, s.provenanceCommit = $provenanceCommit, s.prompt = $prompt, s.examples = $examples, s.compatibility = $compatibility, s.completeness = $completeness, s.previousHash = CASE WHEN s.contentHash <> $hash THEN s.contentHash ELSE s.previousHash END, s.lastChangedAt = CASE WHEN s.contentHash <> $hash THEN datetime() ELSE s.lastChangedAt END, s.updatedAt = datetime() RETURN s.contentHash AS oldHash',
    deleteUsesToolEdges:
      'MATCH (s:Skill {name: $skillName})-[r:USES_TOOL]->() DELETE r',
    mergeUsesTool:
      'MATCH (s:Skill {name: $skillName}) UNWIND $tools AS tool MERGE (t:Tool {name: tool.name}) ON CREATE SET t.description = tool.description, t.docsUrl = tool.docsUrl, t.version = tool.version, t.deprecated = tool.deprecated ON MATCH SET t.description = tool.description, t.docsUrl = tool.docsUrl, t.version = tool.version, t.deprecated = tool.deprecated MERGE (s)-[:USES_TOOL]->(t)',
    deleteBelongsToEdges:
      'MATCH (s:Skill {name: $skillName})-[r:BELONGS_TO]->() DELETE r',
    mergeBelongsToDomain:
      'MATCH (s:Skill {name: $skillName}) MERGE (d:Domain {name: $domain}) ON CREATE SET d.color = $color, d.description = $description, d.owner = $owner ON MATCH SET d.color = $color, d.description = $description, d.owner = $owner MERGE (s)-[r:BELONGS_TO]->(d) SET r.primary = $primary',
    mergeDomainParent:
      'MATCH (child:Domain {name: $child}) MERGE (parent:Domain {name: $parent}) MERGE (parent)-[:PARENT_OF]->(child)',
    deleteDependsOnEdges:
      'MATCH (s:Skill {name: $skillName})-[r:DEPENDS_ON]->() DELETE r',
    mergeDependsOn:
      'MATCH (s:Skill {name: $skillName}) UNWIND $deps AS dep MERGE (d:Skill {name: dep.name}) MERGE (s)-[r:DEPENDS_ON]->(d) SET r.version = dep.version',
    deleteRelatedToEdges:
      'MATCH (s:Skill {name: $skillName})-[r:RELATED_TO]->() DELETE r',
    mergeRelatedTo:
      'MATCH (s:Skill {name: $skillName}) UNWIND $rels AS rel MERGE (t:Skill {name: rel.name}) MERGE (s)-[r:RELATED_TO]->(t) SET r.description = rel.description',
    upsertAgent:
      'MERGE (a:Agent {name: $name, namespace: $namespace}) SET a.status = $status, a.description = $description, a.framework = $framework, a.workloadType = $workloadType, a.url = $url, a.version = $version, a.documentationUrl = $documentationUrl, a.provider = $provider, a.providerUrl = $providerUrl, a.streaming = $streaming, a.pushNotifications = $pushNotifications, a.stateTransitionHistory = $stateTransitionHistory, a.authSchemes = $authSchemes, a.defaultInputModes = $defaultInputModes, a.defaultOutputModes = $defaultOutputModes, a.protocol = $protocol, a.skillCount = $skillCount, a.completeness = $completeness, a.updatedAt = datetime()',
    upsertAgentCapability:
      'MERGE (c:AgentCapability {skillId: $skillId, agentName: $agentName, agentNamespace: $agentNamespace}) SET c.name = $name, c.description = $description, c.tags = $tags, c.examples = $examples, c.inputModes = $inputModes, c.outputModes = $outputModes, c.completeness = $completeness, c.updatedAt = datetime()',
    deleteAgentCapabilities:
      'MATCH (c:AgentCapability {agentName: $agentName, agentNamespace: $agentNamespace}) DETACH DELETE c RETURN count(c) AS removed',
    mergeAgentExposes:
      'MATCH (a:Agent {name: $agentName, namespace: $agentNamespace}) MATCH (c:AgentCapability {skillId: $skillId, agentName: $agentName, agentNamespace: $agentNamespace}) MERGE (a)-[:EXPOSES]->(c)',
    mergeTag: 'MERGE (t:Tag {name: $tag}) RETURN t',
    mergeSkillTaggedWith:
      'MATCH (s:Skill {name: $skillName}) MERGE (t:Tag {name: $tag}) MERGE (s)-[:TAGGED_WITH]->(t)',
    mergeCapabilityTaggedWith:
      'MATCH (c:AgentCapability {skillId: $skillId, agentName: $agentName, agentNamespace: $agentNamespace}) MERGE (t:Tag {name: $tag}) MERGE (c)-[:TAGGED_WITH]->(t)',
    deleteSkillTaggedWith:
      'MATCH (s:Skill {name: $skillName})-[r:TAGGED_WITH]->() DELETE r',
    mergeImplementedBy:
      'MATCH (c:AgentCapability {skillId: $skillId, agentName: $agentName, agentNamespace: $agentNamespace}) MATCH (s:Skill {name: $skillName}) MERGE (c)-[r:IMPLEMENTED_BY]->(s) ON CREATE SET r.confidence = $confidence, r.matchType = $matchType, r.matchedAt = datetime(), r.lastVerifiedAt = datetime(), r.matchCount = 1, r.verified = false ON MATCH SET r.previousConfidence = r.confidence, r.confidence = $confidence, r.matchType = $matchType, r.lastVerifiedAt = datetime(), r.matchCount = coalesce(r.matchCount, 0) + 1',
    deleteCapabilityImplementedBy:
      "MATCH (c:AgentCapability {agentName: $agentName, agentNamespace: $agentNamespace})-[r:IMPLEMENTED_BY]->() WHERE coalesce(r.matchType, '') <> 'manual' AND coalesce(r.verified, false) <> true DELETE r",
    verifyImplementedBy:
      'MATCH (c:AgentCapability {skillId: $skillId, agentName: $agentName, agentNamespace: $agentNamespace})-[r:IMPLEMENTED_BY]->(s:Skill) SET r.verified = $verified, r.verifiedBy = $verifiedBy, r.verifiedAt = datetime() RETURN s.name AS skillName, r.confidence AS confidence',
    deleteCapabilityImplementedByAll:
      'MATCH (c:AgentCapability {skillId: $skillId, agentName: $agentName, agentNamespace: $agentNamespace})-[r:IMPLEMENTED_BY]->() DELETE r',
    overrideImplementedBy:
      "MATCH (c:AgentCapability {skillId: $skillId, agentName: $agentName, agentNamespace: $agentNamespace}) MATCH (s:Skill {name: $skillName}) MERGE (c)-[r:IMPLEMENTED_BY]->(s) ON CREATE SET r.confidence = 1.0, r.matchType = 'manual', r.matchedAt = datetime(), r.lastVerifiedAt = datetime(), r.matchCount = 1, r.verified = true, r.verifiedBy = $verifiedBy, r.verifiedAt = datetime() ON MATCH SET r.previousConfidence = r.confidence, r.confidence = 1.0, r.matchType = 'manual', r.lastVerifiedAt = datetime(), r.verified = true, r.verifiedBy = $verifiedBy, r.verifiedAt = datetime(), r.matchCount = coalesce(r.matchCount, 0) + 1 RETURN s.name AS skillName",
    deleteStaleCapabilities:
      "MATCH (c:AgentCapability) WHERE NOT (c.agentName + '/' + c.agentNamespace) IN $keys DETACH DELETE c RETURN count(c) AS removed",
    deleteOrphanTags:
      'MATCH (t:Tag) WHERE NOT (t)<-[:TAGGED_WITH]-() DETACH DELETE t',
    migrateRemoveUsesSkill:
      'MATCH ()-[r:USES_SKILL]->() DELETE r RETURN count(r) AS removed',
    deleteStaleAgents:
      "MATCH (a:Agent) WHERE NOT (a.name + '/' + a.namespace) IN $keys DETACH DELETE a RETURN count(a) AS removed",
    /** OCI registry is source of truth: remove :Skill not in the current sync name list. */
    deleteStaleSkills:
      'MATCH (s:Skill) WHERE NOT s.name IN $names DETACH DELETE s RETURN count(s) AS removed',
    deleteOrphanTools:
      'MATCH (t:Tool) WHERE NOT (t)<-[:USES_TOOL]-() DETACH DELETE t',
    deleteOrphanDomains:
      'MATCH (d:Domain) WHERE NOT (d)<-[:BELONGS_TO]-() DETACH DELETE d',
    createSyncEvent:
      'CREATE (e:SyncEvent {timestamp: datetime(), skillsUpserted: $skillsUpserted, capabilitiesCreated: $capabilitiesCreated, matchesCreated: $matchesCreated, gapsFound: $gapsFound, durationMs: $durationMs})',
    pruneSyncEvents:
      'MATCH (e:SyncEvent) WITH e ORDER BY e.timestamp DESC SKIP $retention DETACH DELETE e',
    listMissingEmbeddings:
      'MATCH (s:Skill) WHERE s.embedding IS NULL RETURN s.name AS name, s.description AS description LIMIT $limit',
    setSkillEmbedding:
      'MATCH (s:Skill {name: $name}) SET s.embedding = $embedding',
    listEmbeddedSkillNames:
      'MATCH (s:Skill) WHERE s.embedding IS NOT NULL RETURN s.name AS name',
    mergeSimilarTo:
      "MATCH (a:Skill {name: $name}) WHERE a.embedding IS NOT NULL CALL db.index.vector.queryNodes('skill_embedding', $topK, a.embedding) YIELD node AS b, score WHERE b.name <> a.name AND score >= $threshold MERGE (a)-[r:SIMILAR_TO]->(b) SET r.score = score, r._synced = true RETURN a.name AS from, b.name AS to",
    deleteUnsyncedSimilarTo:
      'MATCH ()-[r:SIMILAR_TO]->() WHERE r._synced IS NULL DELETE r',
    removeSimilarToSyncedFlag: 'MATCH ()-[r:SIMILAR_TO]->() REMOVE r._synced',
  },
  rag: {
    vectorSearch:
      "CALL db.index.vector.queryNodes('skill_embedding', $topK, $queryEmbedding) YIELD node, score WHERE score >= $minSimilarity RETURN node, elementId(node) AS eid, score ORDER BY score DESC",
    fulltextSearch:
      "CALL db.index.fulltext.queryNodes('skill_search', $query) YIELD node, score WHERE score > $floor RETURN node, elementId(node) AS eid, score ORDER BY score DESC LIMIT $limit",
    fulltextFallback:
      'MATCH (s:Skill) WHERE toLower(s.name) CONTAINS toLower($query) OR toLower(s.description) CONTAINS toLower($query) RETURN s AS node, elementId(s) AS eid LIMIT $limit',
    expandRelatedSkills:
      'UNWIND $names AS seedName MATCH (s:Skill {name: seedName})-[r:DEPENDS_ON|RELATED_TO|SIMILAR_TO]-(neighbor:Skill) RETURN seedName, neighbor, elementId(neighbor) AS eid, type(r) AS relType, CASE WHEN r.score IS NOT NULL THEN r.score ELSE 0.5 END AS relScore LIMIT $limit',
    collectToolsBySkill:
      'UNWIND $names AS skillName MATCH (s:Skill {name: skillName})-[:USES_TOOL]->(t:Tool) RETURN skillName, collect(t.name) AS tools',
    countAllSkills: 'MATCH (s:Skill) RETURN count(s) AS c',
  },
  bundle: {
    createBundle:
      'CREATE (b:SkillBundle {id: $id, name: $name, description: $description, author: $author, status: $status, skillCount: 0, createdAt: datetime(), updatedAt: datetime()})',
    linkSkill: `MATCH (b:SkillBundle {id: $bundleId})
           MATCH (s:Skill) WHERE s.category + '-' + s.name = $slug OR s.name = $slug
           WITH b, s LIMIT 1
           MERGE (b)-[r:INCLUDES]->(s)
           SET r.addedBy = 'user', r.addedAt = datetime()
           RETURN s.name AS matched`,
    updateSkillCount: `MATCH (b:SkillBundle {id: $id})-[:INCLUDES]->(s:Skill)
         WITH b, count(s) AS cnt
         SET b.skillCount = cnt`,
    listBundles: `MATCH (b:SkillBundle)
         OPTIONAL MATCH (b)-[:INCLUDES]->(s:Skill)
         RETURN b.id AS id, b.name AS name, b.description AS description,
                b.author AS author, b.status AS status, b.createdAt AS createdAt,
                count(s) AS skillCount
         ORDER BY b.createdAt DESC`,
    getBundle: 'MATCH (b:SkillBundle {id: $id}) RETURN b',
    getBundleSkills: `MATCH (b:SkillBundle {id: $id})-[r:INCLUDES]->(s:Skill)
         RETURN s.name AS name, s.description AS description, s.category AS category,
                s.version AS version, s.complexity AS complexity, s.author AS skillAuthor,
                r.addedBy AS addedBy,
                s.category + '-' + s.name AS slug
         ORDER BY s.name`,
    updateBundleMeta: `MATCH (b:SkillBundle {id: $id})
           SET b.name = COALESCE($name, b.name),
               b.description = COALESCE($description, b.description),
               b.updatedAt = datetime()`,
    deleteIncludesEdges:
      'MATCH (b:SkillBundle {id: $id})-[r:INCLUDES]->() DELETE r',
    updateSkillCountWithTimestamp: `MATCH (b:SkillBundle {id: $id})
           OPTIONAL MATCH (b)-[:INCLUDES]->(s:Skill)
           WITH b, count(s) AS cnt
           SET b.skillCount = cnt, b.updatedAt = datetime()`,
    deleteBundle: 'MATCH (b:SkillBundle {id: $id}) DETACH DELETE b',
    resolveDependencies: `WITH $roots AS rootNames
         UNWIND rootNames AS rootName
         MATCH (root:Skill {name: rootName})-[:DEPENDS_ON*1..3]->(dep:Skill)
         WHERE NOT dep.name IN rootNames
         RETURN DISTINCT dep.name AS name, dep.category AS category,
                dep.description AS description, rootName AS dependencyOf`,
    resolveTools: `WITH $roots AS rootNames
         UNWIND rootNames AS rootName
         MATCH (s:Skill {name: rootName})-[:USES_TOOL]->(t:Tool)
         RETURN DISTINCT t.name AS name, t.description AS description`,
    resolveSimilar: `WITH $roots AS rootNames
         UNWIND rootNames AS rootName
         MATCH (s:Skill {name: rootName})-[:SIMILAR_TO]-(sim:Skill)
         WHERE NOT sim.name IN rootNames
         RETURN DISTINCT sim.name AS name, sim.category AS category,
                sim.description AS description, rootName AS similarTo
         LIMIT $limit`,
  },
  tools: {
    searchSemantic:
      "CALL db.index.vector.queryNodes('skill_embedding', $topK, $embedding) YIELD node, score WHERE score >= 0.5 RETURN node.name AS name, node.description AS description, node.category AS category, node.version AS version, node.author AS author, node.ociReference AS ociReference, score ORDER BY score DESC",
    searchKeywordFulltext:
      "CALL db.index.fulltext.queryNodes('skill_search', $query) YIELD node, score WHERE score > 0.3 RETURN node.name AS name, node.description AS description, node.category AS category, node.version AS version, node.author AS author, node.ociReference AS ociReference, score ORDER BY score DESC LIMIT $limit",
    searchKeywordFallback:
      'MATCH (s:Skill) WHERE toLower(s.name) CONTAINS toLower($query) OR toLower(s.description) CONTAINS toLower($query) RETURN s.name AS name, s.description AS description, s.category AS category, s.version AS version, s.author AS author, s.ociReference AS ociReference, 1.0 AS score LIMIT $limit',
    getSkillDetails:
      'MATCH (s:Skill) WHERE s.name = $name OR s.ociReference = $name RETURN s.name AS name, s.description AS description, s.category AS category, s.version AS version, s.author AS author, s.ociReference AS ociReference, s.complexity AS complexity, s.tags AS tags, s.displayName AS displayName LIMIT 1',
    exploreNeighborhood:
      'MATCH (center) WHERE center.name = $nodeId OR center.id = $nodeId MATCH (center)-[r*1..{{depth}}]-(neighbor) WITH center, collect(DISTINCT neighbor)[0..$limit] AS neighbors, [rel IN collect(DISTINCT last(r)) | {type: type(rel), from: startNode(rel).name, to: endNode(rel).name}] AS connections RETURN center.name AS centerName, labels(center) AS centerLabels, [n IN neighbors | {name: n.name, labels: labels(n), description: n.description}] AS neighbors, connections[0..$limit] AS connections',
    queryRelationships:
      'MATCH {{fromClause}}-{{relClause}}->{{toClause}} {{whereClause}} RETURN a.name AS from, type(r) AS relType, b.name AS to, labels(a) AS fromLabels, labels(b) AS toLabels LIMIT $limit',
    listSkillsByDomain:
      'MATCH (s:Skill) WHERE toLower(s.category) = toLower($domain) RETURN s.name AS name, s.description AS description, s.category AS category, s.version AS version, s.complexity AS complexity, s.author AS author ORDER BY s.name LIMIT $limit',
    listAgents:
      'MATCH (a:Agent) OPTIONAL MATCH (a)-[:EXPOSES]->(c:AgentCapability) OPTIONAL MATCH (c)-[:IMPLEMENTED_BY]->(s:Skill) RETURN a.name AS name, a.namespace AS namespace, a.status AS status, a.description AS description, a.framework AS framework, a.version AS version, a.streaming AS streaming, collect(DISTINCT c.name) AS capabilities, collect(DISTINCT s.name) AS skills ORDER BY a.name LIMIT $limit',
    getAgentDetails:
      'MATCH (a:Agent {name: $name}) OPTIONAL MATCH (a)-[:EXPOSES]->(c:AgentCapability) OPTIONAL MATCH (c)-[r:IMPLEMENTED_BY]->(s:Skill) RETURN a.name AS name, a.namespace AS namespace, a.status AS status, a.description AS description, a.framework AS framework, a.version AS version, a.url AS url, a.streaming AS streaming, a.pushNotifications AS pushNotifications, a.provider AS provider, a.protocol AS protocol, a.defaultInputModes AS defaultInputModes, a.defaultOutputModes AS defaultOutputModes, collect({capName: c.name, capId: c.skillId, skillName: s.name, confidence: r.confidence, matchType: r.matchType}) AS capabilities',
    findGaps:
      'MATCH (a:Agent)-[:EXPOSES]->(c:AgentCapability) WHERE NOT (c)-[:IMPLEMENTED_BY]->(:Skill) WITH a, collect({name: c.name, description: c.description, tags: c.tags}) AS gaps WHERE size(gaps) > 0 RETURN a.name AS agentName, a.namespace AS agentNamespace, gaps ORDER BY a.name LIMIT $limit',
  },
};

const READ_MUTATION_KEYWORDS =
  /\b(MERGE|CREATE|DELETE|DETACH\s+DELETE|SET|REMOVE|DROP)\b/i;
const WRITE_DDL_KEYWORDS =
  /\b(DROP\s+INDEX|DROP\s+CONSTRAINT|CREATE\s+INDEX|CREATE\s+CONSTRAINT|CREATE\s+FULLTEXT\s+INDEX|CREATE\s+VECTOR\s+INDEX)\b/i;

export class CypherQueryCatalog {
  private readonly queries: Record<
    string,
    Record<string, string | Record<string, string>>
  >;

  constructor(overrides?: Record<string, unknown>, _logger?: LoggerService) {
    this.queries = this.merge(DEFAULTS, overrides);
  }

  private merge(
    defaults: Record<string, QueryMap>,
    overrides?: Record<string, unknown>,
  ): Record<string, Record<string, string | Record<string, string>>> {
    const result: Record<
      string,
      Record<string, string | Record<string, string>>
    > = {};
    for (const [section, entries] of Object.entries(defaults)) {
      result[section] = { ...entries };
    }
    if (!overrides) return result;
    for (const [section, entries] of Object.entries(overrides)) {
      if (!entries || typeof entries !== 'object') continue;
      if (!result[section]) result[section] = {};
      for (const [key, value] of Object.entries(
        entries as Record<string, unknown>,
      )) {
        if (typeof value === 'string') {
          result[section][key] = value;
        } else if (value && typeof value === 'object') {
          const existing = result[section][key];
          if (
            existing &&
            typeof existing === 'object' &&
            !Array.isArray(existing)
          ) {
            result[section][key] = {
              ...existing,
              ...(value as Record<string, string>),
            };
          } else {
            result[section][key] = value as Record<string, string>;
          }
        }
      }
    }
    return result;
  }

  get(key: string, templateVars?: Record<string, string | number>): string {
    const parts = key.split('.');
    if (parts.length < 2) {
      throw new Error(
        `CypherQueryCatalog: invalid key "${key}" — expected "section.name" or "section.sub.name"`,
      );
    }
    const section = this.queries[parts[0]];
    if (!section)
      throw new Error(`CypherQueryCatalog: unknown section "${parts[0]}"`);

    let value: string | Record<string, string> | undefined;
    if (parts.length === 2) {
      value = section[parts[1]];
    } else {
      const sub = section[parts[1]];
      if (sub && typeof sub === 'object') {
        value = (sub as Record<string, string>)[parts[2]];
      }
    }

    if (value === undefined || typeof value !== 'string') {
      throw new Error(`CypherQueryCatalog: query "${key}" not found`);
    }

    if (!templateVars) return value;
    let result = value;
    for (const [k, v] of Object.entries(templateVars)) {
      result = result.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), String(v));
    }
    return result;
  }

  getSection(key: string): Record<string, string> {
    const parts = key.split('.');
    if (parts.length === 1) {
      const section = this.queries[parts[0]];
      if (!section) return {};
      const flat: Record<string, string> = {};
      for (const [k, v] of Object.entries(section)) {
        if (typeof v === 'string') flat[k] = v;
      }
      return flat;
    }
    const section = this.queries[parts[0]];
    if (!section) return {};
    const value = section[parts[1]];
    if (value && typeof value === 'object')
      return value as Record<string, string>;
    return {};
  }

  // Validates read-only namespaces (read, rag, tools) don't contain mutation keywords
  // and sync namespace doesn't contain DDL keywords.
  // Write-allowed namespaces (schema, sync, bundle) are intentionally excluded.
  validate(): string[] {
    const errors: string[] = [];
    for (const section of ['read', 'rag', 'tools']) {
      const entries = this.queries[section];
      if (!entries) continue;
      for (const [key, value] of Object.entries(entries)) {
        if (typeof value !== 'string') continue;
        if (READ_MUTATION_KEYWORDS.test(value)) {
          errors.push(
            `Read query "${section}.${key}" contains mutation keyword`,
          );
        }
      }
    }
    const syncEntries = this.queries.sync;
    if (syncEntries) {
      for (const [key, value] of Object.entries(syncEntries)) {
        if (typeof value !== 'string') continue;
        if (WRITE_DDL_KEYWORDS.test(value)) {
          errors.push(`Sync query "sync.${key}" contains DDL keyword`);
        }
      }
    }
    return errors;
  }
}
