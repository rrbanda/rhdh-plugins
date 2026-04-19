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

const welcomeStyles = `
.bld-welcome {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
  text-align: center;
  flex: 1;
}

.bld-welcome h2 {
  margin: 0 0 24px;
  font-size: 18px;
  font-weight: 500;
  color: var(--pf-t--global--text--color--subtle, #6a6e73);
}

.bld-suggestions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  max-width: 560px;
}

.bld-suggestion {
  padding: 8px 16px;
  border: 1px solid var(--pf-t--global--border--color--default, #d2d2d2);
  border-radius: 20px;
  background: var(--pf-t--global--background--color--primary--default, #fff);
  cursor: pointer;
  font-size: 13px;
  color: var(--pf-t--global--text--color--regular, #151515);
  transition: all 0.15s;
}
.bld-suggestion:hover {
  border-color: var(--pf-t--global--color--brand--default, #0066cc);
  background: var(--pf-t--global--color--brand--default, #0066cc)08;
}
.bld-suggestion:focus-visible {
  outline: 2px solid var(--pf-t--global--color--brand--default, #0066cc);
  outline-offset: 2px;
}
`;

const SUGGESTIONS = [
  'Create a skill that reviews code for security vulnerabilities',
  'Build a skill that summarizes PDF documents into key bullet points',
  'Create a URL summary skill that extracts and structures web page content',
];

interface WelcomeHeroProps {
  onSuggestionClick: (prompt: string) => void;
}

export function WelcomeHero({ onSuggestionClick }: WelcomeHeroProps) {
  return (
    <>
      <style>{welcomeStyles}</style>
      <div className="bld-welcome">
        <h2>What skill would you like to build?</h2>
        <div className="bld-suggestions">
          {SUGGESTIONS.map((prompt, i) => (
            <button
              key={i}
              className="bld-suggestion"
              onClick={() => onSuggestionClick(prompt)}
              type="button"
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
