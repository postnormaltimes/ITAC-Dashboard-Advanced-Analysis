import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveNaicsScopeForMeasureCCE, normalizeNaics } from './naicsFallback';
import { api } from '../api/client';
import type { MeasureDistributionResponse } from '../types';

// Mock the API client
vi.mock('../api/client', () => ({
    api: {
        getMeasureDistributions: vi.fn(),
    },
}));

// Helper to mock a response with a specific number of valid CCE entries
const mockDistResponse = (cceCount: number): MeasureDistributionResponse => ({
    gross_savings: [],
    payback: [],
    cce_primary: Array(cceCount).fill(1.5),
    count: Math.max(cceCount, 10), // mock some total count
});

describe('normalizeNaics', () => {
    it('strips non-digits from NAICS', () => {
        expect(normalizeNaics('32-221')).toBe('32221');
        expect(normalizeNaics('3323A')).toBe('3323');
    });
});

describe('resolveNaicsScopeForMeasureCCE', () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('returns exact scope if minValidN is met immediately', async () => {
        const mockApi = api.getMeasureDistributions as any;
        mockApi.mockResolvedValueOnce(mockDistResponse(6)); // 6 >= 5

        const result = await resolveNaicsScopeForMeasureCCE({
            selectedNaics: '32221',
            arcCode: 'EXACT-MATCH',
        });

        expect(mockApi).toHaveBeenCalledTimes(1);
        expect(mockApi).toHaveBeenCalledWith('32221', 'EXACT-MATCH', undefined);
        expect(result.scope).toBe('exact');
        expect(result.usedNaicsPrefix).toBe('32221');
        expect(result.reason).toBe('ok');
        expect(result.validCount).toBe(6);
    });

    it('falls back to prefix if exact is insufficient but prefix is sufficient', async () => {
        const mockApi = api.getMeasureDistributions as any;

        // 1. Exact match '32221' has 2 valid (falls short of 5)
        mockApi.mockResolvedValueOnce(mockDistResponse(2));

        // 2. Prefix '3222' has 6 valid (meets 5)
        mockApi.mockResolvedValueOnce(mockDistResponse(6));

        const result = await resolveNaicsScopeForMeasureCCE({
            selectedNaics: '32221',
            arcCode: 'PREFIX-MATCH',
        });

        expect(mockApi).toHaveBeenCalledTimes(2);
        expect(mockApi).toHaveBeenNthCalledWith(1, '32221', 'PREFIX-MATCH', undefined);
        expect(mockApi).toHaveBeenNthCalledWith(2, '3222', 'PREFIX-MATCH', undefined);

        expect(result.scope).toBe('prefix');
        expect(result.usedNaicsPrefix).toBe('3222');
        expect(result.reason).toBe('ok');
        expect(result.validCount).toBe(6);
    });

    it('falls back to all if no prefix down to minNaicsDigits meets minValidN', async () => {
        const mockApi = api.getMeasureDistributions as any;

        // Let's use a 5-digit NAICS and set minNaicsDigits=4 so there are 2 prefix checks
        // 32221 -> 0 valid
        mockApi.mockResolvedValueOnce(mockDistResponse(0));
        // 3222 -> 0 valid
        mockApi.mockResolvedValueOnce(mockDistResponse(0));

        // 'all' -> 20 valid
        mockApi.mockResolvedValueOnce(mockDistResponse(20));

        const result = await resolveNaicsScopeForMeasureCCE({
            selectedNaics: '32221',
            arcCode: 'ALL-MATCH',
            minNaicsDigits: 4,
            minValidN: 5,
        });

        // 32221 (len 5), 3222 (len 4), then falls back to all
        expect(mockApi).toHaveBeenCalledTimes(3);
        expect(mockApi).toHaveBeenNthCalledWith(1, '32221', 'ALL-MATCH', undefined);
        expect(mockApi).toHaveBeenNthCalledWith(2, '3222', 'ALL-MATCH', undefined);
        expect(mockApi).toHaveBeenNthCalledWith(3, '', 'ALL-MATCH', undefined); // Fallback

        expect(result.scope).toBe('all');
        expect(result.usedNaicsPrefix).toBeNull();
        expect(result.reason).toBe('ok');
        expect(result.validCount).toBe(20);
    });

    it('returns best inadequate prefix if none hit minValidN (Algorithm 4)', async () => {
        const mockApi = api.getMeasureDistributions as any;

        // 32221 -> 1 valid
        mockApi.mockResolvedValueOnce(mockDistResponse(1));
        // 3222 -> 2 valid
        mockApi.mockResolvedValueOnce(mockDistResponse(2));
        // 322 -> 3 valid
        mockApi.mockResolvedValueOnce(mockDistResponse(3));

        const result = await resolveNaicsScopeForMeasureCCE({
            selectedNaics: '32221',
            arcCode: 'MAX-INVALID',
            minNaicsDigits: 3,
            minValidN: 10,
        });

        // It should NOT fall back to 'all' because 322 had 3 valid CCE which is > 0
        expect(mockApi).toHaveBeenCalledTimes(3);
        expect(mockApi).toHaveBeenNthCalledWith(1, '32221', 'MAX-INVALID', undefined);
        expect(mockApi).toHaveBeenNthCalledWith(2, '3222', 'MAX-INVALID', undefined);
        expect(mockApi).toHaveBeenNthCalledWith(3, '322', 'MAX-INVALID', undefined);

        expect(result.scope).toBe('prefix');
        expect(result.usedNaicsPrefix).toBe('322');
        expect(result.reason).toBe('insufficient_data');
        expect(result.validCount).toBe(3);
    });

    it('handles tie-breaking by picking the most specific insufficient prefix if none hit minValidN', async () => {
        const mockApi = api.getMeasureDistributions as any;

        // 32221 -> 1 valid
        mockApi.mockResolvedValueOnce(mockDistResponse(1));
        // 3222 -> 4 valid
        mockApi.mockResolvedValueOnce(mockDistResponse(4));
        // 322 -> 4 valid (tie, but 3222 is more specific)
        mockApi.mockResolvedValueOnce(mockDistResponse(4));

        const result = await resolveNaicsScopeForMeasureCCE({
            selectedNaics: '32221',
            arcCode: 'TIE-BREAK',
            minValidN: 10,
        });

        expect(result.scope).toBe('prefix');
        expect(result.usedNaicsPrefix).toBe('3222'); // 3222 evaluated before 322, strict greater-than keeps 3222
        expect(result.reason).toBe('insufficient_data');
        expect(result.validCount).toBe(4);
    });

    it('falls back to ALL ONLY IF absolutely zero data exists in all prefixes', async () => {
        const mockApi = api.getMeasureDistributions as any;

        // All prefix checks return 0 valid
        mockApi.mockResolvedValueOnce(mockDistResponse(0)); // 332
        mockApi.mockResolvedValueOnce(mockDistResponse(10)); // 'all' -> 10 valid

        const result = await resolveNaicsScopeForMeasureCCE({
            selectedNaics: '332',
            arcCode: 'NO-DATA-PREFIX',
            minNaicsDigits: 3,
            minValidN: 5,
        });

        expect(mockApi).toHaveBeenCalledTimes(2);
        expect(mockApi).toHaveBeenNthCalledWith(1, '332', 'NO-DATA-PREFIX', undefined);
        expect(mockApi).toHaveBeenNthCalledWith(2, '', 'NO-DATA-PREFIX', undefined);

        expect(result.scope).toBe('all');
        expect(result.reason).toBe('ok');
        expect(result.validCount).toBe(10);
    });

    it('returns all with no_data_found if absolutely zero data exists anywhere', async () => {
        const mockApi = api.getMeasureDistributions as any;

        // All prefix checks return 0 valid
        mockApi.mockResolvedValue(mockDistResponse(0));

        const result = await resolveNaicsScopeForMeasureCCE({
            selectedNaics: '33',  // skipped because minNaicsDigits=3
            arcCode: 'NO-DATA-ANYWHERE',
            minNaicsDigits: 3,
        });

        expect(mockApi).toHaveBeenCalledTimes(1);
        expect(mockApi).toHaveBeenCalledWith('', 'NO-DATA-ANYWHERE', undefined);

        expect(result.scope).toBe('all');
        expect(result.reason).toBe('no_data_found');
        expect(result.validCount).toBe(0);
    });
});
