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
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApi, useRouteRef } from '@backstage/core-plugin-api';
import { rootRouteRef } from '../../routes';
import {
  PageSection,
  Title,
  Content,
  ContentVariants,
  Tabs,
  Tab,
  TabTitleText,
  TabTitleIcon,
  Card,
  CardBody,
  CardTitle,
  Label,
  LabelGroup,
  Button,
  CodeBlock,
  CodeBlockCode,
  Breadcrumb,
  BreadcrumbItem,
  Grid,
  GridItem,
  Divider,
  ExpandableSection,
  Split,
  SplitItem,
} from '@patternfly/react-core';
import {
  ArrowLeftIcon,
  ExternalLinkAltIcon,
  ListIcon,
  CodeIcon,
  FolderOpenIcon,
  InfoCircleIcon,
  ExclamationTriangleIcon,
  RocketIcon,
} from '@patternfly/react-icons';
import { skillMarketplaceApiRef } from '../../api';
import type { SkillData } from '@red-hat-developer-hub/backstage-plugin-skill-marketplace-common';
import {
  getComplexity,
  humanize,
} from '@red-hat-developer-hub/backstage-plugin-skill-marketplace-common';
import LoadingSpinner from '../shared/LoadingSpinner';
import ErrorMessage from '../shared/ErrorMessage';
import { useBundle } from '../../hooks';

export default function SkillDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const basePath = useRouteRef(rootRouteRef)();
  const api = useApi(skillMarketplaceApiRef);
  const [skill, setSkill] = useState<SkillData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState(0);
  const { addSkill, hasSkill } = useBundle();

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    setLoading(true);
    api
      .getSkillBySlug(slug)
      .then(data => {
        if (!cancelled) {
          setSkill(data);
          setLoading(false);
        }
      })
      .catch(err => {
        if (!cancelled) {
          setError(err.message || 'Failed to load skill');
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [api, slug]);

  if (loading) return <LoadingSpinner message="Loading skill details..." />;
  if (error) return <ErrorMessage message={error} />;
  if (!skill) return <ErrorMessage message="Skill not found" />;

  const complexity = getComplexity(skill.rawContent.split('\n').length);
  const title = skill.sections.title || skill.name.split(':').pop() || skill.name;

  const complexityColor: Record<string, 'blue' | 'green' | 'orange' | 'red'> =
    {
      Simple: 'green',
      Medium: 'blue',
      Complex: 'orange',
      Advanced: 'red',
    };

  const hasAssets =
    skill.assets.references.length > 0 ||
    skill.assets.templates.length > 0 ||
    skill.assets.examples.length > 0;

  return (
    <>
      <PageSection variant="default" className="sm-detail-header">
        <Breadcrumb style={{ marginBottom: 12 }}>
          <BreadcrumbItem>
            <Button variant="link" isInline onClick={() => navigate('..')}>
              Skills
            </Button>
          </BreadcrumbItem>
          <BreadcrumbItem>
            <Button variant="link" isInline onClick={() => navigate('..')}>
              {skill.pluginName}
            </Button>
          </BreadcrumbItem>
          <BreadcrumbItem isActive>{title}</BreadcrumbItem>
        </Breadcrumb>

        <Split hasGutter>
          <SplitItem>
            <Button
              variant="plain"
              onClick={() => navigate('..')}
              aria-label="Back"
            >
              <ArrowLeftIcon />
            </Button>
          </SplitItem>
          <SplitItem isFilled>
            <Title headingLevel="h1" size="2xl">
              {title}
            </Title>
            <Content
              component={ContentVariants.p}
              style={{ marginTop: 4, maxWidth: 800 }}
            >
              {skill.description}
            </Content>

            <LabelGroup style={{ marginTop: 12 }}>
              <Label
                style={{
                  backgroundColor: skill.plugin.color || '#6b7280',
                  color: '#fff',
                  borderColor: 'transparent',
                }}
              >
                {skill.pluginName}
              </Label>
              {skill.lifecycleState && (
                <Label color={
                  skill.lifecycleState === 'published' ? 'green' :
                  skill.lifecycleState === 'testing' ? 'blue' :
                  skill.lifecycleState === 'deprecated' ? 'orange' :
                  skill.lifecycleState === 'archived' ? 'grey' : 'yellow'
                }>
                  {skill.lifecycleState.charAt(0).toUpperCase() + skill.lifecycleState.slice(1)}
                </Label>
              )}
              <Label color={complexityColor[complexity] ?? 'blue'}>
                {complexity}
              </Label>
              {skill.version && <Label color="grey">v{skill.version}</Label>}
              {skill.model && (
                <Label color="purple" icon={<CodeIcon />}>
                  {skill.model}
                </Label>
              )}
              {skill.sections.workflow.length > 0 && (
                <Label color="blue" icon={<ListIcon />}>
                  {skill.sections.workflow.length} steps
                </Label>
              )}
              {skill.authors && (
                <Label color="grey">{skill.authors}</Label>
              )}
            </LabelGroup>
            {skill.tags && skill.tags.length > 0 && (
              <LabelGroup style={{ marginTop: 8 }}>
                {skill.tags.map(t => (
                  <Label key={t} color="blue" variant="outline">{t}</Label>
                ))}
              </LabelGroup>
            )}
            <div style={{ marginTop: 12 }}>
              <Button
                variant={hasSkill(skill.skillName) ? 'secondary' : 'primary'}
                isDisabled={hasSkill(skill.skillName)}
                onClick={() => addSkill({
                  name: skill.skillName,
                  slug: skill.slug,
                  category: skill.pluginName,
                  description: skill.description,
                })}
              >
                {hasSkill(skill.skillName) ? 'In Bundle' : 'Add to Bundle'}
              </Button>
            </div>
          </SplitItem>
        </Split>
      </PageSection>

      <PageSection>
        <Tabs
          activeKey={activeTab}
          onSelect={(_e, key) => setActiveTab(key as number)}
          isFilled
        >
          <Tab
            eventKey={0}
            title={
              <>
                <TabTitleIcon><InfoCircleIcon /></TabTitleIcon>
                <TabTitleText>Overview</TabTitleText>
              </>
            }
          >
            <div style={{ marginTop: 16 }}>
              <Grid hasGutter>
                <GridItem md={8}>
                  {skill.sections.prerequisites &&
                    skill.sections.prerequisites.length > 0 && (
                      <Card isCompact style={{ marginBottom: 16 }}>
                        <CardTitle>
                          <span className="sm-section-title" style={{ margin: 0 }}>
                            <ExclamationTriangleIcon color="var(--pf-t--global--color--status--warning--default)" />
                            Prerequisites
                          </span>
                        </CardTitle>
                        <CardBody>
                          <ul className="sm-prereq-list">
                            {skill.sections.prerequisites.map((p, i) => (
                              <li key={i}>{p}</li>
                            ))}
                          </ul>
                        </CardBody>
                      </Card>
                    )}

                  {skill.sections.criticalRules &&
                    skill.sections.criticalRules.length > 0 && (
                      <Card isCompact style={{ marginBottom: 16 }}>
                        <CardTitle>
                          <span className="sm-section-title" style={{ margin: 0 }}>
                            <ExclamationTriangleIcon color="var(--pf-t--global--color--status--danger--default)" />
                            Critical Rules
                          </span>
                        </CardTitle>
                        <CardBody>
                          {skill.sections.criticalRules.map((r, i) => (
                            <div
                              key={i}
                              style={{
                                padding: '8px 12px',
                                marginBottom: 8,
                                borderLeft: '3px solid var(--pf-t--global--color--status--danger--default)',
                                backgroundColor: 'var(--pf-t--global--color--status--danger--default--clicked)',
                                borderRadius: '0 4px 4px 0',
                                fontSize: '0.9rem',
                              }}
                            >
                              {r}
                            </div>
                          ))}
                        </CardBody>
                      </Card>
                    )}

                  {skill.sections.workflow.length > 0 && (
                    <Card isCompact>
                      <CardTitle>
                        <span className="sm-section-title" style={{ margin: 0 }}>
                          <ListIcon />
                          Workflow ({skill.sections.workflow.length} steps)
                        </span>
                      </CardTitle>
                      <CardBody>
                        {skill.sections.workflow.map((step, idx) => (
                          <div
                            key={step.step}
                            className="sm-workflow-step"
                          >
                            <div className="sm-workflow-step-number">
                              {step.step}
                            </div>
                            {idx < skill.sections.workflow.length - 1 && (
                              <div className="sm-workflow-step-line" />
                            )}
                            <Title headingLevel="h4" size="md" style={{ marginBottom: 4 }}>
                              {step.title}
                            </Title>
                            <Content
                              component={ContentVariants.p}
                              style={{ color: 'var(--pf-t--global--text--color--subtle)', lineHeight: 1.6 }}
                            >
                              {step.content}
                            </Content>
                          </div>
                        ))}
                      </CardBody>
                    </Card>
                  )}
                </GridItem>

                <GridItem md={4}>
                  <Card isCompact style={{ marginBottom: 16 }}>
                    <CardTitle>Details</CardTitle>
                    <CardBody>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div>
                          <Content component={ContentVariants.small} style={{ color: 'var(--pf-t--global--text--color--subtle)' }}>
                            Category
                          </Content>
                          <Label
                            style={{
                              backgroundColor: skill.plugin.color || '#6b7280',
                              color: '#fff',
                              borderColor: 'transparent',
                              marginTop: 4,
                            }}
                          >
                            {skill.pluginName}
                          </Label>
                        </div>
                        <Divider />
                        <div>
                          <Content component={ContentVariants.small} style={{ color: 'var(--pf-t--global--text--color--subtle)' }}>
                            Complexity
                          </Content>
                          <div style={{ marginTop: 4 }}>
                            <Label color={complexityColor[complexity] ?? 'blue'}>
                              {complexity}
                            </Label>
                          </div>
                        </div>
                        {skill.model && (
                          <>
                            <Divider />
                            <div>
                              <Content component={ContentVariants.small} style={{ color: 'var(--pf-t--global--text--color--subtle)' }}>
                                Recommended Model
                              </Content>
                              <div style={{ marginTop: 4, fontWeight: 500 }}>
                                {skill.model}
                              </div>
                            </div>
                          </>
                        )}
                        {skill.version && (
                          <>
                            <Divider />
                            <div>
                              <Content component={ContentVariants.small} style={{ color: 'var(--pf-t--global--text--color--subtle)' }}>
                                Version
                              </Content>
                              <div style={{ marginTop: 4 }}>v{skill.version}</div>
                            </div>
                          </>
                        )}
                        <Divider />
                        <div>
                          <Content component={ContentVariants.small} style={{ color: 'var(--pf-t--global--text--color--subtle)' }}>
                            Source Path
                          </Content>
                          <div style={{ marginTop: 4, fontFamily: 'var(--pf-t--global--font--family--mono)', fontSize: '0.8rem' }}>
                            {skill.gitPath}
                          </div>
                        </div>
                      </div>
                    </CardBody>
                  </Card>

                  {skill.sections.relatedSkills.length > 0 && (
                    <Card isCompact>
                      <CardTitle>
                        <span className="sm-section-title" style={{ margin: 0 }}>
                          <ExternalLinkAltIcon />
                          Related Skills
                        </span>
                      </CardTitle>
                      <CardBody>
                        <LabelGroup>
                          {skill.sections.relatedSkills.map(rs => (
                            <Label
                              key={rs.slug}
                              color="blue"
                              className="sm-related-skill-chip"
                              onClick={() => {
                                const relSlug = rs.name.replace(':', '-');
                                navigate(`../${relSlug}`);
                              }}
                            >
                              {humanize(rs.name)}
                            </Label>
                          ))}
                        </LabelGroup>
                      </CardBody>
                    </Card>
                  )}
                </GridItem>
              </Grid>
            </div>
          </Tab>

          <Tab
            eventKey={1}
            title={
              <>
                <TabTitleIcon><CodeIcon /></TabTitleIcon>
                <TabTitleText>Raw Content</TabTitleText>
              </>
            }
          >
            <Card style={{ marginTop: 16 }}>
              <CardBody>
                <CodeBlock>
                  <CodeBlockCode>{skill.rawContent}</CodeBlockCode>
                </CodeBlock>
              </CardBody>
            </Card>
          </Tab>

          {hasAssets && (
            <Tab
              eventKey={2}
              title={
                <>
                  <TabTitleIcon><FolderOpenIcon /></TabTitleIcon>
                  <TabTitleText>
                    Assets ({skill.assets.references.length + skill.assets.templates.length + skill.assets.examples.length})
                  </TabTitleText>
                </>
              }
            >
              <div style={{ marginTop: 16 }}>
                {skill.assets.references.length > 0 && (
                  <Card isCompact style={{ marginBottom: 16 }}>
                    <CardTitle>References</CardTitle>
                    <CardBody>
                      {skill.assets.references.map(a => (
                        <ExpandableSection
                          key={a.path}
                          toggleText={a.name}
                          isIndented
                        >
                          <CodeBlock>
                            <CodeBlockCode>{a.content}</CodeBlockCode>
                          </CodeBlock>
                        </ExpandableSection>
                      ))}
                    </CardBody>
                  </Card>
                )}
                {skill.assets.templates.length > 0 && (
                  <Card isCompact style={{ marginBottom: 16 }}>
                    <CardTitle>Templates</CardTitle>
                    <CardBody>
                      {skill.assets.templates.map(a => (
                        <ExpandableSection
                          key={a.path}
                          toggleText={a.name}
                          isIndented
                        >
                          <CodeBlock>
                            <CodeBlockCode>{a.content}</CodeBlockCode>
                          </CodeBlock>
                        </ExpandableSection>
                      ))}
                    </CardBody>
                  </Card>
                )}
                {skill.assets.examples.length > 0 && (
                  <Card isCompact>
                    <CardTitle>Examples</CardTitle>
                    <CardBody>
                      {skill.assets.examples.map(a => (
                        <ExpandableSection
                          key={a.path}
                          toggleText={a.name}
                          isIndented
                        >
                          <CodeBlock>
                            <CodeBlockCode>{a.content}</CodeBlockCode>
                          </CodeBlock>
                        </ExpandableSection>
                      ))}
                    </CardBody>
                  </Card>
                )}
              </div>
            </Tab>
          )}

          <Tab
            eventKey={3}
            title={
              <>
                <TabTitleIcon><RocketIcon /></TabTitleIcon>
                <TabTitleText>Test with Agent</TabTitleText>
              </>
            }
          >
            <Card style={{ marginTop: 16 }}>
              <CardBody>
                <Title headingLevel="h3" size="lg" style={{ marginBottom: 12 }}>
                  Test this skill in the Skills Playground
                </Title>
                <Content component={ContentVariants.p} style={{ marginBottom: 16, color: 'var(--pf-t--global--text--color--subtle)' }}>
                  Open the Skills Playground with &ldquo;{humanize(skill.name)}&rdquo; pre-selected.
                  The live agent will load this skill and you can test it interactively.
                </Content>
                <Button
                  variant="primary"
                  onClick={() => navigate(`${basePath}/playground?skill=${encodeURIComponent(skill.skillName)}`)}
                  icon={<RocketIcon />}
                >
                  Open Skills Playground
                </Button>
              </CardBody>
            </Card>
          </Tab>
        </Tabs>
      </PageSection>
    </>
  );
}
