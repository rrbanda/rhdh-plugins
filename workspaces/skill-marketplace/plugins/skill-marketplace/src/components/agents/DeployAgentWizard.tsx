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
import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi } from '@backstage/core-plugin-api';
import { skillMarketplaceApiRef } from '../../api';

const KNOWN_LLM_ENDPOINTS = [
  {
    label: 'LlamaStack (OpenShift)',
    provider: 'openai',
    baseUrl: 'https://llamastack.your-cluster.example.com/v1',
    model: 'gemini/models/gemini-2.5-flash',
    needsKey: false,
  },
  {
    label: 'OpenAI',
    provider: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o',
    needsKey: true,
  },
  {
    label: 'Custom endpoint',
    provider: 'openai',
    baseUrl: '',
    model: '',
    needsKey: false,
  },
];

type WizardStep = 1 | 2 | 3 | 4;

export default function DeployAgentWizard() {
  const navigate = useNavigate();
  const api = useApi(skillMarketplaceApiRef);
  const [step, setStep] = useState<WizardStep>(1);
  const [deploying, setDeploying] = useState(false);
  const [deployError, setDeployError] = useState<string | null>(null);

  const [agentName, setAgentName] = useState('');
  const [namespace, setNamespace] = useState('team1');
  const [description, setDescription] = useState('');
  const [image, setImage] = useState('ghcr.io/redhat-et/docsclaw:602ac9a');
  const [llmPreset, setLlmPreset] = useState(0);
  const [llmProvider, setLlmProvider] = useState(KNOWN_LLM_ENDPOINTS[0].provider);
  const [llmModel, setLlmModel] = useState(KNOWN_LLM_ENDPOINTS[0].model);
  const [llmBaseUrl, setLlmBaseUrl] = useState(KNOWN_LLM_ENDPOINTS[0].baseUrl);
  const [llmApiKey, setLlmApiKey] = useState('');

  const handlePresetChange = useCallback((idx: number) => {
    setLlmPreset(idx);
    const preset = KNOWN_LLM_ENDPOINTS[idx];
    setLlmProvider(preset.provider);
    setLlmModel(preset.model);
    setLlmBaseUrl(preset.baseUrl);
    if (!preset.needsKey) setLlmApiKey('');
  }, []);

  const handleDeploy = useCallback(async () => {
    setDeploying(true);
    setDeployError(null);
    try {
      await api.deployAgent({
        name: agentName,
        namespace,
        description,
        image,
        llm: {
          provider: llmProvider,
          model: llmModel,
          baseUrl: llmBaseUrl,
          apiKey: llmApiKey || undefined,
        },
      });
      navigate(`/skill-marketplace/agents/${namespace}/${agentName}`);
    } catch (err) {
      setDeployError(err instanceof Error ? err.message : 'Deployment failed');
      setDeploying(false);
    }
  }, [api, agentName, namespace, description, image, llmProvider, llmModel, llmBaseUrl, llmApiKey, navigate]);

  const canNext = () => {
    if (step === 1) return agentName.trim().length > 0;
    if (step === 2) return image.trim().length > 0;
    if (step === 3) return llmBaseUrl.trim().length > 0 && llmModel.trim().length > 0;
    return true;
  };

  return (
    <div className="dw-page">
      <style>{wizardStyles}</style>

      <div className="dw-back-row">
        <button className="dw-back-btn" onClick={() => navigate('/skill-marketplace/agents')}>
          &larr; Back to Agents
        </button>
      </div>

      <h1 className="dw-title">Deploy DocsClaw Agent</h1>

      <div className="dw-steps">
        {[1, 2, 3, 4].map(s => (
          <div key={s} className={`dw-step-indicator ${step >= s ? 'active' : ''} ${step === s ? 'current' : ''}`}>
            <span className="dw-step-num">{s}</span>
            <span className="dw-step-label">
              {s === 1 && 'Identity'}
              {s === 2 && 'Image'}
              {s === 3 && 'LLM Config'}
              {s === 4 && 'Review'}
            </span>
          </div>
        ))}
      </div>

      <div className="dw-body">
        {step === 1 && (
          <div className="dw-form">
            <div className="dw-field">
              <label className="dw-label">Agent Name *</label>
              <input className="dw-input" value={agentName} onChange={e => setAgentName(e.target.value)} placeholder="my-research-agent" />
            </div>
            <div className="dw-field">
              <label className="dw-label">Namespace</label>
              <input className="dw-input" value={namespace} onChange={e => setNamespace(e.target.value)} />
            </div>
            <div className="dw-field">
              <label className="dw-label">Description</label>
              <textarea className="dw-textarea" value={description} onChange={e => setDescription(e.target.value)} placeholder="What does this agent do?" rows={3} />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="dw-form">
            <div className="dw-field">
              <label className="dw-label">Container Image *</label>
              <input className="dw-input" value={image} onChange={e => setImage(e.target.value)} placeholder="ghcr.io/redhat-et/docsclaw:latest" />
              <span className="dw-hint">The DocsClaw container image to deploy</span>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="dw-form">
            <div className="dw-field">
              <label className="dw-label">LLM Endpoint Preset</label>
              <div className="dw-presets">
                {KNOWN_LLM_ENDPOINTS.map((p, i) => (
                  <button
                    key={i}
                    className={`dw-preset ${llmPreset === i ? 'active' : ''}`}
                    onClick={() => handlePresetChange(i)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="dw-field">
              <label className="dw-label">Provider</label>
              <input className="dw-input" value={llmProvider} onChange={e => setLlmProvider(e.target.value)} />
            </div>
            <div className="dw-field">
              <label className="dw-label">Model *</label>
              <input className="dw-input" value={llmModel} onChange={e => setLlmModel(e.target.value)} placeholder="gpt-4o" />
            </div>
            <div className="dw-field">
              <label className="dw-label">Base URL *</label>
              <input className="dw-input" value={llmBaseUrl} onChange={e => setLlmBaseUrl(e.target.value)} placeholder="https://api.example.com/v1" />
            </div>
            {KNOWN_LLM_ENDPOINTS[llmPreset]?.needsKey && (
              <div className="dw-field">
                <label className="dw-label">API Key</label>
                <input className="dw-input" type="password" value={llmApiKey} onChange={e => setLlmApiKey(e.target.value)} placeholder="sk-..." />
              </div>
            )}
          </div>
        )}

        {step === 4 && (
          <div className="dw-review">
            <h3>Review Deployment</h3>
            <div className="dw-review-grid">
              <div className="dw-review-item">
                <span className="dw-review-label">Agent Name</span>
                <span className="dw-review-value">{agentName}</span>
              </div>
              <div className="dw-review-item">
                <span className="dw-review-label">Namespace</span>
                <span className="dw-review-value">{namespace}</span>
              </div>
              <div className="dw-review-item">
                <span className="dw-review-label">Image</span>
                <code className="dw-review-value">{image}</code>
              </div>
              <div className="dw-review-item">
                <span className="dw-review-label">LLM</span>
                <span className="dw-review-value">{llmProvider} / {llmModel}</span>
              </div>
              <div className="dw-review-item">
                <span className="dw-review-label">Base URL</span>
                <code className="dw-review-value">{llmBaseUrl}</code>
              </div>
              {description && (
                <div className="dw-review-item">
                  <span className="dw-review-label">Description</span>
                  <span className="dw-review-value">{description}</span>
                </div>
              )}
            </div>
            {deployError && (
              <div className="dw-error">{deployError}</div>
            )}
          </div>
        )}
      </div>

      <div className="dw-footer">
        {step > 1 && (
          <button className="dw-btn dw-btn-secondary" onClick={() => setStep((step - 1) as WizardStep)} disabled={deploying}>
            Back
          </button>
        )}
        <div style={{ flex: 1 }} />
        {step < 4 ? (
          <button className="dw-btn dw-btn-primary" onClick={() => setStep((step + 1) as WizardStep)} disabled={!canNext()}>
            Next
          </button>
        ) : (
          <button className="dw-btn dw-btn-primary" onClick={handleDeploy} disabled={deploying}>
            {deploying ? 'Deploying...' : 'Deploy Agent'}
          </button>
        )}
      </div>
    </div>
  );
}

const wizardStyles = `
  .dw-page { padding: 24px 32px 40px; max-width: 800px; }
  .dw-back-row { margin-bottom: 16px; }
  .dw-back-btn { background: none; border: none; color: var(--pf-t--global--color--brand--default, #0066cc); font-size: 14px; cursor: pointer; padding: 0; font-weight: 500; }
  .dw-title { font-size: 24px; font-weight: 700; margin: 0 0 24px; }

  .dw-steps { display: flex; gap: 8px; margin-bottom: 32px; }
  .dw-step-indicator {
    display: flex; align-items: center; gap: 8px; padding: 8px 16px; border-radius: 8px;
    background: var(--pf-t--global--background--color--secondary--default, #f0f0f0);
    color: var(--pf-t--global--text--color--subtle, #6a6e73); font-size: 13px; flex: 1;
  }
  .dw-step-indicator.active { background: #0066cc15; color: var(--pf-t--global--color--brand--default, #0066cc); }
  .dw-step-indicator.current { background: var(--pf-t--global--color--brand--default, #0066cc); color: #fff; }
  .dw-step-num { width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 12px; background: rgba(0,0,0,0.1); }
  .dw-step-indicator.current .dw-step-num { background: rgba(255,255,255,0.25); }
  .dw-step-label { font-weight: 500; }

  .dw-body { min-height: 300px; }
  .dw-form { display: flex; flex-direction: column; gap: 20px; }
  .dw-field { display: flex; flex-direction: column; gap: 6px; }
  .dw-label { font-size: 13px; font-weight: 600; color: var(--pf-t--global--text--color--regular, #151515); }
  .dw-input, .dw-textarea {
    padding: 10px 14px; border-radius: 8px;
    border: 1px solid var(--pf-t--global--border--color--default, #d2d2d2);
    font-size: 14px; outline: none; font-family: inherit;
  }
  .dw-input:focus, .dw-textarea:focus { border-color: var(--pf-t--global--color--brand--default, #0066cc); }
  .dw-hint { font-size: 12px; color: var(--pf-t--global--text--color--subtle, #6a6e73); }

  .dw-presets { display: flex; flex-wrap: wrap; gap: 8px; }
  .dw-preset {
    padding: 8px 16px; border-radius: 8px;
    border: 1px solid var(--pf-t--global--border--color--default, #d2d2d2);
    background: #fff; font-size: 13px; cursor: pointer; transition: all 0.15s;
  }
  .dw-preset.active {
    background: var(--pf-t--global--color--brand--default, #0066cc);
    color: #fff; border-color: var(--pf-t--global--color--brand--default, #0066cc);
  }

  .dw-review h3 { font-size: 18px; font-weight: 600; margin: 0 0 16px; }
  .dw-review-grid { display: flex; flex-direction: column; gap: 12px; }
  .dw-review-item { display: flex; gap: 16px; padding: 12px 16px; border-radius: 8px; background: var(--pf-t--global--background--color--secondary--default, #f5f5f5); }
  .dw-review-label { flex: 0 0 120px; font-size: 13px; font-weight: 600; color: var(--pf-t--global--text--color--subtle, #6a6e73); }
  .dw-review-value { font-size: 14px; word-break: break-all; }
  .dw-error { margin-top: 16px; padding: 12px 16px; border-radius: 8px; background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; font-size: 14px; }

  .dw-footer { display: flex; gap: 12px; margin-top: 32px; padding-top: 20px; border-top: 1px solid var(--pf-t--global--border--color--default, #d2d2d2); }
  .dw-btn {
    padding: 10px 24px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.15s;
  }
  .dw-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .dw-btn-primary { background: var(--pf-t--global--color--brand--default, #0066cc); color: #fff; border: none; }
  .dw-btn-primary:hover:not(:disabled) { background: var(--pf-t--global--color--brand--hover, #004080); }
  .dw-btn-secondary { background: #fff; color: var(--pf-t--global--text--color--regular, #151515); border: 1px solid var(--pf-t--global--border--color--default, #d2d2d2); }
  .dw-btn-secondary:hover:not(:disabled) { background: var(--pf-t--global--background--color--secondary--default, #f5f5f5); }
`;
