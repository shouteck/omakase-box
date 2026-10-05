import type { ReleaseContentsReview } from '../../../services/private-api/releases/staging.js';

export function ReleaseContents(props: { review: Omit<ReleaseContentsReview, 'state' | 'approval'> }) {
  const { review } = props;
  return <section aria-label="Exact release contents review">
    <h2>Complete release set</h2>
    <p>Bounded staged content only. This view does not approve disclosure or establish package readiness.</p>
    <p>Manifest SHA-256: <code>{review.manifestHash}</code></p>
    <h3>Combined disclosure</h3>
    <p>Review the joined meaning of every work unit, interface and asset, not just individual fragments.</p>
    <pre>{JSON.stringify(review.combinedDisclosure, null, 2)}</pre>
    <h3>Public listing</h3><pre>{JSON.stringify(review.listing, null, 2)}</pre>
    <h3>External contract</h3><pre>{JSON.stringify(review.contract, null, 2)}</pre>
    <h3>Feedback policy</h3><pre>{JSON.stringify(review.feedbackPolicy, null, 2)}</pre>
    <h3>Payment obligation terms</h3><pre>{JSON.stringify(review.paymentTerms, null, 2)}</pre>
    <h3>Exact asset bytes</h3>
    {review.assets.map(asset => <article key={asset.path}>
      <h4>{asset.path}</h4>
      <p>{asset.mediaType}; {asset.byteSize} bytes; SHA-256 <code>{asset.sha256}</code></p>
      {asset.text !== null ? <pre>{asset.text}</pre> : <p>Binary image bytes (base64):</p>}
      <details><summary>Exact bytes in base64</summary><pre>{asset.contentBase64}</pre></details>
    </article>)}
    <h3>Canonical manifest</h3><pre>{JSON.stringify(review.manifest, null, 2)}</pre>
    <p>Approval binds these exact bytes and the complete manifest. Any change requires a new task version and owner review; readiness remains a separate gate.</p>
  </section>;
}
