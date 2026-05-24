/**
 * Mock LLM provider for unit tests.
 *
 * Returns configurable canned responses.  When no response is configured for a
 * method, it returns a generic placeholder so tests don't need to configure
 * everything up front.
 */

import type {
  LLMProvider,
  GenerateTextRequest,
  GenerateTextResponse,
  ChatCompletionRequest,
  ChatCompletionResponse,
  GenerateEmbeddingRequest,
  GenerateEmbeddingResponse,
} from '../types.js';
import { LLMProviderError } from '../types.js';
import { EMBEDDING_DIMENSION } from './utils.js';

export interface MockProviderConfig {
  name?: string;
  /** If set, all calls throw this error (simulates provider outage). */
  alwaysThrow?: LLMProviderError | Error;
  generateTextResponse?: Partial<GenerateTextResponse>;
  chatCompletionResponse?: Partial<ChatCompletionResponse>;
  generateEmbeddingResponse?: Partial<GenerateEmbeddingResponse>;
}

// ---------------------------------------------------------------------------
// Canned structured responses for local dev.
//
// The real analysis services prompt the LLM for JSON (or prose) in specific
// shapes. So the LLM-backed modules (Market, Campaign, Content) produce
// realistic output locally without a real provider, the mock detects intent
// from the (distinctive) system prompt and returns matching content. Anything
// unrecognised falls back to the generic placeholder — preserving existing
// test behaviour.
// ---------------------------------------------------------------------------

const MARKET_TRENDS_JSON = JSON.stringify({
  trends: [
    { topic: 'AI-Driven Sales Automation', frequency: 8, recency_score: 90, sentiment: 'positive', example_evidence: 'Enterprise buyers are rapidly adopting AI-powered sales tools to reduce manual research time.' },
    { topic: 'Competitive Intelligence Demand', frequency: 6, recency_score: 80, sentiment: 'positive', example_evidence: 'Revenue teams cite real-time battlecard access as a top purchase driver.' },
    { topic: 'Budget Scrutiny on SaaS', frequency: 4, recency_score: 70, sentiment: 'negative', example_evidence: 'CFOs are demanding tighter ROI justification for new SaaS investments.' },
    { topic: 'Consolidation of GTM Tooling', frequency: 3, recency_score: 65, sentiment: 'neutral', example_evidence: 'Buyers prefer unified platforms over point solutions to cut vendor sprawl.' },
  ],
});

const CAMPAIGN_BRIEF_JSON = JSON.stringify({
  target_audience: {
    personas: ['VP of Sales', 'Revenue Operations'],
    pain_points: ['Manual competitive research', 'Slow deal velocity'],
    buying_triggers: ['Board pressure on pipeline', 'Missed quota last quarter'],
  },
  channel_recommendations: [
    { channel: 'email', rationale: 'Direct nurture for VP-level buyers with long cycles', content_types: ['nurture sequence', 'case studies'] },
    { channel: 'linkedin', rationale: 'High concentration of target personas', content_types: ['thought leadership', 'sponsored posts'] },
  ],
  content_plan: [
    { week: 1, theme: 'Awareness — GTM Challenges', content_items: ['Blog: Top 5 GTM Challenges', 'LinkedIn: Pipeline insights'] },
    { week: 2, theme: 'Consideration — Competitive Intelligence', content_items: ['Webinar: Battlecards in practice', 'Email: ROI overview'] },
  ],
  timeline: '90 days',
});

const CAMPAIGN_ASSETS_JSON = JSON.stringify({
  email_sequence: [
    { sequence_number: 1, subject: 'Introducing BOBA: AI-Powered GTM Intelligence', preview_text: 'Discover how top teams close faster.', body: 'Hi {{first_name}}, your team spends too much time on manual research. BOBA changes that.', cta: 'Schedule a Demo', send_timing: 'Day 1' },
    { sequence_number: 2, subject: 'How Acme tripled pipeline', preview_text: 'A real customer story.', body: 'See how Acme closed 3 enterprise deals in a quarter with BOBA.', cta: 'Read the Case Study', send_timing: 'Day 7' },
    { sequence_number: 3, subject: 'See BOBA on your own data', preview_text: 'Book a personalized demo.', body: 'Let us show you BOBA running on your GTM documents.', cta: 'Book Demo', send_timing: 'Day 14' },
  ],
  ad_copy: [
    { channel: 'google_ads', headline: 'Accelerate Your GTM Strategy', body: 'AI-powered competitive intelligence for revenue teams.', cta: 'Start Free Trial' },
    { channel: 'linkedin', headline: 'Win More Competitive Deals', body: 'Real-time battlecards and persona intelligence from your own Drive.', cta: 'Learn More' },
  ],
});

const CONTENT_PROSE =
  'Leverage our comprehensive enterprise solution to optimize your strategic outcomes. ' +
  'Our robust platform facilitates seamless implementation and delivers measurable ROI. ' +
  'Stakeholders benefit from a holistic ecosystem of integrations and dedicated support, ' +
  'helping teams increase pipeline, respond to competitive pressure, and accelerate marketing ROI.';

/**
 * Inspect the chat messages and return a canned response for known analysis
 * prompts, or undefined to fall through to the generic placeholder.
 */
function cannedChatResponse(text: string): string | undefined {
  const t = text.toLowerCase();
  if (t.includes('market intelligence analyst')) return MARKET_TRENDS_JSON;
  if (t.includes('marketing strategist')) return CAMPAIGN_BRIEF_JSON;
  if (t.includes('copywriter')) return CAMPAIGN_ASSETS_JSON;
  if (t.includes('content writer')) return CONTENT_PROSE;
  return undefined;
}

export class MockLLMProvider implements LLMProvider {
  readonly name: string;
  private readonly config: MockProviderConfig;

  constructor(config: MockProviderConfig = {}) {
    this.name = config.name ?? 'mock';
    this.config = config;
  }

  async generateText(req: GenerateTextRequest): Promise<GenerateTextResponse> {
    if (this.config.alwaysThrow) throw this.config.alwaysThrow;
    return {
      text: `Mock response to: ${req.prompt.slice(0, 50)}`,
      model: 'mock-model',
      provider: this.name,
      tokensUsed: 10,
      fromCache: false,
      ...this.config.generateTextResponse,
    };
  }

  async chatCompletion(req: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    if (this.config.alwaysThrow) throw this.config.alwaysThrow;
    const lastMsg = req.messages[req.messages.length - 1];
    // Prompt-aware canned output for known analysis prompts; generic otherwise.
    const allText = req.messages.map((m) => m.content).join('\n');
    const content =
      cannedChatResponse(allText) ?? `Mock reply to: ${lastMsg?.content.slice(0, 50) ?? ''}`;
    return {
      message: { role: 'assistant', content },
      model: 'mock-model',
      provider: this.name,
      tokensUsed: 10,
      fromCache: false,
      ...this.config.chatCompletionResponse,
    };
  }

  async generateEmbedding(_req: GenerateEmbeddingRequest): Promise<GenerateEmbeddingResponse> {
    if (this.config.alwaysThrow) throw this.config.alwaysThrow;
    return {
      embedding: new Array<number>(EMBEDDING_DIMENSION).fill(0.01),
      model: 'mock-embedding-model',
      provider: this.name,
      tokensUsed: 5,
      fromCache: false,
      ...this.config.generateEmbeddingResponse,
    };
  }
}
