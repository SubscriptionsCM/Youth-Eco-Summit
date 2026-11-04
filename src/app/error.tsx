'use client';
export default function ErrorPage({ reset }: { reset: () => void }) { return <div role="alert"><h1>Unable to load this page</h1><p>Please try again. Your saved records have not been changed.</p><button onClick={reset}>Try again</button></div>; }
