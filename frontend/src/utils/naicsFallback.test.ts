import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveNaicsScopeForMeasureCCE, normalizeNaics } from './naicsFallback';
import { api } from '../api/client';

// Mock the API client
vi.mock('../api/client', () => ({
    api: {
        getMeasureDistributions: vi.fn(),
    },
}));

describe('naicsFallback utility', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // The naicsFallback utility has a module-level cache we want to ignore across tests
        // Unfortunately it's not exported, so we rely on unique MIN_VALID_N or minNaicsDigits or selectedNaics
    });

    it('should normalize NAICS correctly', () => {
        expect(normalizeNaics('32221 ')).toBe('32221');
        expect(normalizeNaics('322-21')).toBe('32221');
        expect(normalizeNaics('A32221')).toBe('32221');
    });

    it('should resolve to exact scope when exact NAICS has sufficient data', async () => {
        vi.mocked(api.getMeasureDistributions).mockResolvedValueOnce({
            count: 10,
            gross_savings: [],
            payback: [],
            cce_primary: [1, 2, 3, 4, 5], // 5 valid samples
        });

        const result = await resolveNaicsScopeForMeasureCCE({
            selectedNaics: '32221',
            arcCode: '2.4236',
            minValidN: 5,
        });

        expect(result.scope).toBe('exact');
        expect(result.usedNaicsPrefix).toBe('32221');
        expect(result.reason).toBe('ok');
        expect(result.validCount).toBe(5);
        expect(api.getMeasureDistributions).toHaveBeenCalledTimes(1);
    });

    it('should fallback to broader prefix when exact NAICS has insufficient data', async () => {
        // 32221 -> 0 samples
        vi.mocked(api.getMeasureDistributions).mockResolvedValueOnce({
            count: 0,
            gross_savings: [],
            payback: [],
            cce_primary: [],
        });

        // 3222 -> 5 samples
        vi.mocked(api.getMeasureDistributions).mockResolvedValueOnce({
            count: 5,
            gross_savings: [],
            payback: [],
            cce_primary: [1, 2, 3, 4, 5],
        });

        const result = await resolveNaicsScopeForMeasureCCE({
            selectedNaics: '32221',
            arcCode: '9.99', // using unique arc code to bust internal cache
            minValidN: 5,
        });

        expect(result.scope).toBe('prefix');
        expect(result.usedNaicsPrefix).toBe('3222');
        expect(result.reason).toBe('ok');
        expect(result.validCount).toBe(5);
    });

    it('should stop at 3 digits and fall back to ALL if 3-digit also fails', async () => {
        // 32221 -> 0
        vi.mocked(api.getMeasureDistributions).mockResolvedValueOnce({
            count: 0, gross_savings: [], payback: [], cce_primary: [],
        });
        // 3222 -> 0
        vi.mocked(api.getMeasureDistributions).mockResolvedValueOnce({
            count: 0, gross_savings: [], payback: [], cce_primary: [],
        });
        // 322 -> 0
        vi.mocked(api.getMeasureDistributions).mockResolvedValueOnce({
            count: 0, gross_savings: [], payback: [], cce_primary: [],
        });
        // ALL -> 5
        vi.mocked(api.getMeasureDistributions).mockResolvedValueOnce({
            count: 5, gross_savings: [], payback: [], cce_primary: [1, 2, 3, 4, 5],
        });

        const result = await resolveNaicsScopeForMeasureCCE({
            selectedNaics: '32221',
            arcCode: '8.88',
            minNaicsDigits: 3,
            minValidN: 5,
        });

        expect(result.scope).toBe('all');
        expect(result.usedNaicsPrefix).toBeNull();
        expect(result.validCount).toBe(5);
        // Ensure we only checked down to 3 digits before branching to ALL
        expect(api.getMeasureDistributions).toHaveBeenCalledTimes(4); // 32221, 3222, 322, ALL
    });

    it('should choose the best invalid scope if none meet minN but some have > 0', async () => {
        // 32221 -> 1
        vi.mocked(api.getMeasureDistributions).mockResolvedValueOnce({
            count: 1, gross_savings: [], payback: [], cce_primary: [1.1],
        });
        // 3222 -> 2
        vi.mocked(api.getMeasureDistributions).mockResolvedValueOnce({
            count: 2, gross_savings: [], payback: [], cce_primary: [1.1, 2.2],
        });
        // 322 -> 2 (same max valid size, should prefer more specific '3222')
        vi.mocked(api.getMeasureDistributions).mockResolvedValueOnce({
            count: 2, gross_savings: [], payback: [], cce_primary: [1.1, 2.2],
        });

        const result = await resolveNaicsScopeForMeasureCCE({
            selectedNaics: '32221',
            arcCode: '7.77',
            minValidN: 5,
        });

        expect(result.scope).toBe('prefix');
        expect(result.usedNaicsPrefix).toBe('3222');
        expect(result.reason).toBe('insufficient_data');
        expect(result.validCount).toBe(2);
    });
});
