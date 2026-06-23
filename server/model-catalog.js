const MODEL_CATALOG = {
  openai: {
    label: 'OpenAI',
    docsUrl: 'https://platform.openai.com/docs/models',
    models: [
      { id: 'gpt-4.1', label: 'GPT-4.1', recommended: true },
      { id: 'gpt-4.1-mini', label: 'GPT-4.1 Mini' },
      { id: 'gpt-4o', label: 'GPT-4o' },
      { id: 'gpt-4o-mini', label: 'GPT-4o Mini' },
    ],
  },
  gemini: {
    label: 'Google Gemini',
    docsUrl: 'https://ai.google.dev/gemini-api/docs/models/gemini-v2',
    models: [
      { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', recommended: true },
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
      { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite' },
      { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
    ],
  },
  openrouter: {
    label: 'OpenRouter (All Models)',
    docsUrl: 'https://openrouter.ai/models',
    supportsCustomModel: true,
    models: [
      { id: 'openai/gpt-4.1', label: 'OpenAI GPT-4.1', recommended: true },
      { id: 'openai/gpt-4.1-mini', label: 'OpenAI GPT-4.1 Mini' },
      { id: 'google/gemini-2.5-pro', label: 'Google Gemini 2.5 Pro' },
      { id: 'google/gemini-2.5-flash', label: 'Google Gemini 2.5 Flash' },
      { id: 'anthropic/claude-sonnet-4.5', label: 'Anthropic Claude Sonnet 4.5' },
      { id: 'anthropic/claude-haiku-4.5', label: 'Anthropic Claude Haiku 4.5' },
      { id: 'x-ai/grok-4.3', label: 'xAI Grok 4.3' },
      { id: 'deepseek/deepseek-v4-flash', label: 'DeepSeek V4 Flash' },
      { id: 'mistralai/mistral-medium-3.5', label: 'Mistral Medium 3.5' },
      { id: 'meta-llama/llama-3.3-70b-instruct', label: 'Meta Llama 3.3 70B' },
    ],
  },
  anthropic: {
    label: 'Anthropic Claude',
    docsUrl: 'https://platform.claude.com/docs/en/about-claude/models/overview',
    supportsCustomModel: true,
    models: [
      { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5', recommended: true },
      { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
      { id: 'claude-opus-4-1', label: 'Claude Opus 4.1' },
    ],
  },
  xai: {
    label: 'xAI Grok',
    docsUrl: 'https://docs.x.ai/docs/models',
    supportsCustomModel: true,
    models: [
      { id: 'grok-4.3', label: 'Grok 4.3', recommended: true },
      { id: 'grok-build-0.1', label: 'Grok Build 0.1' },
    ],
  },
  deepseek: {
    label: 'DeepSeek',
    docsUrl: 'https://api-docs.deepseek.com/quick_start/pricing',
    supportsCustomModel: true,
    models: [
      { id: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash', recommended: true },
      { id: 'deepseek-chat', label: 'DeepSeek Chat' },
      { id: 'deepseek-reasoner', label: 'DeepSeek Reasoner' },
    ],
  },
  mistral: {
    label: 'Mistral AI',
    docsUrl: 'https://docs.mistral.ai/models/overview',
    supportsCustomModel: true,
    models: [
      { id: 'mistral-medium-3.5', label: 'Mistral Medium 3.5', recommended: true },
      { id: 'mistral-small-4', label: 'Mistral Small 4' },
      { id: 'mistral-large-3', label: 'Mistral Large 3' },
      { id: 'codestral-latest', label: 'Codestral' },
    ],
  },
  groq: {
    label: 'Groq',
    docsUrl: 'https://console.groq.com/docs/models',
    supportsCustomModel: true,
    models: [
      { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B Versatile', recommended: true },
      { id: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B Instant' },
      { id: 'openai/gpt-oss-120b', label: 'GPT OSS 120B' },
      { id: 'openai/gpt-oss-20b', label: 'GPT OSS 20B' },
    ],
  },
  perplexity: {
    label: 'Perplexity Sonar',
    docsUrl: 'https://docs.perplexity.ai/docs/sonar/models',
    supportsCustomModel: true,
    models: [
      { id: 'sonar-pro', label: 'Sonar Pro', recommended: true },
      { id: 'sonar', label: 'Sonar' },
      { id: 'sonar-reasoning-pro', label: 'Sonar Reasoning Pro' },
      { id: 'sonar-deep-research', label: 'Sonar Deep Research' },
    ],
  },
};

function getModelCatalog() {
  return MODEL_CATALOG;
}

function getDefaultModel(provider) {
  const catalog = MODEL_CATALOG[provider];
  return catalog?.models.find((model) => model.recommended)?.id || catalog?.models[0]?.id || '';
}

module.exports = {
  getDefaultModel,
  getModelCatalog,
};
