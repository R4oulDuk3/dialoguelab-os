import { useState } from "react";
import { Check, Eye, EyeOff, KeyRound, LockKeyhole, ShieldCheck } from "lucide-react";
import type { ProviderId, ProviderStatus } from "../shared/contracts";
import { ProviderLogo } from "./ProviderLogo";
import { dialogueApi } from "../lib/client-api";

interface Props {
  providers: ProviderStatus[];
  onboarding?: boolean;
  onChanged: (providers: ProviderStatus[]) => void;
  onDone: () => void;
}

export function ProviderSetup({ providers, onboarding = false, onChanged, onDone }: Props) {
  const [keys, setKeys] = useState<Partial<Record<ProviderId, string>>>({});
  const [visible, setVisible] = useState<Partial<Record<ProviderId, boolean>>>({});
  const [busy, setBusy] = useState<ProviderId>();
  const [error, setError] = useState<string>();

  async function connect(provider: ProviderId) {
    setError(undefined); setBusy(provider);
    try {
      onChanged(await dialogueApi.providers.configure(provider, keys[provider] || ""));
      setKeys((current) => ({ ...current, [provider]: "" }));
    } catch (cause) {
      setError(readError(cause));
    } finally { setBusy(undefined); }
  }

  async function disconnect(provider: ProviderId) {
    setError(undefined); setBusy(provider);
    try { onChanged(await dialogueApi.providers.disconnect(provider)); }
    catch (cause) { setError(readError(cause)); }
    finally { setBusy(undefined); }
  }

  const configured = providers.filter((provider) => provider.configured).length;
  return (
    <div className={onboarding ? "onboarding" : "settings-content"}>
      {onboarding && (
        <section className="onboarding-brand">
          <div className="brand-lockup light"><span className="brand-mark"><i /><i /><i /></span><span>Dialogue Lab</span></div>
          <div className="brand-message">
            <h1>Start with<br />a voice.</h1>
            <p>Connect one cloud voice provider to create your first dialogue.</p>
          </div>
          <div className="privacy-note"><ShieldCheck size={18} /><span>Keys stay on this device.</span></div>
        </section>
      )}
      <section className={onboarding ? "onboarding-form" : "provider-settings"}>
        <div className="setup-heading">
          <span className="setup-icon"><KeyRound size={21} /></span>
          <div>
            <h2>{onboarding ? "Get started with Dialogue Lab" : "Provider settings"}</h2>
            <p>{onboarding ? "Connect at least one provider. Dialogue Lab verifies the key before storing it locally." : "Connect the voice providers you want to use."}</p>
          </div>
        </div>
        <div className="provider-stack">
          {providers.map((provider) => (
            <article className={`provider-connect ${provider.configured ? "connected" : ""}`} key={provider.id}>
              <div className="provider-connect-head">
                <ProviderLogo provider={provider.id} />
                <div className="grow"><h3>{provider.name}</h3><p>{provider.description}</p></div>
                {provider.configured && <span className="connected-pill"><Check size={13} /> Connected</span>}
              </div>
              {provider.configured ? (
                <div className="connected-row"><span><LockKeyhole size={15} /> Key stored {provider.keyHint}</span><button className="text-button danger" onClick={() => void disconnect(provider.id)}>Disconnect</button></div>
              ) : (
                <div className="key-row">
                  <div className="key-input"><KeyRound size={16} /><input type={visible[provider.id] ? "text" : "password"} value={keys[provider.id] || ""} onChange={(e) => setKeys({ ...keys, [provider.id]: e.target.value })} placeholder={`Paste ${provider.name} API key`} onKeyDown={(e) => { if (e.key === "Enter") void connect(provider.id); }} /><button aria-label="Show API key" onClick={() => setVisible({ ...visible, [provider.id]: !visible[provider.id] })}>{visible[provider.id] ? <EyeOff size={16} /> : <Eye size={16} />}</button></div>
                  <button className="secondary-button" disabled={busy === provider.id || !keys[provider.id]} onClick={() => void connect(provider.id)}>{busy === provider.id ? "Verifying…" : "Connect"}</button>
                </div>
              )}
              <a className="provider-help" href={provider.docsUrl} target="_blank" rel="noreferrer">Where do I find my key?</a>
            </article>
          ))}
        </div>
        {error && <div className="form-error">{error}</div>}
        {providers.some((provider) => provider.security === "session-only") && <div className="security-warning">Secure OS encryption is unavailable. Keys will be kept only until the app closes.</div>}
        <div className="setup-footer">
          <div className="secure-copy"><LockKeyhole size={15} /><span>Provider keys are encrypted on this device</span></div>
          <button className="primary-button" disabled={!configured} onClick={onDone}>{onboarding ? `Continue to voice library${configured > 1 ? ` · ${configured} connected` : ""}` : "Done"}</button>
        </div>
      </section>
    </div>
  );
}

function readError(cause: unknown) {
  const message = cause instanceof Error ? cause.message : String(cause);
  return message.replace(/^Error invoking remote method '[^']+': Error: /, "");
}
