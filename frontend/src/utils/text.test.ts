import { describe, it, expect } from 'vitest';
import { sanitizeMeasureDescription } from './text';

describe('sanitizeMeasureDescription', () => {
    it('should remove the exact arc code prefix from description', () => {
        expect(sanitizeMeasureDescription('2.1111', '2.1111 - Upgrade lighting')).toBe('Upgrade lighting');
        expect(sanitizeMeasureDescription('2.1111', '2.1111: Upgrade lighting')).toBe('Upgrade lighting');
        expect(sanitizeMeasureDescription('2.1111', '2.1111 Upgrade lighting')).toBe('Upgrade lighting');
    });

    it('should strip leading "- " prefix even without arc code', () => {
        expect(sanitizeMeasureDescription('2.1111', '- Upgrade lighting')).toBe('Upgrade lighting');
        expect(sanitizeMeasureDescription('2.1111', '-  Spaced description')).toBe('Spaced description');
    });

    it('should handle missing descriptions or arc codes safely', () => {
        expect(sanitizeMeasureDescription('2.1111', '')).toBe('');
        expect(sanitizeMeasureDescription('', 'Upgrade lighting')).toBe('Upgrade lighting');
    });

    it('should not remove the arc code if it is not at the beginning', () => {
        expect(sanitizeMeasureDescription('2.1111', 'Upgrade 2.1111 lighting')).toBe('Upgrade 2.1111 lighting');
    });
});
