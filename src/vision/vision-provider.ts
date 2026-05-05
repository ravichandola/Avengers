import { logger } from '../utils/logger';

export interface VisionConfig {
  apiKey?: string;
  model?: string;
  baseURL?: string;
}

export interface VisionDetection {
  label: string;
  confidence: number;
  bounds: { x: number; y: number; width: number; height: number };
  type: string;
}

/**
 * VisionProvider uses OpenAI GPT-4o (or compatible) vision API to:
 * 1. Locate UI elements on screen when structured locators fail
 * 2. Understand screen context (what page/screen the app is on)
 * 3. Find clickable coordinates for a given element description
 *
 * Works as a universal fallback across all platforms (browser, desktop, mobile).
 */
export class VisionProvider {
  private client: any = null;
  private config: VisionConfig;
  private model: string;

  constructor(config?: VisionConfig) {
    this.config = config ?? {};
    this.model = config?.model ?? 'gpt-4o';
  }

  isAvailable(): boolean {
    return !!(this.config.apiKey || process.env.OPENAI_API_KEY);
  }

  private async getClient(): Promise<any> {
    if (!this.client) {
      const apiKey = this.config.apiKey ?? process.env.OPENAI_API_KEY;
      if (!apiKey) throw new Error('OPENAI_API_KEY required for vision features');

      const { default: OpenAI } = await import('openai');
      this.client = new OpenAI({ apiKey, baseURL: this.config.baseURL });
    }
    return this.client;
  }

  /**
   * Given a screenshot, find the element matching the selector/description.
   * Returns center coordinates for clicking.
   */
  async locateElement(screenshot: Buffer, selector: string): Promise<{ x: number; y: number } | null> {
    if (!this.isAvailable()) return null;

    try {
      const client = await this.getClient();
      const base64 = screenshot.toString('base64');

      const response = await client.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: `You are a UI element locator. Given a screenshot, find the CENTER coordinates (x, y in pixels) of the UI element described by the user. Return ONLY a JSON object: {"x": number, "y": number} or {"notFound": true} if the element doesn't exist on screen.`,
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: `Find the center coordinates of: "${selector}"` },
              { type: 'image_url', image_url: { url: `data:image/png;base64,${base64}`, detail: 'high' } },
            ],
          },
        ],
        max_tokens: 150,
        temperature: 0.1,
      });

      const content = response.choices[0]?.message?.content ?? '';
      const match = content.match(/\{[\s\S]*?\}/);
      if (!match) return null;

      const result = JSON.parse(match[0]);
      if (result.notFound) return null;
      if (result.x != null && result.y != null) {
        logger.info('Vision', `Located "${selector}" at (${result.x}, ${result.y})`);
        return { x: Math.round(result.x), y: Math.round(result.y) };
      }
      return null;
    } catch (err) {
      logger.error('Vision', `locateElement failed: ${err instanceof Error ? err.message : err}`);
      return null;
    }
  }

  /**
   * Detect all visible UI elements on screen with bounding boxes.
   */
  async detectElements(screenshot: Buffer, query: string): Promise<VisionDetection[]> {
    if (!this.isAvailable()) return [];

    try {
      const client = await this.getClient();
      const base64 = screenshot.toString('base64');

      const response = await client.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: `You detect UI elements in screenshots. Return a JSON array of elements matching the query:
[{"label": "text", "confidence": 0.0-1.0, "bounds": {"x": px, "y": px, "width": px, "height": px}, "type": "button|input|label|link|etc"}]
Be precise with bounding box coordinates.`,
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: `Find elements matching: "${query}"` },
              { type: 'image_url', image_url: { url: `data:image/png;base64,${base64}`, detail: 'high' } },
            ],
          },
        ],
        max_tokens: 1000,
        temperature: 0.1,
      });

      const content = response.choices[0]?.message?.content ?? '[]';
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (!jsonMatch) return [];

      const detections: VisionDetection[] = JSON.parse(jsonMatch[0]);
      logger.info('Vision', `Detected ${detections.length} elements for "${query}"`);
      return detections;
    } catch (err) {
      logger.error('Vision', `detectElements failed: ${err instanceof Error ? err.message : err}`);
      return [];
    }
  }

  /**
   * Describe the current screen state (for context/debugging).
   */
  async describeScreen(screenshot: Buffer): Promise<string> {
    if (!this.isAvailable()) return 'Vision not available';

    try {
      const client = await this.getClient();
      const base64 = screenshot.toString('base64');

      const response = await client.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Describe this application screenshot concisely: what app, what screen/page, and key visible UI elements.' },
              { type: 'image_url', image_url: { url: `data:image/png;base64,${base64}`, detail: 'low' } },
            ],
          },
        ],
        max_tokens: 300,
        temperature: 0.2,
      });

      return response.choices[0]?.message?.content ?? 'Unable to describe';
    } catch {
      return 'Vision analysis failed';
    }
  }

  /**
   * Check if an element is visible on screen using vision.
   */
  async isElementVisible(screenshot: Buffer, selector: string): Promise<boolean> {
    const coords = await this.locateElement(screenshot, selector);
    return coords !== null;
  }
}
