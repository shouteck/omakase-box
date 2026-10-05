export { buildAttemptDescriptor, DescriptorRejected, ADAPTER_HARNESS } from './descriptor.js';
export type { AttemptUnit, AttemptInterface, ChildJob, AdapterKind } from './descriptor.js';
export type AttemptDescriptor = ReturnType<typeof import('./descriptor.js').buildAttemptDescriptor>;
