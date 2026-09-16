import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { installCanonicalSaveDouble } from '../game/store/canonicalSaveTestDouble';

// jsdom has no IndexedDB. Unit tests use the synchronous in-memory backend,
// which models the same compare-and-commit contract (see
// `src/game/store/canonicalSaveTestDouble.ts`); the real IndexedDB transaction is
// verified in a browser against the production build by `e2e/save-concurrency.spec.ts`.
// The backend itself is stateless — its record lives in `localStorage`, so the
// `localStorage.clear()` that tests already call keeps clearing the save.
installCanonicalSaveDouble();

// jsdom has no top layer; keyboard containment and restoration are tested in Chrome.
if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
}

afterEach(() => cleanup());
