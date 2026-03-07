import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveNaicsScopeForMeasureCCE, normalizeNaics } from './naicsFallback';
import { api } from '../api/client';
import type { MeasureDistributionResponse } from '../types';

vi.mock('../api/client', () => ({
    api: {
        getMeasureDistributions: vi.fn(),
    },
}));

const mockDistResponse = (cceCount: number): MeasureDistributionResponse => ({
    gross_savings: [],
    payback: [],
    cce_primary: Array(cceCount).fill(1.5),
    count: Math.max(cceCount, 10),
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
        mockApi.mockResolvedValueOnce(mockDistResponse(6));

        const result = await resolveNaicsScopeForMeasureCCE({
            selectedNaics: '32221',
            arcCode: 'EXACT-MATCH',
            minValidN: 5,
        });

        expect(mockApi).toHaveBeenCalledTimes(1);
        expect(mockApi).toHaveBeenCalledWith('32221', 'EXACT-MATCH', undefined);
        expect(result.scope).toBe('exact');
        expect(result.reason).toBe('ok');
        expect(result.validCount).toBe(6);
    });

    it('broadens to prefix when exact has data but is below minValidN and prefix meets minValidN', async () => {
        const mockApi = api.getMeasureDistributions as any;
        mockApi.mockResolvedValueOnce(mockDistResponse(1)); // exact insufficient
        mockApi.mockResolvedValueOnce(mockDistResponse(6)); // prefix sufficient

        const result = await resolveNaicsScopeForMeasureCCE({
            selectedNaics: '32221',
            arcCode: 'BROADEN-FOR-STABILITY',
            minValidN: 5,
        });

        expect(mockApi).toHaveBeenCalledTimes(2);
        expect(mockApi).toHaveBeenNthCalledWith(1, '32221', 'BROADEN-FOR-STABILITY', undefined);
        expect(mockApi).toHaveBeenNthCalledWith(2, '3222', 'BROADEN-FOR-STABILITY', undefined);
        expect(result.scope).toBe('prefix');
        expect(result.usedNaicsPrefix).toBe('3222');
        expect(result.reason).toBe('ok');
        expect(result.validCount).toBe(6);
    });

    it('keeps best insufficient prefix when none reach minValidN', async () => {
        const mockApi = api.getMeasureDistributions as any;
        mockApi.mockResolvedValueOnce(mockDistResponse(1)); // 32221
        mockApi.mockResolvedValueOnce(mockDistResponse(4)); // 3222
        mockApi.mockResolvedValueOnce(mockDistResponse(4)); // 322 (tie -> keep 3222, more specific)

        const result = await resolveNaicsScopeForMeasureCCE({
            selectedNaics: '32221',
            arcCode: 'BEST-INSUFFICIENT',
            minNaicsDigits: 3,
            minValidN: 5,
        });

        expect(mockApi).toHaveBeenCalledTimes(3);
        expect(result.scope).toBe('prefix');
        expect(result.usedNaicsPrefix).toBe('3222');
        expect(result.reason).toBe('insufficient_data');
        expect(result.validCount).toBe(4);
    });

    it('falls back to all only if every prefix down to min digits has zero', async () => {
        const mockApi = api.getMeasureDistributions as any;
        mockApi.mockResolvedValueOnce(mockDistResponse(0)); // 3323
        mockApi.mockResolvedValueOnce(mockDistResponse(0)); // 332
        mockApi.mockResolvedValueOnce(mockDistResponse(8)); // all

        const result = await resolveNaicsScopeForMeasureCCE({
            selectedNaics: '3323',
            arcCode: 'ALL-FALLBACK',
            minNaicsDigits: 3,
            minValidN: 5,
        });

        expect(mockApi).toHaveBeenCalledTimes(3);
        expect(mockApi).toHaveBeenNthCalledWith(1, '3323', 'ALL-FALLBACK', undefined);
        expect(mockApi).toHaveBeenNthCalledWith(2, '332', 'ALL-FALLBACK', undefined);
        expect(mockApi).toHaveBeenNthCalledWith(3, '', 'ALL-FALLBACK', undefined);
        expect(result.scope).toBe('all');
        expect(result.reason).toBe('ok');
        expect(result.validCount).toBe(8);
    });

    it('normalizes NAICS before prefix iteration', async () => {
        const mockApi = api.getMeasureDistributions as any;
        mockApi.mockResolvedValueOnce(mockDistResponse(0)); // 32221
        mockApi.mockResolvedValueOnce(mockDistResponse(5)); // 3222

        const result = await resolveNaicsScopeForMeasureCCE({
            selectedNaics: '32-221',
            arcCode: 'NORMALIZED',
            minValidN: 5,
        });

        expect(mockApi).toHaveBeenNthCalledWith(1, '32221', 'NORMALIZED', undefined);
        expect(mockApi).toHaveBeenNthCalledWith(2, '3222', 'NORMALIZED', undefined);
        expect(result.usedNaicsPrefix).toBe('3222');
    });

    it('returns no_data_found when all scopes are empty', async () => {
        const mockApi = api.getMeasureDistributions as any;
        mockApi.mockResolvedValue(mockDistResponse(0));

        const result = await resolveNaicsScopeForMeasureCCE({
            selectedNaics: '3323',
            arcCode: 'NO-DATA',
            minNaicsDigits: 3,
        });

        expect(result.scope).toBe('all');
        expect(result.reason).toBe('no_data_found');
        expect(result.validCount).toBe(0);
    });
});
