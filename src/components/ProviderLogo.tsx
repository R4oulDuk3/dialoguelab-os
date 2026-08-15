import type { ProviderId } from "../shared/contracts";

export function ProviderLogo({ provider, size = 36 }: { provider: ProviderId; size?: number }) {
  const name = provider === "elevenlabs" ? "ElevenLabs" : provider === "minimax" ? "MiniMax" : "Fish Audio";
  return (
    <span className={`provider-logo ${provider}`} style={{ width: size, height: size }} aria-label={name}>
      <img src={`/provider-logos/${provider}.svg`} alt="" aria-hidden="true" />
    </span>
  );
}
