/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the PlantPal API Worker. Unset: the browser calls public providers directly (ADR-0003). */
  readonly VITE_API_BASE_URL?: string;
  /** `mock` serves labelled demo data without any network. */
  readonly VITE_PROVIDERS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
