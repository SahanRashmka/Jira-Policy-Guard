import { makeInvoke } from '@forge/bridge';
import { StrictMode, useCallback, useEffect, useState, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';

import type {
  CreatePolicyInput,
  ListPoliciesResult,
  PolicyResolverDefinitions,
  PolicyListItem,
} from '../../../src/application/policy-admin/contracts.js';
import './styles.css';

const invoke = makeInvoke<PolicyResolverDefinitions>();

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'An unexpected error occurred.';
}

function App() {
  const [policies, setPolicies] = useState<readonly PolicyListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [validationError, setValidationError] = useState<string>();

  const loadPolicies = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const result: ListPoliciesResult = await invoke('listPolicies', {});
      setPolicies(result.policies);
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPolicies();
  }, [loadPolicies]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    setValidationError(undefined);
    const data = new FormData(event.currentTarget);
    const form = event.currentTarget;
    const fieldDisplayName = String(data.get('fieldDisplayName') ?? '').trim();
    const input: CreatePolicyInput = {
      name: String(data.get('name') ?? '').trim(),
      fieldId: String(data.get('fieldId') ?? '').trim(),
      ...(fieldDisplayName.length === 0 ? {} : { fieldDisplayName }),
      failureMessage: String(data.get('failureMessage') ?? '').trim(),
      issueTypeIds: [],
      severity: 'ERROR',
    };
    if (!input.name || !input.fieldId || !input.failureMessage) {
      setValidationError('Name, field ID, and failure message are required.');
      return;
    }

    setSaving(true);
    try {
      const created: PolicyListItem = await invoke('createPolicy', input);
      setPolicies((current) => [...current, created]);
      form.reset();
    } catch (saveError) {
      setError(errorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <main>
      <header>
        <p className="eyebrow">Project settings</p>
        <h1>Jira Policy Guard</h1>
        <p>
          Create required-field policies for this project. Workflow enforcement is not enabled yet.
        </p>
      </header>

      {error && (
        <div className="message error" role="alert">
          {error} <button onClick={() => void loadPolicies()}>Retry</button>
        </div>
      )}

      <section aria-labelledby="create-heading">
        <h2 id="create-heading">Create a required-field policy</h2>
        <form onSubmit={(event) => void submit(event)} noValidate>
          <label>
            Policy name
            <input name="name" required maxLength={200} disabled={saving} />
          </label>
          <label>
            Jira field ID
            <input
              name="fieldId"
              required
              maxLength={255}
              placeholder="customfield_10000"
              disabled={saving}
            />
          </label>
          <label>
            Field display name <span>(optional)</span>
            <input name="fieldDisplayName" maxLength={255} disabled={saving} />
          </label>
          <label>
            Failure message
            <textarea name="failureMessage" required maxLength={500} disabled={saving} />
          </label>
          {validationError && (
            <p className="validation" role="alert">
              {validationError}
            </p>
          )}
          <button className="primary" type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Create policy'}
          </button>
        </form>
      </section>

      <section aria-labelledby="policies-heading" aria-busy={loading}>
        <h2 id="policies-heading">Project policies</h2>
        {loading ? (
          <p className="message">Loading policies…</p>
        ) : policies.length === 0 ? (
          <div className="empty">
            <h3>No policies yet</h3>
            <p>Create the first required-field policy above.</p>
          </div>
        ) : (
          <ul className="policies">
            {policies.map((policy) => (
              <li key={policy.id}>
                <div>
                  <strong>{policy.name}</strong>
                  <span>{policy.enabled ? 'Enabled' : 'Disabled'}</span>
                </div>
                <p>{policy.failureMessage}</p>
                <code>{policy.requirement.field.fieldId}</code>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

const root = document.getElementById('root');
if (root === null) throw new Error('Application root is missing.');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
