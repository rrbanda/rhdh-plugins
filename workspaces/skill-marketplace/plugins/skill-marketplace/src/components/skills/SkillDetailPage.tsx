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
import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApi, useRouteRef } from '@backstage/core-plugin-api';
import { useTheme } from '@material-ui/core/styles';
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
import AddToBundleButton from '../shared/AddToBundleButton';

function CopyButton({
  text,
  isDarkMode,
}: {
  text: string;
  isDarkMode: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    window.navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label="Copy code to clipboard"
      style={{
        position: 'absolute',
        top: 8,
        right: 8,
        background: isDarkMode ? '#383838' : '#e1e4e8',
        border: 'none',
        borderRadius: 4,
        padding: '4px 8px',
        cursor: 'pointer',
        color: isDarkMode ? '#d4d4d4' : '#24292f',
        fontSize: '0.75rem',
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        opacity: copied ? 1 : 0.7,
        transition: 'opacity 0.15s',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.opacity = '1';
      }}
      onMouseLeave={e => {
        if (!copied) (e.currentTarget as HTMLElement).style.opacity = '0.7';
      }}
    >
      {copied ? (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <path d="M13.485 1.929a1 1 0 010 1.414l-7.071 7.071a1 1 0 01-1.414 0L1.929 7.343a1 1 0 111.414-1.414L5.707 8.293l6.364-6.364a1 1 0 011.414 0z" />
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 010 1.5h-1.5a.25.25 0 00-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 00.25-.25v-1.5a.75.75 0 011.5 0v1.5A1.75 1.75 0 019.25 16h-7.5A1.75 1.75 0 010 14.25v-7.5z" />
          <path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0114.25 11h-7.5A1.75 1.75 0 015 9.25v-7.5zm1.75-.25a.25.25 0 00-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 00.25-.25v-7.5a.25.25 0 00-.25-.25h-7.5z" />
        </svg>
      )}
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}

function renderContentWithCode(
  text: string,
  isDarkMode: boolean,
): React.ReactNode {
  const codeBg = isDarkMode ? '#1e1e1e' : '#f6f8fa';
  const codeBorder = isDarkMode ? '#383838' : '#d0d7de';
  const codeColor = isDarkMode ? '#d4d4d4' : '#24292f';
  const parts = text.split(/(```[\s\S]*?```)/g);
  return parts.map((part, i) => {
    if (part.startsWith('```') && part.endsWith('```')) {
      const inner = part.slice(3, -3);
      const newlineIdx = inner.indexOf('\n');
      const code = (
        newlineIdx >= 0 ? inner.slice(newlineIdx + 1) : inner
      ).trim();
      return (
        <div key={i} style={{ position: 'relative' }}>
          <CopyButton text={code} isDarkMode={isDarkMode} />
          <pre
            style={{
              backgroundColor: codeBg,
              border: `1px solid ${codeBorder}`,
              borderRadius: 6,
              padding: '12px 16px',
              paddingRight: 80,
              margin: '8px 0',
              overflowX: 'auto',
              fontSize: '0.82rem',
              lineHeight: 1.5,
              color: codeColor,
              fontFamily: 'monospace',
            }}
          >
            <code>{code}</code>
          </pre>
        </div>
      );
    }
    if (!part.trim()) return null;
    return <span key={i}>{part}</span>;
  });
}

export default function SkillDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const basePath = useRouteRef(rootRouteRef)();
  const api = useApi(skillMarketplaceApiRef);
  const muiTheme = useTheme();
  const isDark = muiTheme.palette.type === 'dark';
  const textColor = isDark ? '#e0e0e0' : '#151515';
  const textSecondary = isDark ? '#a3a3a3' : '#6a6e73';
  const cardStyle = useMemo(
    (): React.CSSProperties =>
      ({
        backgroundColor: isDark ? '#252525' : '#ffffff',
        color: textColor,
        boxShadow: isDark
          ? '0 1px 3px rgba(0,0,0,0.4)'
          : '0 1px 3px rgba(0,0,0,0.06)',
        '--pf-v6-c-card__title-text--Color': textColor,
        '--pf-v6-c-card__body--Color': textColor,
        '--pf-v6-c-card__footer--Color': textSecondary,
        '--pf-v6-c-content--Color': textColor,
        '--pf-v6-c-content--small--Color': textSecondary,
        '--pf-v5-c-card__title-text--Color': textColor,
        '--pf-v5-c-card__body--Color': textColor,
        '--pf-v5-c-content--Color': textColor,
        '--pf-t--global--text--color--regular': textColor,
        '--pf-t--global--text--color--subtle': textSecondary,
      }) as React.CSSProperties,
    [isDark, textColor, textSecondary],
  );
  const [skill, setSkill] = useState<SkillData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState(0);

  useEffect(() => {
    if (!slug) {
      return undefined;
    }
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
    return () => {
      cancelled = true;
    };
  }, [api, slug]);

  if (loading) return <LoadingSpinner message="Loading skill details..." />;
  if (error) return <ErrorMessage message={error} />;
  if (!skill) return <ErrorMessage message="Skill not found" />;

  const complexity = getComplexity(skill.rawContent.split('\n').length);
  const title =
    skill.sections.title || skill.name.split(':').pop() || skill.name;

  const complexityColor: Record<string, 'blue' | 'green' | 'orange' | 'red'> = {
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
                  backgroundColor:
                    skill.plugin.color || 'var(--sm-surface-secondary)',
                  color: skill.plugin.color
                    ? 'var(--sm-text-on-brand)'
                    : 'var(--sm-text-primary)',
                  borderColor: 'transparent',
                }}
              >
                {skill.pluginName}
              </Label>
              {skill.lifecycleState && (
                <Label
                  color={
                    skill.lifecycleState === 'published'
                      ? 'green'
                      : skill.lifecycleState === 'testing'
                        ? 'blue'
                        : skill.lifecycleState === 'deprecated'
                          ? 'orange'
                          : skill.lifecycleState === 'archived'
                            ? 'grey'
                            : 'yellow'
                  }
                >
                  {skill.lifecycleState.charAt(0).toUpperCase() +
                    skill.lifecycleState.slice(1)}
                </Label>
              )}
              <Label color={complexityColor[complexity] ?? 'blue'}>
                {complexity}
              </Label>
              {skill.version && <Label color="grey">v{skill.version}</Label>}
              {(skill.model || skill.compatibility) && (
                <Label color="purple" icon={<CodeIcon />}>
                  {skill.compatibility || skill.model}
                </Label>
              )}
              {skill.sections.workflow.length > 0 && (
                <Label color="blue" icon={<ListIcon />}>
                  {skill.sections.workflow.length} steps
                </Label>
              )}
              {skill.authors && <Label color="grey">{skill.authors}</Label>}
            </LabelGroup>
            {skill.tags && skill.tags.length > 0 && (
              <LabelGroup style={{ marginTop: 8 }}>
                {skill.tags.map(t => (
                  <Label key={t} color="blue" variant="outline">
                    {t}
                  </Label>
                ))}
              </LabelGroup>
            )}
            <div style={{ marginTop: 12 }}>
              <AddToBundleButton
                skill={{
                  name: skill.skillName,
                  slug: skill.slug,
                  category: skill.pluginName,
                  description: skill.description,
                }}
                variant="full"
              />
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
                <TabTitleIcon>
                  <InfoCircleIcon />
                </TabTitleIcon>
                <TabTitleText>Overview</TabTitleText>
              </>
            }
          >
            <div style={{ marginTop: 16 }}>
              <Grid hasGutter>
                <GridItem md={8}>
                  <Card isCompact style={{ marginBottom: 16, ...cardStyle }}>
                    <CardTitle>About this Skill</CardTitle>
                    <CardBody>
                      <Content
                        component={ContentVariants.p}
                        style={{ lineHeight: 1.7 }}
                      >
                        {skill.description}
                      </Content>
                    </CardBody>
                  </Card>

                  {skill.sections.whenToUse && (
                    <Card isCompact style={{ marginBottom: 16, ...cardStyle }}>
                      <CardTitle>
                        <span
                          className="sm-section-title"
                          style={{ margin: 0 }}
                        >
                          <InfoCircleIcon color="var(--sm-brand)" />
                          When to Use
                        </span>
                      </CardTitle>
                      <CardBody>
                        <Content
                          component={ContentVariants.p}
                          style={{ lineHeight: 1.7, whiteSpace: 'pre-line' }}
                        >
                          {skill.sections.whenToUse}
                        </Content>
                      </CardBody>
                    </Card>
                  )}

                  {skill.sections.prerequisites &&
                    skill.sections.prerequisites.length > 0 && (
                      <Card
                        isCompact
                        style={{ marginBottom: 16, ...cardStyle }}
                      >
                        <CardTitle>
                          <span
                            className="sm-section-title"
                            style={{ margin: 0 }}
                          >
                            <ExclamationTriangleIcon color="var(--sm-warning)" />
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
                      <Card
                        isCompact
                        style={{ marginBottom: 16, ...cardStyle }}
                      >
                        <CardTitle>
                          <span
                            className="sm-section-title"
                            style={{ margin: 0 }}
                          >
                            <ExclamationTriangleIcon color="var(--sm-danger)" />
                            Rules
                          </span>
                        </CardTitle>
                        <CardBody>
                          {skill.sections.criticalRules.map((r, i) => (
                            <div
                              key={i}
                              style={{
                                padding: '8px 12px',
                                marginBottom: 8,
                                borderLeft: '3px solid var(--sm-danger)',
                                backgroundColor: 'var(--sm-surface-secondary)',
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
                    <Card isCompact style={{ marginBottom: 16, ...cardStyle }}>
                      <CardTitle>
                        <span
                          className="sm-section-title"
                          style={{ margin: 0 }}
                        >
                          <ListIcon />
                          Workflow ({skill.sections.workflow.length} steps)
                        </span>
                      </CardTitle>
                      <CardBody>
                        {skill.sections.workflow.map((step, idx) => (
                          <div key={step.step} className="sm-workflow-step">
                            <div className="sm-workflow-step-number">
                              {step.step}
                            </div>
                            {idx < skill.sections.workflow.length - 1 && (
                              <div className="sm-workflow-step-line" />
                            )}
                            <Title
                              headingLevel="h4"
                              size="md"
                              style={{ marginBottom: 4 }}
                            >
                              {step.title}
                            </Title>
                            <div
                              style={{
                                color: isDark ? '#a3a3a3' : '#6a6e73',
                                lineHeight: 1.6,
                                fontSize: '0.9rem',
                              }}
                            >
                              {renderContentWithCode(step.content, isDark)}
                            </div>
                          </div>
                        ))}
                      </CardBody>
                    </Card>
                  )}
                </GridItem>

                <GridItem md={4}>
                  <Card isCompact style={{ marginBottom: 16, ...cardStyle }}>
                    <CardTitle>Details</CardTitle>
                    <CardBody>
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 12,
                        }}
                      >
                        <div>
                          <Content
                            component={ContentVariants.small}
                            style={{ color: 'var(--sm-text-secondary)' }}
                          >
                            Category
                          </Content>
                          <Label
                            style={{
                              backgroundColor:
                                skill.plugin.color ||
                                'var(--sm-surface-secondary)',
                              color: skill.plugin.color
                                ? 'var(--sm-text-on-brand)'
                                : 'var(--sm-text-primary)',
                              borderColor: 'transparent',
                              marginTop: 4,
                            }}
                          >
                            {skill.pluginName}
                          </Label>
                        </div>
                        <Divider />
                        <div>
                          <Content
                            component={ContentVariants.small}
                            style={{ color: 'var(--sm-text-secondary)' }}
                          >
                            Complexity
                          </Content>
                          <div style={{ marginTop: 4 }}>
                            <Label
                              color={complexityColor[complexity] ?? 'blue'}
                            >
                              {complexity}
                            </Label>
                          </div>
                        </div>
                        {skill.model && (
                          <>
                            <Divider />
                            <div>
                              <Content
                                component={ContentVariants.small}
                                style={{ color: 'var(--sm-text-secondary)' }}
                              >
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
                              <Content
                                component={ContentVariants.small}
                                style={{ color: 'var(--sm-text-secondary)' }}
                              >
                                Version
                              </Content>
                              <div style={{ marginTop: 4 }}>
                                v{skill.version}
                              </div>
                            </div>
                          </>
                        )}
                        {skill.compatibility && (
                          <>
                            <Divider />
                            <div>
                              <Content
                                component={ContentVariants.small}
                                style={{ color: 'var(--sm-text-secondary)' }}
                              >
                                Compatibility
                              </Content>
                              <div style={{ marginTop: 4 }}>
                                <Label color="purple" icon={<CodeIcon />}>
                                  {skill.compatibility}
                                </Label>
                              </div>
                            </div>
                          </>
                        )}
                        {typeof skill.wordCount === 'number' &&
                          skill.wordCount > 0 && (
                            <>
                              <Divider />
                              <div>
                                <Content
                                  component={ContentVariants.small}
                                  style={{ color: 'var(--sm-text-secondary)' }}
                                >
                                  Word Count
                                </Content>
                                <div style={{ marginTop: 4 }}>
                                  {skill.wordCount.toLocaleString()} words
                                </div>
                              </div>
                            </>
                          )}
                        <Divider />
                        <div>
                          <Content
                            component={ContentVariants.small}
                            style={{ color: 'var(--sm-text-secondary)' }}
                          >
                            Source Path
                          </Content>
                          <div
                            style={{
                              marginTop: 4,
                              fontFamily:
                                'var(--pf-t--global--font--family--mono)',
                              fontSize: '0.8rem',
                            }}
                          >
                            {skill.gitPath}
                          </div>
                        </div>
                      </div>
                    </CardBody>
                  </Card>

                  {skill.sections.relatedSkills.length > 0 && (
                    <Card isCompact style={cardStyle}>
                      <CardTitle>
                        <span
                          className="sm-section-title"
                          style={{ margin: 0 }}
                        >
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
                <TabTitleIcon>
                  <CodeIcon />
                </TabTitleIcon>
                <TabTitleText>Raw Content</TabTitleText>
              </>
            }
          >
            <Card style={{ marginTop: 16, ...cardStyle }}>
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
                  <TabTitleIcon>
                    <FolderOpenIcon />
                  </TabTitleIcon>
                  <TabTitleText>
                    Assets (
                    {skill.assets.references.length +
                      skill.assets.templates.length +
                      skill.assets.examples.length}
                    )
                  </TabTitleText>
                </>
              }
            >
              <div style={{ marginTop: 16 }}>
                {skill.assets.references.length > 0 && (
                  <Card isCompact style={{ marginBottom: 16, ...cardStyle }}>
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
                  <Card isCompact style={{ marginBottom: 16, ...cardStyle }}>
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
                  <Card isCompact style={cardStyle}>
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
                <TabTitleIcon>
                  <RocketIcon />
                </TabTitleIcon>
                <TabTitleText>Test with Agent</TabTitleText>
              </>
            }
          >
            <Card style={{ marginTop: 16, ...cardStyle }}>
              <CardBody>
                <Title headingLevel="h3" size="lg" style={{ marginBottom: 12 }}>
                  Test this skill in the Skills Playground
                </Title>
                <Content
                  component={ContentVariants.p}
                  style={{
                    marginBottom: 16,
                    color: 'var(--sm-text-secondary)',
                  }}
                >
                  Open the Skills Playground with &ldquo;{humanize(skill.name)}
                  &rdquo; pre-selected. The live agent will load this skill and
                  you can test it interactively.
                </Content>
                <Button
                  variant="primary"
                  onClick={() =>
                    navigate(
                      `${basePath}/playground?skill=${encodeURIComponent(skill.skillName)}`,
                    )
                  }
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
