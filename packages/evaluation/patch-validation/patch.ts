/**
 * Canonical implementation lives in the external intake boundary
 * (`services/external-api/submissions/patch-validation.ts`) because the
 * dependency-boundary checker forbids external code from importing evaluation
 * sources. This module re-exports it for private-side consumers (import store,
 * future job orchestration) so there is exactly one validator.
 */
export * from '../../../services/external-api/submissions/patch-validation.js';
