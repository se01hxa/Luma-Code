export function isEnvFile(name: string): boolean;
export function secretSpans(name: string, content: string): { start: number; end: number; value: string }[];
export function maskDocument(name: string, content: string): { content: string; count: number };
export function redactKnown(text: string, values: Iterable<string>): string;
export const sensitiveName: RegExp;
