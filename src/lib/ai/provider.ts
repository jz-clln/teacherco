//src/lib/ai/provider.ts - Jabez

export type AITextRequest = {
  system: string;
  prompt: string;
};

export type AITextResult = {
  text: string;
  provider: string;
  model: string;
};

export interface AIProvider {
  generateText(input: AITextRequest): Promise<AITextResult>;
}

// Do not import a vendor SDK throughout the app. Implement one adapter here later,
// then inject/use it from AI task modules.
export function getAIProvider(): AIProvider {
  throw new Error("AI provider is not configured yet.");
}
