import type { Metadata } from 'next';

import { SiteToolsConformance } from '@/components/conformance/site-tools-conformance';

export const metadata: Metadata = {
  title: 'Site Tools Conformance | LeftOut Security',
  description:
    'A session-scoped test family for ChatGPT Site Tools registration, provenance, discovery, invocation, and documented support boundaries.',
};

export default function ConformancePage() {
  return <SiteToolsConformance />;
}
